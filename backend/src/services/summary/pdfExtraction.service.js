// FR-08 Stage 1: PDF text extraction with real page numbers and bounding boxes.
//
// Output contract (consumed by gemini.service.js and the later queue stage):
//   {
//     sha256:    string,            // SHA-256 of the raw PDF bytes (NFR-10 cache key)
//     pageCount: number,
//     pages:     [{ pageNumber, width, height }],   // PDF points, rotation applied
//     passages:  [Passage]
//   }
//   Passage = {
//     id:          "p<page>-<seq>-<hash8>",   // deterministic for identical content
//     pageNumber:  number,                    // 1-based
//     text:        string,
//     boundingBox: { x, y, width, height } | null
//   }
// boundingBox values are fractions (0..1) of the page, origin at the TOP-LEFT of
// the page as displayed. They are computed from the positions pdf.js reports for
// the text; they are never estimated. null means no position could be derived.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export class PdfExtractionError extends Error {
  /**
   * @param {string} message
   * @param {"INVALID_PDF"|"PASSWORD_PROTECTED"|"NO_TEXT_LAYER"|"TOO_MANY_PAGES"|"FILE_NOT_FOUND"|"EXTRACTION_FAILED"} code
   */
  constructor(message, code, options) {
    super(message, options);
    this.name = "PdfExtractionError";
    this.code = code;
  }
}

const DEFAULTS = {
  maxPages: 50,
  maxPassageChars: 1200,
  // A new passage starts when the vertical gap exceeds this many line heights.
  paragraphGapFactor: 0.9,
};

