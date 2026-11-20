/**
 * captionDetector.js
 *
 * FR-09 Phase 3.2: PDF Caption Anchor and Text Scanner.
 *
 * Scans PDF.js text items, extracts figure and table caption anchors,
 * accumulates multi-line captions, filters out body-text in-line citations,
 * and records page-space bounding boxes and font metadata.
 */

/**
 * Strict regex to detect the start of a figure caption.
 * Matches: "Figure 1:", "Fig. 2.", "Figure 3.1 —", "Figure 4(a):", "Fig 5:", "Figure 12-B.", "Figure A.1:"
 */
export const FIGURE_CAPTION_STARTER = /^\s*(?:Figure|Fig\.?)\s+([0-9]+[a-zA-Z]?(?:[.\-_][0-9a-zA-Z]+)*(?:\([a-zA-Z0-9]+\))?|[A-Z](?:[.\-_]?[0-9]+[a-zA-Z]?)?|[IVXLCDM]+)\s*([:.\-—])?(?:\s+(.*))?$/i;

/**
 * Strict regex to detect the start of a table caption.
 * Matches: "Table 1:", "Table 2.1.", "Table 3 —", "Table 4:", "Table 10-A:", "Table IV:"
 */
export const TABLE_CAPTION_STARTER = /^\s*Table\s+([0-9]+[a-zA-Z]?(?:[.\-_][0-9a-zA-Z]+)*(?:\([a-zA-Z0-9]+\))?|[A-Z](?:[.\-_]?[0-9]+[a-zA-Z]?)?|[IVXLCDM]+)\s*([:.\-—])?(?:\s+(.*))?$/i;

/**
 * Prefix pattern to identify potential split caption starters.
 * Matches: "Figure", "Fig.", "Fig", "Table"
 */
export const SPLIT_LABEL_PREFIX = /^\s*(?:Figure|Fig\.?|Table)\s*$/i;

/**
 * Maximum vertical baseline difference in points for tokens on the same line.
 */
export const MAX_SPLIT_BASELINE_DIFF = 2.5;

/**
 * Maximum horizontal gap in points between adjacent tokens belonging to a split starter.
 */
export const MAX_SPLIT_HORIZONTAL_GAP = 20.0;

/**
 * Maximum number of adjacent items to look ahead when reconstructing a split starter.
 */
export const MAX_SPLIT_LOOKAHEAD = 3;

/**
 * Summarizes PDF.js text-font references without retaining or logging document text.
 * This detects unresolved PDF.js style references; it cannot detect every missing
 * glyph in a font that PDF.js reports as resolved.
 */
export function summarizeFontUsage(textContent = {}) {
  const items = (textContent.items || []).filter((item) => item && typeof item.str === "string");
  const styles = textContent.styles || {};
  const fontIds = [...new Set(items.map((item) => item.fontName).filter(Boolean))].sort();
  const fontFamilies = [...new Set(fontIds
    .map((fontId) => styles[fontId]?.fontFamily)
    .filter((family) => typeof family === "string" && family.length > 0))].sort();

  return {
    textItemCount: items.length,
    fontReferenceCount: fontIds.length,
    fontIds,
    unresolvedFontIds: fontIds.filter((fontId) => !styles[fontId]),
    fontFamilies,
  };
}

/** Converts a PDF.js text item into an axis-aligned PDF-user-space box. */
function getTextItemGeometry(item, style = {}) {
  const transform = item?.transform;
  if (!Array.isArray(transform) || transform.length < 6 || !Number.isFinite(item.width)) return null;

  const [a, b, c, d, x, y] = transform;
  const xLength = Math.hypot(a, b);
  const yLength = Math.hypot(c, d);
  const fontSize = yLength || xLength || Math.abs(d) || 9;
  const width = Math.max(0, item.width);
  if (!xLength || !yLength || !Number.isFinite(width)) return null;

  const ux = a / xLength;
  const uy = b / xLength;
  const vx = c / yLength;
  const vy = d / yLength;
  const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.8;
  const descent = Number.isFinite(style.descent) ? style.descent : -0.2;
  const heightScale = yLength || fontSize;
  const corners = [
    [x + vx * descent * heightScale, y + vy * descent * heightScale],
    [x + ux * width + vx * descent * heightScale, y + uy * width + vy * descent * heightScale],
    [x + vx * ascent * heightScale, y + vy * ascent * heightScale],
    [x + ux * width + vx * ascent * heightScale, y + uy * width + vy * ascent * heightScale],
  ];
  const xs = corners.map((point) => point[0]);
  const ys = corners.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    text: item.str,
    fontName: item.fontName || null,
    fontSize,
    transform,
    bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
  };
}

/**
 * Attempts to reconstruct a split caption starter across adjacent PDF.js text items
 * on the same visual baseline.
 *
 * @param {Array<object>} items - Text content items
 * @param {number} startIndex - Current item index
 * @param {number} fontHeight - Current item font height
 * @returns {{ match: RegExpExecArray, targetType: 'figure' | 'table', consumedCount: number } | null}
 */
