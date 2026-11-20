import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(__dirname, "../../..");
const WORKER_PATH = path.resolve(__dirname, "../workers/extractionWorkerThread.js");

const REAL_PDF_CASES = [
  { id: "arxiv-pikepdf-21p", file: "arxiv-2501.03505-1794913186478.pdf" },
  { id: "pdftex-1.40.25-15p", file: "seed-1793217481568-9owfqkssnn5.pdf" },
  { id: "pdftex-1.40.12-12p", file: "seed-1793217486586-2d7cvsmj3jm.pdf" },
  { id: "pdftex-1.40.21-20p", file: "seed-1793217487929-389n4mpvvtq.pdf" },
];

async function runExtractionWorker({ sampleId, pdfPath, stagingBaseDir }) {
  const worker = new Worker(WORKER_PATH, { execArgv: [] });
  const safeWorkerId = sampleId.replace(/[^A-Za-z0-9_-]/g, "_");
  try {
    return await new Promise((resolve, reject) => {
      worker.on("message", (message) => {
        if (message.type === "COMPLETE") resolve(message.payload);
        else if (message.type === "ERROR") {
          reject(new Error(`Worker extraction failed for ${sampleId}: ${message.error?.code || "UNKNOWN"}`));
        }
      });
      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0) reject(new Error(`Worker exited with code ${code} for ${sampleId}`));
      });
      worker.postMessage({
        type: "START",
        payload: {
          jobId: `fr09-${safeWorkerId}`,
          attemptId: "real-pdf-regression",
          paperId: `fr09-paper-${safeWorkerId}`,
          pdfPath,
          stagingBaseDir,
          renderScale: 1,
        },
      });
    });
  } finally {
    await worker.terminate();
  }
}

describe("FR-09 optional local real-PDF worker regressions", () => {
  for (const sample of REAL_PDF_CASES) {
    it(`${sample.id}: opens, extracts figure/table assets, and stages readable PNG files`, async (t) => {
      const pdfPath = path.join(REPOSITORY_ROOT, "uploads", sample.file);
      if (!fs.existsSync(pdfPath)) {
        t.skip(`Optional local PDF ${sample.id} is unavailable; synthetic FR-09 fixtures remain mandatory.`);
        return;
      }

      const stagingBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), `fr09-${sample.id}-`));
      try {
        const result = await runExtractionWorker({ sampleId: sample.id, pdfPath, stagingBaseDir });

        assert.ok(result.statistics.totalPages > 0, "Worker should process at least one page");
        assert.equal(result.statistics.pageFailureCount, 0, "No page should fail to parse");
        assert.ok(result.assets.some((asset) => asset.assetType === "figure"), "Expected at least one figure asset");
        assert.ok(result.assets.some((asset) => asset.assetType === "table"), "Expected at least one table asset");
        assert.equal(result.statistics.assetsExtracted, result.assets.length);

        for (const asset of result.assets) {
          assert.ok(Number.isInteger(asset.pageNumber) && asset.pageNumber >= 1 && asset.pageNumber <= result.statistics.totalPages);
          assert.ok(asset.width > 0 && asset.height > 0 && asset.width <= 4096 && asset.height <= 4096,
            "Asset dimensions should be positive and within a broad raster safety bound");
          assert.ok(fs.existsSync(asset.stagedFilePath), `Expected staged asset for page ${asset.pageNumber}`);
          assert.ok(fs.statSync(asset.stagedFilePath).size > 0, `Expected nonempty PNG for page ${asset.pageNumber}`);
          const image = await loadImage(asset.stagedFilePath);
          assert.equal(image.width, asset.width);
          assert.equal(image.height, asset.height);
          const canvas = createCanvas(image.width, image.height);
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, image.width, image.height).data;
          let visiblePixelCount = 0;
          for (let offset = 0; offset < pixels.length; offset += 4) {
            if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) visiblePixelCount++;
          }
          assert.ok(visiblePixelCount >= 4, "Expected visible non-background pixels in the rendered asset");
        }

        const diagnostics = result.statistics.fontRenderingDiagnostics;
        assert.ok(Array.isArray(diagnostics));
        assert.ok(diagnostics.every((entry) => Number.isInteger(entry.pageNumber) &&
          Array.isArray(entry.fontFamilyNames) && Array.isArray(entry.diagnosticCodes)));
        assert.ok(diagnostics.every((entry) => entry.diagnosticCodes.includes("glyph_rendering_unverified")));
        const diagnosticJson = JSON.stringify(diagnostics);
        assert.equal(diagnosticJson.includes(pdfPath), false, "Font diagnostics must not include source paths");
        assert.equal(diagnosticJson.includes("captionText"), false, "Font diagnostics must not include extracted content");
      } finally {
        fs.rmSync(stagingBaseDir, { recursive: true, force: true });
      }
    });
  }
});
