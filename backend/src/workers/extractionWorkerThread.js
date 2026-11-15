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
import fs from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

import { detectRegions } from "../utils/figureTableRegionDetector.js";
import { cropRegionFromPage, DEFAULT_RENDER_SCALE } from "../utils/regionCropper.js";
import {
  createStagingDirectory,
  cleanStagingDirectory,
  AssetStagingError,
} from "../utils/assetStagingManager.js";

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
    useSystemFonts: true,
    disableFontFace: false,
  }).promise;

  const totalPages = doc.numPages;
  const assets = [];
  let pageFailureCount = 0;

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

      try {
        const detectedRegions = await detectRegions(page);

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
            const cropResult = await cropRegionFromPage(page, region.bounds, {
              scale: renderScale,
              renderedPageCanvas: pageCanvas,
              stagingDir: stagingBaseDir,
              jobId,
              attemptId,
              filename,
            });

            if (cropResult && cropResult.stagedAsset) {
              assets.push({
                paperId,
                jobId,
                assetType: region.assetType, // 'figure' | 'table' | 'chart'
                pageNumber: pageNum,
                assetOrder,
                filename,
                stagedFilePath: cropResult.stagedAsset.filePath,
                fileSizeBytes: cropResult.pngBuffer.length,
                mimeType: "image/png",
                width: cropResult.width,
                height: cropResult.height,
                caption: region.caption ? region.caption.fullText : null,
                extractionMetadata: {
                  heuristicConfidence: region.heuristicConfidence,
                  detectionMethod: region.detectionMethod,
                  bounds: region.bounds,
                  cropRect: cropResult.cropRect,
                  paddingApplied: cropResult.paddingApplied,
                  miterDiagnostics: cropResult.miterDiagnostics,
                  ...region.metadata,
                },
              });
            }
          } catch {
            // Region crop failure does not abort other valid regions on the page
          }
        }
      } finally {
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