let pdfjsPromise;
function loadPdfjs() {
  // Legacy build is the one that supports Node.js. Loaded lazily so importing
  // this module (e.g. in unit tests of other services) stays cheap.
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const round = (n) => Math.round(n * 1e6) / 1e6;
const clamp01 = (n) => Math.min(1, Math.max(0, n));

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function makePassageId(pageNumber, seq, text) {
  const hash = createHash("sha256")
    .update(normalizeWhitespace(text).toLowerCase())
    .digest("hex")
    .slice(0, 8);
  return `p${pageNumber}-${seq}-${hash}`;
}

/**
 * Convert one pdf.js text item to a rectangle in viewport (top-left origin)
 * coordinates, handling page rotation by transforming all four corners.
 * Returns null if the item has no usable geometry.
 */
function itemRect(item, viewportTransform, Util) {
  const t = item.transform;
  if (!Array.isArray(t) || t.length < 6 || !(item.width > 0)) return null;
  const scaleX = Math.hypot(t[0], t[1]);
  if (!(scaleX > 0)) return null;

  const m = Util.transform(viewportTransform, t);
  const wLocal = item.width / scaleX; // width in text-space (em) units
  const corners = [
    [0, 0],
    [wLocal, 0],
    [wLocal, 1],
    [0, 1],
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);

  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const rect = {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
  if (![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)) return null;
  return rect;
}

/** Group a page's text items into visual lines, preserving content order. */
function buildLines(items, viewportTransform, Util) {
  const lines = [];
  let current = null;

  const flush = () => {
    if (current && current.text.trim()) lines.push(current);
    current = null;
  };

  for (const item of items) {
    if (typeof item.str !== "string") continue;
    const rect = item.str.trim() ? itemRect(item, viewportTransform, Util) : null;

    if (rect) {
      const height = rect.bottom - rect.top;
      const centerY = (rect.top + rect.bottom) / 2;
      const horizontalGapFromCurrent = current?.rect ? rect.left - current.rect.right : 0;
      const sameLine =
        current &&
        current.rect &&
        Math.abs(centerY - current.centerY) <= Math.max(height, current.height) * 0.5 &&
        rect.left >= current.rect.left - 1 &&
        // Prevent text in a neighbouring column at the same vertical position
        // from being fused into one visual line.
        horizontalGapFromCurrent <= Math.max(height, current.height) * 2.5;
      if (!sameLine) {
        flush();
        current = { text: "", rect: null, centerY, height };
      }
      // PDF parsers often split a visual line into separate text items. Their
      // strings do not always include spaces, so infer a separator from the
      // measured horizontal gap while preserving explicit whitespace.
      const horizontalGap = current.rect ? rect.left - current.rect.right : 0;
      const gapThreshold = Math.max(height, current.height) * 0.16;
      const needsSpace =
        current.text.length > 0 &&
        !/\s$/.test(current.text) &&
        !/^\s/.test(item.str) &&
        horizontalGap > gapThreshold &&
        !/[-\u2010\u2011]$/.test(current.text);
      current.text += (needsSpace ? " " : "") + item.str;
      current.centerY = centerY;
      current.height = Math.max(current.height, height);
      current.rect = current.rect
        ? {
            left: Math.min(current.rect.left, rect.left),
            top: Math.min(current.rect.top, rect.top),
            right: Math.max(current.rect.right, rect.right),
            bottom: Math.max(current.rect.bottom, rect.bottom),
          }
        : { ...rect };
    } else if (current) {
      // whitespace-only item: keep spacing inside the current line
      current.text += item.str;
    }

    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

function joinLineTexts(lineTexts) {
  let out = "";
  for (const raw of lineTexts) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!out) out = line;
    else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line; // de-hyphenate
    else out += " " + line;
  }
  return out;
}

/** Group lines into passages (paragraph-like blocks) on one page. */
function buildPassagesForPage(lines, pageNumber, pageWidth, pageHeight, opts) {
  const groups = [];
  let group = null;

  for (const line of lines) {
    const prev = group?.lines[group.lines.length - 1];
    let startNew = !group;
    if (group && prev) {
      const gap = line.rect.top - prev.rect.bottom;
      const lineHeight = Math.max(prev.height, line.height);
      const jumpedUp = line.rect.top < prev.rect.top - lineHeight; // e.g. next column
      const changedColumn = Math.abs(line.rect.left - prev.rect.left) > pageWidth * 0.25;
      const projected = group.chars + line.text.length;
      startNew =
        gap > lineHeight * opts.paragraphGapFactor ||
        jumpedUp ||
        changedColumn ||
        projected > opts.maxPassageChars;
    }
    if (startNew) {
      group = { lines: [], chars: 0 };
      groups.push(group);
    }
    group.lines.push(line);
    group.chars += line.text.length + 1;
  }

  const passages = [];
  for (const g of groups) {
    const text = joinLineTexts(g.lines.map((l) => l.text));
    if (!text) continue;
    const left = Math.min(...g.lines.map((l) => l.rect.left));
    const top = Math.min(...g.lines.map((l) => l.rect.top));
    const right = Math.max(...g.lines.map((l) => l.rect.right));
    const bottom = Math.max(...g.lines.map((l) => l.rect.bottom));

    const x = clamp01(left / pageWidth);
    const y = clamp01(top / pageHeight);
    const x2 = clamp01(right / pageWidth);
    const y2 = clamp01(bottom / pageHeight);
    const boundingBox =
      pageWidth > 0 && pageHeight > 0 && x2 > x && y2 > y
        ? { x: round(x), y: round(y), width: round(x2 - x), height: round(y2 - y) }
        : null;

    const seq = passages.length + 1;
    passages.push({ id: makePassageId(pageNumber, seq, text), pageNumber, text, boundingBox });
  }
  return passages;
}

/**
 * Extract passages from a PDF.
 *
 * @param {string|Buffer|Uint8Array} source - file path or PDF bytes
 * @param {{maxPages?:number, maxPassageChars?:number, paragraphGapFactor?:number}} [options]
 */
export async function extractPdfPassages(source, options = {}) {
  const opts = { ...DEFAULTS, ...options };

  let bytes;
  if (typeof source === "string") {
    try {
      bytes = await readFile(source);
    } catch (error) {
      throw new PdfExtractionError("PDF file could not be read.", "FILE_NOT_FOUND", { cause: error });
    }
  } else if (source instanceof Uint8Array) {
    bytes = source;
  } else {
    throw new PdfExtractionError("Source must be a file path or a Buffer.", "INVALID_PDF");
  }

  const sha256 = sha256Hex(bytes);
  const { getDocument, Util } = await loadPdfjs();

  // pdf.js transfers (detaches) the buffer it is given, so hand it a copy.
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    if (error?.name === "PasswordException") {
      throw new PdfExtractionError("PDF is password protected.", "PASSWORD_PROTECTED", { cause: error });
    }
    throw new PdfExtractionError("File is not a readable PDF.", "INVALID_PDF", { cause: error });
  }

  try {
    if (doc.numPages > opts.maxPages) {
      throw new PdfExtractionError(
        `PDF has ${doc.numPages} pages; the limit is ${opts.maxPages}.`,
        "TOO_MANY_PAGES"
      );
    }

    const pages = [];
    const passages = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        pages.push({ pageNumber, width: round(viewport.width), height: round(viewport.height) });
        const lines = buildLines(content.items, viewport.transform, Util);
        passages.push(
          ...buildPassagesForPage(lines, pageNumber, viewport.width, viewport.height, opts)
        );
      } finally {
        page.cleanup();
      }
    }

    if (passages.length === 0) {
      throw new PdfExtractionError(
        "PDF has no extractable text (it may be a scanned image; OCR is not supported).",
        "NO_TEXT_LAYER"
      );
    }

    return { sha256, pageCount: doc.numPages, pages, passages };
  } catch (error) {
    if (error instanceof PdfExtractionError) throw error;
    throw new PdfExtractionError("Failed to extract text from PDF.", "EXTRACTION_FAILED", { cause: error });
  } finally {
    await doc.destroy();
  }
}
