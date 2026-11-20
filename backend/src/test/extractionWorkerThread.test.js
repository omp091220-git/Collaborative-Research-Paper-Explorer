/**
 * extractionWorkerThread.test.js
 *
 * FR-09 Phase 3.3.1: Unit & Integration Tests for Isolated Worker Thread Extraction.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { buildFontRenderingDiagnostic, executeExtraction } from "../workers/extractionWorkerThread.js";
import { createFr09FixturePdf, FR09_FONT_TEST_REGIONS, FR09_PDF_PAGE_HEIGHT } from "./fr09PdfFixture.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_SCRIPT_PATH = path.resolve(__dirname, "../workers/extractionWorkerThread.js");

const FONT_DIAGNOSTIC_PDF_PATH = path.resolve(__dirname, "../../../uploads/arxiv-2501.03505-1794913186478.pdf");

describe("extractionWorkerThread — privacy-safe font diagnostics", () => {
  it("distinguishes embedded fonts from supported standard PDF fonts", () => {
    const embedded = buildFontRenderingDiagnostic(2, [
      { name: "AAAAAA+CMR10", fontObjectResolved: true, hasEmbeddedFontProgram: true },
    ]);
    assert.deepEqual(embedded, {
      pageNumber: 2,
      fontFamilyNames: ["CMR10"],
      diagnosticCodes: ["font_embedded", "glyph_rendering_unverified"],
    });

    const standard = buildFontRenderingDiagnostic(3, [
      { name: "Helvetica", fontObjectResolved: true, hasEmbeddedFontProgram: false, matchedSystemFont: true },
    ]);
    assert.ok(standard.diagnosticCodes.includes("font_standard_supported"));
    assert.ok(standard.diagnosticCodes.includes("font_fallback_used"));
    assert.ok(!standard.diagnosticCodes.includes("font_unembedded"));
  });

  it("marks unknown unembedded resources and reports system fallback separately", () => {
    const diagnostic = buildFontRenderingDiagnostic(4, [
      {
        name: "BBBBBB+Mathematica1",
        fontObjectResolved: true,
        hasEmbeddedFontProgram: false,
        matchedSystemFont: true,
      },
    ]);

    assert.deepEqual(diagnostic, {
      pageNumber: 4,
      fontFamilyNames: ["Mathematica1"],
      diagnosticCodes: ["font_fallback_used", "font_unembedded", "glyph_rendering_unverified"],
    });
  });

  it("reports missing, invalid, and unresolved font resources as resolution problems", () => {
    const diagnostic = buildFontRenderingDiagnostic(5, [
      { name: "UnavailableSerif", fontObjectResolved: false, id: "internal-id" },
      { name: "InvalidMath", fontObjectResolved: true, hasEmbeddedFontProgram: false, invalidFont: true },
      { name: "MissingFontFile", fontObjectResolved: true, hasEmbeddedFontProgram: false, missingFile: true },
    ]);

    assert.ok(diagnostic.diagnosticCodes.includes("font_resolution_problem"));
    assert.ok(diagnostic.diagnosticCodes.includes("font_unembedded"));
    assert.ok(diagnostic.diagnosticCodes.includes("glyph_rendering_unverified"));
  });

  it("aggregates mixed-font pages and excludes document text, IDs, and paths", () => {
    const diagnostic = buildFontRenderingDiagnostic(6, [
      { name: "Helvetica", fontObjectResolved: true, hasEmbeddedFontProgram: false },
      { name: "CCCCCC+CMEX10", fontObjectResolved: true, hasEmbeddedFontProgram: true },
      {
        name: "UnembeddedScientific",
        fontObjectResolved: true,
        hasEmbeddedFontProgram: false,
        matchedSystemFont: true,
        id: "font-object-secret-id",
        path: "C:\\private\\font.pfb",
        text: "PRIVATE_EQUATION_CONTENT",
      },
    ]);
    const serialized = JSON.stringify(diagnostic);

    assert.equal(diagnostic.pageNumber, 6);
    assert.deepEqual(diagnostic.fontFamilyNames, ["CMEX10", "Helvetica", "UnembeddedScientific"]);
    assert.ok(diagnostic.diagnosticCodes.includes("font_standard_supported"));
    assert.ok(diagnostic.diagnosticCodes.includes("font_embedded"));
    assert.ok(diagnostic.diagnosticCodes.includes("font_unembedded"));
    assert.ok(diagnostic.diagnosticCodes.includes("font_fallback_used"));
    assert.ok(diagnostic.diagnosticCodes.includes("glyph_rendering_unverified"));
    assert.equal(serialized.includes("PRIVATE_EQUATION_CONTENT"), false);
    assert.equal(serialized.includes("font-object-secret-id"), false);
    assert.equal(serialized.includes("private"), false);
    assert.deepEqual(Object.keys(diagnostic).sort(), ["diagnosticCodes", "fontFamilyNames", "pageNumber"]);
  });
});

async function measureRenderedInk(asset, pdfRegion, scale = 1) {
  const image = await loadImage(asset.stagedFilePath);
  assert.equal(image.width, asset.width);
  assert.equal(image.height, asset.height);
  assert.ok(image.width > 0 && image.height > 0);

  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  const crop = asset.extractionMetadata.cropRect;
  const x0 = Math.max(0, Math.floor(pdfRegion.minX * scale - crop.x));
  const x1 = Math.min(image.width, Math.ceil(pdfRegion.maxX * scale - crop.x));
  const y0 = Math.max(0, Math.floor((FR09_PDF_PAGE_HEIGHT - pdfRegion.maxY) * scale - crop.y));
  const y1 = Math.min(image.height, Math.ceil((FR09_PDF_PAGE_HEIGHT - pdfRegion.minY) * scale - crop.y));
  assert.ok(x1 > x0 && y1 > y0, "Expected text measurement region to overlap the staged crop");

  let inkPixelCount = 0;
  let darkInkPixelCount = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const offset = (y * image.width + x) * 4;
      if (pixels[offset] < 230 || pixels[offset + 1] < 230 || pixels[offset + 2] < 230) {
        inkPixelCount++;
      }
      if (pixels[offset] < 160 || pixels[offset + 1] < 160 || pixels[offset + 2] < 160) {
        darkInkPixelCount++;
      }
    }
  }

  const regionPixelCount = (x1 - x0) * (y1 - y0);
  return {
    inkPixelCount,
    darkInkPixelCount,
    occupancy: inkPixelCount / regionPixelCount,
    regionPixelCount,
  };
}

describe("extractionWorkerThread — executeExtraction In-Process", () => {
  it("rejects immediately with PDF_NOT_FOUND when PDF file does not exist", async () => {
    const nonExistentPath = path.resolve(os.tmpdir(), "non_existent_paper_12345.pdf");

    await assert.rejects(
      async () => {
        await executeExtraction({
          jobId: "job-test-404",
          attemptId: "att-1",
          paperId: "paper-404",
          pdfPath: nonExistentPath,
        });
      },
      (err) => {
        assert.equal(err.code, "PDF_NOT_FOUND");
        assert.ok(err.message.includes("Source PDF file not found"));
        return true;
      }
    );
  });

  it("extracts assets, reports progress, and stages images for valid PDF", async () => {
    const fixture = createFr09FixturePdf();
    let testStagingBase;
    const jobId = "test-job-001";
    const attemptId = "att-1";
    const paperId = "test-paper-001";

    const progressReports = [];
    try {
      testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-staging-"));
      const result = await executeExtraction({
        jobId,
        attemptId,
        paperId,
        pdfPath: fixture.filePath,
        stagingBaseDir: testStagingBase,
        renderScale: 1.0, // Scale 1.0 for rapid test execution
        onProgress: (p) => progressReports.push(p),
      });

      assert.ok(result);
      assert.ok(Array.isArray(result.assets));
      assert.ok(result.statistics);
      assert.ok(result.statistics.totalPages >= 1);
      assert.equal(result.statistics.assetsExtracted, result.assets.length);
      assert.equal(result.statistics.pageFailureCount, 0);
      assert.ok(result.statistics.totalPages >= 1);
      assert.ok(result.assets.length >= 4, "Expected vector, table, and raster assets from the generated PDF");
      assert.ok(result.assets.some((asset) => asset.assetType === "table"));
      assert.ok(result.assets.some((asset) => asset.assetType === "figure"));

      // Verify progress callback fired
      assert.ok(progressReports.length > 0);
      assert.equal(progressReports[0].page, 1);
      assert.equal(progressReports[0].totalPages, result.statistics.totalPages);

      // Verify asset structure if assets were detected
      for (const asset of result.assets) {
        assert.equal(asset.paperId, paperId);
        assert.equal(asset.jobId, jobId);
        assert.ok(["figure", "table", "chart"].includes(asset.assetType));
        assert.ok(asset.pageNumber >= 1);
        assert.ok(asset.assetOrder >= 1);
        assert.ok(asset.filename.endsWith(".png"));
        assert.ok(fs.existsSync(asset.stagedFilePath), `Staged file must exist: ${asset.stagedFilePath}`);
        assert.ok(asset.fileSizeBytes > 0);
        assert.equal(asset.mimeType, "image/png");
        assert.ok(asset.width > 0);
        assert.ok(asset.height > 0);
        assert.ok(asset.extractionMetadata);
        assert.ok(asset.extractionMetadata.bounds);
      }
    } finally {
      if (testStagingBase) fs.rmSync(testStagingBase, { recursive: true, force: true });
      fixture.cleanup();
    }
  });

  it("aborts execution and cleans staging when cancellationRef is tripped", async () => {
    const fixture = createFr09FixturePdf();
    let testStagingBase;
    const jobId = "test-job-cancel";
    const attemptId = "att-1";
    const paperId = "test-paper-cancel";
    const cancellationRef = { isCancelled: false };

    let pageCount = 0;
    try {
      testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-cancel-staging-"));
      await assert.rejects(
      async () => {
        await executeExtraction({
          jobId,
          attemptId,
          paperId,
          pdfPath: fixture.filePath,
          stagingBaseDir: testStagingBase,
          cancellationRef,
          onProgress: () => {
            pageCount++;
            if (pageCount >= 1) {
              cancellationRef.isCancelled = true;
            }
          },
        });
      },
      (err) => {
        assert.equal(err.code, "EXTRACTION_CANCELLED");
        return true;
      }
      );

      const stagingAttemptDir = path.join(testStagingBase, jobId, attemptId);
      assert.equal(fs.existsSync(stagingAttemptDir), false, "Staging directory must be wiped on cancellation");
    } finally {
      if (testStagingBase) fs.rmSync(testStagingBase, { recursive: true, force: true });
      fixture.cleanup();
    }
  });

  it("cancellation during final page or region consistently produces EXTRACTION_CANCELLED without emitting COMPLETE", async () => {
    const fixture = createFr09FixturePdf();
    let testStagingBase;
    const jobId = "test-job-final-cancel";
    const attemptId = "att-1";
    const paperId = "test-paper-final-cancel";
    const cancellationRef = { isCancelled: false };

    // Trip cancellation at the final page
    let reportedTotalPages = 1;
    try {
      testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-final-cancel-"));
      await assert.rejects(
      async () => {
        await executeExtraction({
          jobId,
          attemptId,
          paperId,
          pdfPath: fixture.filePath,
          stagingBaseDir: testStagingBase,
          renderScale: 1.0,
          cancellationRef,
          onProgress: (p) => {
            reportedTotalPages = p.totalPages;
            if (p.page === p.totalPages) {
              // Trip on the very last page
              cancellationRef.isCancelled = true;
            }
          },
        });
      },
      (err) => {
        assert.equal(err.code, "EXTRACTION_CANCELLED");
        return true;
      }
      );

      const stagingAttemptDir = path.join(testStagingBase, jobId, attemptId);
      assert.equal(fs.existsSync(stagingAttemptDir), false, "Staging directory must be wiped");
    } finally {
      if (testStagingBase) fs.rmSync(testStagingBase, { recursive: true, force: true });
      fixture.cleanup();
    }
  });
});

describe("extractionWorkerThread — Optional real-paper font diagnostics", () => {
  it("reports privacy-safe PDF font resource diagnostics from the worker thread", async (t) => {
    if (!fs.existsSync(FONT_DIAGNOSTIC_PDF_PATH)) {
      t.skip("Local font diagnostic sample PDF is unavailable.");
      return;
    }

    const testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-font-diagnostic-"));
    const worker = new Worker(WORKER_SCRIPT_PATH, { execArgv: [] });
    const completion = new Promise((resolve, reject) => {
      worker.on("message", (message) => {
        if (message.type === "COMPLETE") resolve(message.payload);
        else if (message.type === "ERROR") reject(new Error(message.error?.message || "Worker failed"));
      });
      worker.on("error", reject);
    });

    try {
      worker.postMessage({
        type: "START",
        payload: {
          jobId: "font-diagnostic-job",
          attemptId: "attempt-one",
          paperId: "font-diagnostic-paper",
          pdfPath: FONT_DIAGNOSTIC_PDF_PATH,
          stagingBaseDir: testStagingBase,
          renderScale: 1.0,
        },
      });

      const result = await completion;
      const page13 = result.statistics.fontDiagnostics.find((page) => page.pageNumber === 13);
      assert.ok(page13);
      assert.ok(page13.fontReferenceCount > 0);
      assert.ok(page13.fonts.some((font) => /Mathematica|CMR/.test(font.name || "")));
      assert.ok(page13.fonts.every((font) => typeof font.hasEmbeddedFontProgram === "boolean"));
      assert.ok(page13.fonts.every((font) => typeof font.matchedSystemFont === "boolean"));
      assert.equal(JSON.stringify(page13).includes("FIG. 7"), false);
      assert.equal(JSON.stringify(page13).includes("captionText"), false);
    } finally {
      await worker.terminate();
      fs.rmSync(testStagingBase, { recursive: true, force: true });
    }
  });
});

describe("extractionWorkerThread — Worker Thread Messaging", () => {
  it("renders Greek alpha through the Helvetica system-font path in a real Worker", async () => {
    const fixture = createFr09FixturePdf({ greekFontName: "Helvetica" });
    let testStagingBase;
    let worker;
    try {
      testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-greek-helvetica-"));
      worker = new Worker(WORKER_SCRIPT_PATH, { execArgv: [] });
      const completionPromise = new Promise((resolve, reject) => {
        worker.on("message", (message) => {
          if (message.type === "COMPLETE") resolve(message.payload);
          else if (message.type === "ERROR") reject(new Error(message.error?.message || "Worker failed"));
        });
        worker.on("error", reject);
      });
      worker.postMessage({
        type: "START",
        payload: {
          jobId: "thread-greek-helvetica",
          attemptId: "attempt-one",
          paperId: "paper-greek-helvetica",
          pdfPath: fixture.filePath,
          stagingBaseDir: testStagingBase,
          renderScale: 1.0,
        },
      });

      const result = await completionPromise;
      const figureAsset = result.assets.find((asset) => asset.pageNumber === 1 && asset.assetOrder === 1);
      assert.ok(figureAsset, "Expected the Helvetica Greek-alpha figure asset from the Worker");
      assert.ok(fs.existsSync(figureAsset.stagedFilePath));
      assert.ok(fs.statSync(figureAsset.stagedFilePath).size > 0);
      const alphaInk = await measureRenderedInk(figureAsset, FR09_FONT_TEST_REGIONS.greekAlpha, 1.0);
      assert.ok(alphaInk.darkInkPixelCount >= 4, `Helvetica alpha should render dark glyph strokes; got ${alphaInk.darkInkPixelCount}`);

      const pageFonts = result.statistics.fontDiagnostics.find((page) => page.pageNumber === 1)?.fonts || [];
      assert.ok(pageFonts.some((font) => font.name === "Helvetica" && font.matchedSystemFont));
    } finally {
      if (worker) await worker.terminate();
      if (testStagingBase) fs.rmSync(testStagingBase, { recursive: true, force: true });
      fixture.cleanup();
    }
  });

  it("processes extraction job via Worker thread message passing", async () => {
    const fixture = createFr09FixturePdf();
    let testStagingBase;
    const jobId = "thread-job-002";
    const attemptId = "att-1";
    const paperId = "thread-paper-002";

    let worker;

    const messages = [];
    try {
      testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-thread-staging-"));
      worker = new Worker(WORKER_SCRIPT_PATH, { execArgv: [] });
      const completionPromise = new Promise((resolve, reject) => {
      worker.on("message", (msg) => {
        messages.push(msg);
        if (msg.type === "COMPLETE") {
          resolve(msg.payload);
        } else if (msg.type === "ERROR") {
          reject(new Error(msg.error.message));
        }
      });
      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0 && !messages.some((m) => m.type === "COMPLETE")) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
      });
      worker.postMessage({
        type: "START",
        payload: {
          jobId,
          attemptId,
          paperId,
          pdfPath: fixture.filePath,
          stagingBaseDir: testStagingBase,
          renderScale: 1.0,
        },
      });

      const payload = await completionPromise;
      assert.ok(payload);
      assert.ok(payload.statistics);
      assert.ok(payload.statistics.totalPages >= 1, "Worker should process at least one page");
      assert.ok(payload.assets.length >= 4, "Worker should extract the vector, table, and raster fixture assets");
      assert.equal(payload.statistics.assetsExtracted, payload.assets.length);
      assert.ok(messages.some((m) => m.type === "PROGRESS"));
      assert.ok(messages.some((m) => m.type === "COMPLETE"));
      assert.ok(messages.some((m) => m.type === "PROGRESS" && m.payload.page === 1));
      for (const asset of payload.assets) {
        assert.ok(fs.existsSync(asset.stagedFilePath), `Expected staged asset file ${asset.filename}`);
        assert.ok(fs.statSync(asset.stagedFilePath).size > 0, `Expected non-empty staged asset ${asset.filename}`);
      }

      const figureAsset = payload.assets.find((asset) => asset.pageNumber === 1 && asset.assetOrder === 1);
      const tableAsset = payload.assets.find((asset) => asset.pageNumber === 2 && asset.assetType === "table");
      assert.ok(figureAsset, "Expected the first vector figure PNG for Greek/math pixel checks");
      assert.ok(tableAsset, "Expected the table PNG for Latin, fallback, and scientific-text checks");

      const pixelCases = [
        ["Greek alpha", figureAsset, FR09_FONT_TEST_REGIONS.greekAlpha],
        ["mathematical Sigma", figureAsset, FR09_FONT_TEST_REGIONS.mathSigma],
        ["standard Helvetica Latin", tableAsset, FR09_FONT_TEST_REGIONS.standardLatin],
        ["unembedded fallback Latin", tableAsset, FR09_FONT_TEST_REGIONS.fallbackLatin],
        ["scientific notation", tableAsset, FR09_FONT_TEST_REGIONS.scientificNotation],
      ];
      const pixelMetrics = new Map();
      for (const [label, asset, pdfRegion] of pixelCases) {
        const metrics = await measureRenderedInk(asset, pdfRegion, 1.0);
        pixelMetrics.set(label, metrics);
        assert.ok(metrics.inkPixelCount >= 8, `${label} region should contain visible glyph pixels; got ${metrics.inkPixelCount}`);
        assert.ok(metrics.occupancy >= 0.01, `${label} region should not be nearly blank; occupancy=${metrics.occupancy}`);
      }

      const page1Fonts = payload.statistics.fontDiagnostics.find((page) => page.pageNumber === 1)?.fonts || [];
      const page2Fonts = payload.statistics.fontDiagnostics.find((page) => page.pageNumber === 2)?.fonts || [];
      const pageRenderingDiagnostic = payload.statistics.fontRenderingDiagnostics.find((page) => page.pageNumber === 1);
      assert.ok(page1Fonts.some((font) => font.name === "Helvetica"));
      assert.ok(page1Fonts.some((font) => font.name === "Symbol"));
      assert.ok(pageRenderingDiagnostic);
      assert.ok(pageRenderingDiagnostic.fontFamilyNames.includes("Helvetica"));
      assert.ok(pageRenderingDiagnostic.diagnosticCodes.includes("font_standard_supported"));
      assert.ok(pageRenderingDiagnostic.diagnosticCodes.includes("glyph_rendering_unverified"));
      const unembeddedFallback = page2Fonts.find((font) => font.name?.includes("Fr09UnembeddedFallback"));
      assert.ok(unembeddedFallback, "Expected the deliberately unembedded test font reference");
      assert.equal(unembeddedFallback.hasEmbeddedFontProgram, false);
      assert.ok(unembeddedFallback.fallbackName, "PDF.js should report a fallback family for the unembedded font");

      // Tofu boxes in the actual worker PNG were pale outlines that passed the
      // occupancy threshold. Core symbol strokes must include pixels darker
      // than 160/255, not merely antialiased outlines. Run this after all ROIs
      // are measured so standard, fallback, and scientific cases are exercised.
      const symbolLabels = ["Greek alpha", "mathematical Sigma"];
      const symbolInkSummary = symbolLabels
        .map((label) => `${label}: ${pixelMetrics.get(label).darkInkPixelCount} dark pixels`);
      const missingSymbolGlyphs = symbolLabels
        .filter((label) => pixelMetrics.get(label).darkInkPixelCount < 4);
      assert.deepEqual(
        missingSymbolGlyphs,
        [],
        `Symbol regions should contain dark glyph strokes, not only pale missing-glyph boxes (measured ${symbolInkSummary.join("; ")})`
      );
    } finally {
      if (worker) await worker.terminate();
      if (testStagingBase) fs.rmSync(testStagingBase, { recursive: true, force: true });
      fixture.cleanup();
    }
  });

  it("responds with ERROR message on Worker thread when PDF does not exist", async () => {
    const worker = new Worker(WORKER_SCRIPT_PATH, { execArgv: [] });

    const resultPromise = new Promise((resolve) => {
      worker.on("message", (msg) => {
        if (msg.type === "ERROR") {
          resolve(msg);
        }
      });
    });

    try {
      worker.postMessage({
        type: "START",
        payload: {
          jobId: "invalid-job",
          attemptId: "att-1",
          paperId: "paper-1",
          pdfPath: "non-existent-pdf-path.pdf",
        },
      });

      const errorMsg = await resultPromise;
      assert.ok(errorMsg);
      assert.equal(errorMsg.error.code, "PDF_NOT_FOUND");
    } finally {
      await worker.terminate();
    }
  });
});