export function tryReconstructSplitStarter(items, startIndex, fontHeight) {
  const firstItem = items[startIndex];
  const firstText = (firstItem.str || "").trim();

  if (!SPLIT_LABEL_PREFIX.test(firstText)) {
    return null;
  }

  let accumulated = firstText;
  let prevX = firstItem.transform[4];
  let prevW = firstItem.width || 0;
  const baseY = firstItem.transform[5];
  const maxGap = Math.max(MAX_SPLIT_HORIZONTAL_GAP, 1.5 * fontHeight);

  for (let j = startIndex + 1; j < Math.min(items.length, startIndex + 1 + MAX_SPLIT_LOOKAHEAD); j++) {
    const nextItem = items[j];
    if (!nextItem || typeof nextItem.str !== "string") break;

    const nextStr = nextItem.str.trim();
    if (!nextStr) continue;

    const nextY = nextItem.transform[5];
    const nextX = nextItem.transform[4];
    const nextW = nextItem.width || 0;

    // Validate that token belongs to the same visual line (baseline check)
    if (Math.abs(nextY - baseY) > MAX_SPLIT_BASELINE_DIFF) {
      break;
    }

    // Validate horizontal adjacency: next token must be to the right and within maxGap
    const gap = nextX - (prevX + prevW);
    if (gap < -2.0 || gap > maxGap) {
      break;
    }

    // Append token with single space
    accumulated += (accumulated.endsWith(" ") ? "" : " ") + nextStr;
    prevX = nextX;
    prevW = nextW;

    // Check if accumulated text now matches figure or table starter
    let match = FIGURE_CAPTION_STARTER.exec(accumulated);
    let targetType = "figure";
    if (!match) {
      match = TABLE_CAPTION_STARTER.exec(accumulated);
      targetType = "table";
    }

    if (match) {
      return {
        match,
        targetType,
        consumedCount: j - startIndex + 1,
      };
    }
  }

  return null;
}

/**
 * Common verbs/words that follow in-text citations rather than captions.
 * e.g., "Figure 1 shows", "Table 2 compares", "Fig. 3 illustrates", "see Figure 4".
 */
export const IN_TEXT_CITATION_VERBS = /^(?:shows?|compares?|illustrates?|presents?|depicts?|summarizes?|indicates?|displays?|lists?|reports?|demonstrates?|provides?|plots?|outlines?|and|or|was|were|is|are|in|with|from|see)\b/i;

/**
 * Normalizes internal whitespace in a caption string while preserving textual content.
 *
 * @param {string} str
 * @returns {string}
 */
export function normalizeCaptionWhitespace(str) {
  if (!str) return "";
  return str.replace(/\s+/g, " ").trim();
}

/**
 * Checks whether a text item is likely an in-text reference rather than a caption anchor.
 *
 * @param {string} fullText - Text following the figure/table number
 * @param {string|undefined} punctuation - Separator punctuation (: . - —)
 * @param {number} xPos - Left coordinate of the text item
 * @param {number} pageWidth - Page width
 * @returns {boolean} True if classified as an in-text citation
 */
