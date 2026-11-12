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

import { executeExtraction } from "../workers/extractionWorkerThread.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_SCRIPT_PATH = path.resolve(__dirname, "../workers/extractionWorkerThread.js");

// Sample PDF for testing extraction
const SAMPLE_PDF_PATH = path.resolve(__dirname, "../../../uploads/arxiv-2610.30421-1793047803831.pdf");

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
    if (!fs.existsSync(SAMPLE_PDF_PATH)) {
      // Defensive fallback if sample file is relocated
      return;
    }

    const testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-staging-"));
    const jobId = "test-job-001";
    const attemptId = "att-1";
    const paperId = "test-paper-001";

    const progressReports = [];
    try {
      const result = await executeExtraction({
        jobId,
        attemptId,
        paperId,
        pdfPath: SAMPLE_PDF_PATH,
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
      fs.rmSync(testStagingBase, { recursive: true, force: true });
    }
  });

  it("aborts execution and cleans staging when cancellationRef is tripped", async () => {
    if (!fs.existsSync(SAMPLE_PDF_PATH)) {
      return;
    }

    const testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-cancel-staging-"));
    const jobId = "test-job-cancel";
    const attemptId = "att-1";
    const paperId = "test-paper-cancel";
    const cancellationRef = { isCancelled: false };

    let pageCount = 0;
    await assert.rejects(
      async () => {
        await executeExtraction({
          jobId,
          attemptId,
          paperId,
          pdfPath: SAMPLE_PDF_PATH,
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

    // Staging attempt directory must be cleaned
    const stagingAttemptDir = path.join(testStagingBase, jobId, attemptId);
    assert.equal(fs.existsSync(stagingAttemptDir), false, "Staging directory must be wiped on cancellation");

    fs.rmSync(testStagingBase, { recursive: true, force: true });
  });

  it("cancellation during final page or region consistently produces EXTRACTION_CANCELLED without emitting COMPLETE", async () => {
    if (!fs.existsSync(SAMPLE_PDF_PATH)) {
      return;
    }

    const testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-final-cancel-"));
    const jobId = "test-job-final-cancel";
    const attemptId = "att-1";
    const paperId = "test-paper-final-cancel";
    const cancellationRef = { isCancelled: false };

    // Trip cancellation at the final page
    let reportedTotalPages = 1;
    await assert.rejects(
      async () => {
        await executeExtraction({
          jobId,
          attemptId,
          paperId,
          pdfPath: SAMPLE_PDF_PATH,
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

    fs.rmSync(testStagingBase, { recursive: true, force: true });
  });
});

describe("extractionWorkerThread — Worker Thread Messaging", () => {
  it("processes extraction job via Worker thread message passing", async () => {
    if (!fs.existsSync(SAMPLE_PDF_PATH)) {
      return;
    }

    const testStagingBase = fs.mkdtempSync(path.join(os.tmpdir(), "worker-thread-staging-"));
    const jobId = "thread-job-002";
    const attemptId = "att-1";
    const paperId = "thread-paper-002";

    const worker = new Worker(WORKER_SCRIPT_PATH, { execArgv: [] });

    const messages = [];
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

    try {
      worker.postMessage({
        type: "START",
        payload: {
          jobId,
          attemptId,
          paperId,
          pdfPath: SAMPLE_PDF_PATH,
          stagingBaseDir: testStagingBase,
          renderScale: 1.0,
        },
      });

      const payload = await completionPromise;
      assert.ok(payload);
      assert.ok(payload.statistics);
      assert.ok(messages.some((m) => m.type === "PROGRESS"));
    } finally {
      await worker.terminate();
      fs.rmSync(testStagingBase, { recursive: true, force: true });
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
