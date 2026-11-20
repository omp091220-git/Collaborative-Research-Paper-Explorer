/**
 * extractionWorkerThread.js
 *
 * FR-09 Phase 3.3.1: Isolated PDF Extraction Worker Thread.
 *
 * Runs inside a Node.js Worker Thread to isolate CPU-intensive PDF rendering
 * and geometry analysis from the main application and supervisor loop.
 * Integrates Phase 3.1 & Phase 3.2 utilities:
 * - PDF.js document reading
 * - Page geometry & caption extraction
 * - Figure/table region detection & spatial association
 * - Sub-rectangle rendering & crop generation via @napi-rs/canvas
 * - Attempt-specific isolated staging writes via assetStagingManager
 */

import { isMainThread, parentPort } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import { detectRegions } from "../utils/figureTableRegionDetector.js";
import { cropRegionFromPage, DEFAULT_RENDER_SCALE } from "../utils/regionCropper.js";
import {
  createStagingDirectory,
  cleanStagingDirectory,
  AssetStagingError,
  validateStagedAsset,
} from "../utils/assetStagingManager.js";
import {
  extractNativeImageForRegion,
  isNativeImageExtractionEnabled,
} from "../utils/nativeImageExtractor.js";

const PDFJS_MODULE_DIRECTORY = path.dirname(
  fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"))
);
const PDFJS_STANDARD_FONTS_DIRECTORY = path.resolve(PDFJS_MODULE_DIRECTORY, "../../standard_fonts");
const STANDARD_PDF_FONT_NAMES = new Set([
  "Courier", "Courier-Bold", "Courier-BoldOblique", "Courier-Oblique",
  "Helvetica", "Helvetica-Bold", "Helvetica-BoldOblique", "Helvetica-Oblique",
  "Symbol", "Times-Bold", "Times-BoldItalic", "Times-Italic", "Times-Roman",
  "ZapfDingbats",
]);

function normalizedPdfFontName(name) {
  return typeof name === "string" ? name.replace(/^[A-Z]{6}\+/, "") : null;
}

function canUseBundledStandardFontRenderer(fonts) {
  return fonts.some((font) => ["Symbol", "ZapfDingbats"].includes(normalizedPdfFontName(font.name))) &&
    fonts.length > 0 &&
    fonts.every((font) => font.fontObjectResolved && (
      font.hasEmbeddedFontProgram || STANDARD_PDF_FONT_NAMES.has(normalizedPdfFontName(font.name))
    ));
}

function inspectResolvedPdfFonts(page, fontIds = []) {
  return fontIds.map((id) => {
    try {
      const font = page.commonObjs?.get(id);
      if (!font) return { id, fontObjectResolved: false };
      return {
        id,
        fontObjectResolved: true,
        name: font.name || null,
        fallbackName: font.fallbackName || null,
        hasEmbeddedFontProgram: Boolean(font.data),
        matchedSystemFont: Boolean(font.systemFontInfo),
        missingFile: Boolean(font.missingFile),
        invalidFont: Boolean(font.isInvalidPDFjsFont),
      };
    } catch {
      return { id, fontObjectResolved: false };
    }
  });
}

function safeFontFamilyName(name) {
  const normalized = normalizedPdfFontName(name);
  if (!normalized || normalized.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 ._+()\-]*$/.test(normalized)) {
    return "unknown";
  }
  return normalized;
}

/**
 * Produces page-level font warnings without retaining text, font object IDs,
 * fallback implementation details, or paths. These signals describe font
 * resources only; they do not prove that any particular glyph is missing.
 */
export function buildFontRenderingDiagnostic(pageNumber, fonts = []) {
  const diagnosticCodes = new Set();
  const fontFamilyNames = new Set();

  for (const font of fonts) {
    fontFamilyNames.add(safeFontFamilyName(font.name));

    if (!font.fontObjectResolved || font.missingFile || font.invalidFont) {
      diagnosticCodes.add("font_resolution_problem");
    }

    if (!font.fontObjectResolved) continue;

    const isSupportedStandardFont = STANDARD_PDF_FONT_NAMES.has(normalizedPdfFontName(font.name));
    const isUnembedded = !font.hasEmbeddedFontProgram && !isSupportedStandardFont;
    if (font.hasEmbeddedFontProgram) diagnosticCodes.add("font_embedded");
    if (isSupportedStandardFont) diagnosticCodes.add("font_standard_supported");
    if (isUnembedded) diagnosticCodes.add("font_unembedded");
    if (font.matchedSystemFont) diagnosticCodes.add("font_fallback_used");
  }

  // Resource metadata alone never proves that all used glyphs rendered.
  if (fonts.length > 0) diagnosticCodes.add("glyph_rendering_unverified");

  return {
    pageNumber,
    fontFamilyNames: [...fontFamilyNames].sort(),
    diagnosticCodes: [...diagnosticCodes].sort(),
  };
}