export function isLikelyInTextCitation(fullText, punctuation, xPos, pageWidth) {
  // If there is an explicit separator punctuation (: or —), it is strongly a caption
  if (punctuation === ":" || punctuation === "—") {
    return false;
  }

  // If followed immediately by common citation verbs (e.g. "Figure 1 shows")
  const trimmed = (fullText || "").trim();
  if (IN_TEXT_CITATION_VERBS.test(trimmed)) {
    return true;
  }

  // If punctuation is absent and text flows immediately into lower-case sentence
  if (!punctuation && /^[a-z]/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Groups and accumulates multi-line caption text items following a caption starter.
 *
 * @param {Array<object>} items - TextContent items
 * @param {number} startIndex - Index of caption starter
 * @param {number} fontHeight - Height of the starter item
 * @returns {{ fullCaptionText: string, bounds: object, endIndex: number }}
 */
function accumulateCaptionLines(items, startIndex, fontHeight) {
  const starter = items[startIndex];
  let accumulatedText = starter.str;
  let minX = starter.transform[4];
  let maxX = starter.transform[4] + (starter.width || 0);
  let minY = starter.transform[5];
  let maxY = starter.transform[5] + fontHeight;
  let currentY = starter.transform[5];
  let lastIndex = startIndex;

  for (let j = startIndex + 1; j < items.length; j++) {
    const next = items[j];
    if (!next || !next.str) continue;

    const strTrim = next.str.trim();
    if (!strTrim) {
      // Empty spacer token; can expand bounding box slightly if on same line
      continue;
    }

    const nextX = next.transform[4];
    const nextY = next.transform[5];
    const nextH = Math.abs(next.transform[3]) || fontHeight;
    const deltaY = Math.abs(currentY - nextY);

    // If on the same horizontal baseline (deltaY < 2.5 pt)
    if (deltaY <= 2.5) {
      const horizontalGap = nextX - maxX;
      const maxLineGap = Math.max(MAX_SPLIT_HORIZONTAL_GAP, 2.5 * fontHeight);
      if (horizontalGap > maxLineGap || FIGURE_CAPTION_STARTER.test(strTrim) || TABLE_CAPTION_STARTER.test(strTrim)) {
        break;
      }
      accumulatedText += " " + next.str;
      minX = Math.min(minX, nextX);
      maxX = Math.max(maxX, nextX + (next.width || 0));
      minY = Math.min(minY, nextY);
      maxY = Math.max(maxY, nextY + nextH);
      lastIndex = j;
    }
    // If on a subsequent line (moving downwards in PDF y: deltaY <= 1.6 * fontHeight)
    else if (nextY < currentY && deltaY <= 1.8 * fontHeight) {
      // Font height must be consistent (within 20% of caption font)
      if (Math.abs(nextH - fontHeight) > 0.25 * fontHeight) {
        break; // Font size changed to body text
      }

      // Check if next item starts a NEW caption
      if (FIGURE_CAPTION_STARTER.test(strTrim) || TABLE_CAPTION_STARTER.test(strTrim)) {
        break;
      }

      accumulatedText += " " + next.str;
      currentY = nextY;
      minX = Math.min(minX, nextX);
      maxX = Math.max(maxX, nextX + (next.width || 0));
      minY = Math.min(minY, nextY);
      maxY = Math.max(maxY, nextY + nextH);
      lastIndex = j;
    } else {
      // Gap too large: paragraph break or separate element
      break;
    }
  }

  return {
    fullCaptionText: normalizeCaptionWhitespace(accumulatedText),
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
    endIndex: lastIndex,
  };
}

/**
 * Detects all figure and table captions on a PDF.js page.
 *
 * @param {object} page - PDF.js PageProxy
 * @returns {Promise<{
 *   captions: Array<{
 *     targetType: 'figure' | 'table',
 *     identifier: string,
 *     captionText: string,
 *     bounds: { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number },
 *     fontSize: number,
 *     fontName: string,
 *     confidence: number
 *   }>,
 *   hasExtractableText: boolean,
 *   itemCount: number
 * }>}
 */
export async function detectCaptions(page) {
  if (!page || typeof page.getTextContent !== "function") {
    throw new Error("detectCaptions: Invalid PDF page instance");
  }

  const textContent = await page.getTextContent();
  const rawItems = textContent.items || [];
  const items = rawItems.filter(it => it && typeof it.str === "string");

  const result = {
    captions: [],
    hasExtractableText: items.length > 0,
    itemCount: items.length,
    fontDiagnostics: summarizeFontUsage(textContent),
    textItems: items.map((item) => getTextItemGeometry(item, textContent.styles?.[item.fontName])).filter(Boolean),
  };

  if (items.length === 0) {
    return result;
  }

  const pageView = page.view || [0, 0, 612, 792];
  const pageWidth = Math.abs(pageView[2] - pageView[0]);

  let i = 0;
  while (i < items.length) {
    const item = items[i];
    const text = (item.str || "").trim();

    if (!text) {
      i++;
      continue;
    }

    let match = FIGURE_CAPTION_STARTER.exec(text);
    let targetType = "figure";

    if (!match) {
      match = TABLE_CAPTION_STARTER.exec(text);
      targetType = "table";
    }

    // If no match on single item, attempt split-token starter reconstruction
    if (!match) {
      const fontHeight = Math.abs(item.transform[3]) || 9.0;
      const splitResult = tryReconstructSplitStarter(items, i, fontHeight);
      if (splitResult) {
        match = splitResult.match;
        targetType = splitResult.targetType;
      }
    }

    if (match) {
      const identifier = match[1];
      const punctuation = match[2];
      const remainder = match[3] || "";
      const fontHeight = Math.abs(item.transform[3]) || 9.0;
      const xPos = item.transform[4];

      // Check if this is an in-text citation (e.g. "Figure 1 shows that...")
      const isCitation = isLikelyInTextCitation(remainder, punctuation, xPos, pageWidth);

      if (!isCitation) {
        // Accumulate multi-line caption starting from this item
        const { fullCaptionText, bounds, endIndex } = accumulateCaptionLines(items, i, fontHeight);

        // Assign heuristic confidence:
        // 0.95 if explicit separator (: or —), 0.85 if period or standalone
        const confidence = (punctuation === ":" || punctuation === "—") ? 0.95 : 0.85;

        result.captions.push({
          targetType,
          identifier,
          captionText: fullCaptionText,
          bounds,
          fontSize: fontHeight,
          fontName: item.fontName || "default",
          confidence,
        });

        i = endIndex + 1;
        continue;
      }
    }

    i++;
  }

  return result;
}