export async function replaceStagedPng(stagedFilePath, nativeResult) {
  const temporaryPath = `${stagedFilePath}.${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, nativeResult.pngBuffer, { flag: "wx" });
    const validation = await validateStagedAsset(temporaryPath, "png");
    if (validation.width !== nativeResult.width || validation.height !== nativeResult.height) return null;
    await fs.promises.rename(temporaryPath, stagedFilePath);
    return validation;
  } catch {
    return null;
  } finally {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
  }
}

/**
 * Executes PDF extraction on a document and stages all visual assets.
 *
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.attemptId
 * @param {string} params.paperId
 * @param {string} params.pdfPath - Absolute path to source PDF
 * @param {string} [params.stagingBaseDir] - Custom base directory for staging
 * @param {number} [params.renderScale=2.0]
 * @param {function} [params.onProgress]
 * @param {{ isCancelled: boolean }} [params.cancellationRef]
 * @returns {Promise<{ assets: Array<object>, statistics: object }>}
 */
export async function executeExtraction({
  jobId,
  attemptId,
  paperId,
  pdfPath,
  stagingBaseDir,
  renderScale = DEFAULT_RENDER_SCALE,
  nativeImageExtractionEnabled = isNativeImageExtractionEnabled(),
  nativeImageExtractor = extractNativeImageForRegion,
  onProgress = () => {},
  cancellationRef = { isCancelled: false },
}) {
  if (!fs.existsSync(pdfPath)) {
    const err = new Error(`Source PDF file not found at path: ${pdfPath}`);
    err.code = "PDF_NOT_FOUND";
    throw err;
  }

  // Ensure staging directory exists
  await createStagingDirectory(jobId, attemptId, stagingBaseDir);

  const rawBytes = new Uint8Array(await fs.promises.readFile(pdfPath));
  const doc = await pdfjs.getDocument({
    data: rawBytes,
    standardFontDataUrl: `${PDFJS_STANDARD_FONTS_DIRECTORY}${path.sep}`,
    useSystemFonts: true,
    disableFontFace: false,
  }).promise;

  const totalPages = doc.numPages;
  const assets = [];
  const fontDiagnostics = [];
  const fontRenderingDiagnostics = [];
  let pageFailureCount = 0;
  let standardFontDoc = null;

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (cancellationRef.isCancelled) {
        await cleanStagingDirectory(jobId, attemptId, stagingBaseDir);
        const err = new Error("Extraction cancelled by supervisor");
        err.code = "EXTRACTION_CANCELLED";
        throw err;
      }

      onProgress({ page: pageNum, totalPages });

      let page;
      try {
        page = await doc.getPage(pageNum);
      } catch (pageErr) {
        pageFailureCount++;
        // If an individual page fails to parse, record and proceed with remaining pages
        continue;
      }

      let standardFontPage = null;
      try {
        let pageFontDiagnostic = null;
        const detectedRegions = await detectRegions(page, {
          onFontDiagnostics: (diagnostic) => { pageFontDiagnostic = diagnostic; },
        });

        const resolvedFonts = inspectResolvedPdfFonts(page, pageFontDiagnostic?.fontIds || []);
        fontRenderingDiagnostics.push(buildFontRenderingDiagnostic(pageNum, resolvedFonts));
        let renderPage = page;
        // PDF.js needs its bundled standard-font resources for Symbol and
        // Dingbats glyph paths. Use that renderer only when every page font is
        // embedded or one of the bundled standard fonts; unknown unembedded
        // fonts retain the established system-font fallback path.
        if (
          fs.existsSync(path.join(PDFJS_STANDARD_FONTS_DIRECTORY, "FoxitSymbol.pfb")) &&
          canUseBundledStandardFontRenderer(resolvedFonts)
        ) {
          try {
            if (!standardFontDoc) {
              standardFontDoc = await pdfjs.getDocument({
                data: new Uint8Array(await fs.promises.readFile(pdfPath)),
                standardFontDataUrl: `${PDFJS_STANDARD_FONTS_DIRECTORY}${path.sep}`,
                useSystemFonts: false,
                disableFontFace: true,
              }).promise;
            }
            standardFontPage = await standardFontDoc.getPage(pageNum);
            renderPage = standardFontPage;
          } catch {
            // Preserve the existing system-font rendering path if the optional
            // bundled-standard-font pass cannot be initialized for this page.
            if (standardFontPage?.cleanup) standardFontPage.cleanup();
            standardFontPage = null;
            renderPage = page;
          }
        }

        // Pre-render canvas once per page if regions exist to avoid multiple page re-renders
        let pageCanvas = null;

        for (let rIdx = 0; rIdx < detectedRegions.length; rIdx++) {
          if (cancellationRef.isCancelled) {
            await cleanStagingDirectory(jobId, attemptId, stagingBaseDir);
            const err = new Error("Extraction cancelled by supervisor");
            err.code = "EXTRACTION_CANCELLED";
            throw err;
          }

          const region = detectedRegions[rIdx];
          const assetOrder = region.readingOrderIndex || (rIdx + 1);
          const filename = `${region.assetType}_p${pageNum}_${assetOrder}.png`;

          try {
            const cropResult = await cropRegionFromPage(renderPage, region.bounds, {
              scale: renderScale,
              paddingPoints: region.cropPaddingPoints,
              renderedPageCanvas: pageCanvas,
              stagingDir: stagingBaseDir,
              jobId,
              attemptId,
              filename,
            });

            if (cropResult && cropResult.stagedAsset) {
              let fileSizeBytes = cropResult.pngBuffer.length;
              let width = cropResult.width;
              let height = cropResult.height;
              let extractionMethod = "pdfjs_crop";

              // The crop is always staged first and remains the fallback. Native
              // output replaces it only after geometry, pixels, and PNG storage
              // have all passed validation.
              if (nativeImageExtractionEnabled) {
                try {
                  const nativeResult = await nativeImageExtractor(
                    renderPage,
                    region,
                    detectedRegions,
                    pdfjs,
                    { renderScale }
                  );
                  if (nativeResult) {
                    const replacement = await replaceStagedPng(cropResult.stagedAsset.filePath, nativeResult);
                    if (replacement) {
                      fileSizeBytes = replacement.size;
                      width = replacement.width;
                      height = replacement.height;
                      extractionMethod = nativeResult.extractionMethod;
                    }
                  }
                } catch {
                  // PDF.js native object decoding is optional; retain the valid crop.
                }
              }

              assets.push({
                paperId,
                jobId,
                assetType: region.assetType, // 'figure' | 'table' | 'chart'
                pageNumber: pageNum,
                assetOrder,
                filename,
                stagedFilePath: cropResult.stagedAsset.filePath,
                fileSizeBytes,
                mimeType: "image/png",
                width,
                height,
                caption: region.caption ? region.caption.fullText : null,
                extractionMetadata: {
                  heuristicConfidence: region.heuristicConfidence,
                  detectionMethod: region.detectionMethod,
                  bounds: region.bounds,
                  cropRect: cropResult.cropRect,
                  paddingApplied: cropResult.paddingApplied,
                  miterDiagnostics: cropResult.miterDiagnostics,
                  ...region.metadata,
                  extractionMethod,
                },
              });
            }
          } catch {
            // Region crop failure does not abort other valid regions on the page
          }
        }

        // Record font resource state after any page rendering has resolved PDF.js
        // font objects. Diagnostics contain names/status only, never page text.
        if (pageFontDiagnostic) {
          fontDiagnostics.push({
            pageNumber: pageNum,
            ...pageFontDiagnostic,
            fonts: resolvedFonts,
          });
        }
      } finally {
        if (standardFontPage?.cleanup) {
          standardFontPage.cleanup();
        }
        if (page && typeof page.cleanup === "function") {
          page.cleanup();
        }
      }
    }

    if (cancellationRef.isCancelled) {
      await cleanStagingDirectory(jobId, attemptId, stagingBaseDir);
      const err = new Error("Extraction cancelled by supervisor");
      err.code = "EXTRACTION_CANCELLED";
      throw err;
    }
  } finally {
    if (standardFontDoc && typeof standardFontDoc.destroy === "function") {
      await standardFontDoc.destroy();
    }
    if (doc && typeof doc.destroy === "function") {
      await doc.destroy();
    }
  }

  return {
    assets,
    statistics: {
      totalPages,
      assetsExtracted: assets.length,
      pageFailureCount,
      fontDiagnostics,
      fontRenderingDiagnostics,
    },
  };
}

// ── Worker Thread Entrypoint ──────────────────────────────────────────────────
if (!isMainThread && parentPort) {
  const cancellationRef = { isCancelled: false };

  parentPort.on("message", async (msg) => {
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "CANCEL") {
      cancellationRef.isCancelled = true;
      return;
    }

    if (msg.type === "START") {
      try {
        const result = await executeExtraction({
          ...msg.payload,
          cancellationRef,
          onProgress: (p) => {
            parentPort.postMessage({ type: "PROGRESS", payload: p });
          },
        });

        parentPort.postMessage({ type: "COMPLETE", payload: result });
      } catch (err) {
        parentPort.postMessage({
          type: "ERROR",
          error: {
            message: err.message,
            code: err.code || "EXTRACTION_WORKER_ERROR",
          },
        });
      }
    }
  });
}

