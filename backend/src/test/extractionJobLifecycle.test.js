/**
 * extractionJobLifecycle.test.js
 *
 * FR-09 Phase 3.3.1: Unit & Lifecycle Tests for Extraction Job Processor.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  processExtractionJob,
  resolvePaperPdfPath,
} from "../workers/extractionJobProcessor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const expectedRepoRoot = path.resolve(__dirname, "../../..");

describe("extractionJobProcessor — Path Resolution", () => {
  it("resolves relative and absolute PDF paths safely", () => {
    assert.equal(resolvePaperPdfPath(""), "");
    const abs = path.resolve(process.cwd(), "uploads/paper.pdf");
    assert.equal(resolvePaperPdfPath(abs), abs);
    const rel = "uploads/paper.pdf";
    assert.equal(resolvePaperPdfPath(rel), path.resolve(expectedRepoRoot, rel));
  });
});

describe("extractionJobProcessor — Lifecycle & Retry Policies", () => {
  it("fails immediately without retry when PDF file does not exist", async () => {
    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });
        if (sql.includes("UPDATE paper_extraction_jobs SET status = 'failed'")) {
          return { rowCount: 1, rows: [{ id: "job-1" }] };
        }
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: "nonexistent/paper.pdf",
    };

    await assert.rejects(
      async () => {
        await processExtractionJob({
          job,
          client: mockClient,
        });
      },
      (err) => {
        assert.equal(err.code, "PDF_NOT_FOUND");
        return true;
      }
    );

    // Verify failJob was called (not releaseJobForRetry)
    const failQuery = executedQueries.find((q) =>
      q.sql.includes("SET status = 'failed'")
    );
    assert.ok(failQuery, "Job must transition to 'failed' for permanent errors like PDF_NOT_FOUND");
    assert.ok(failQuery.params[2].includes("Source PDF file not found"));

    const retryQuery = executedQueries.find((q) =>
      q.sql.includes("SET status = 'pending'")
    );
    assert.equal(retryQuery, undefined, "Job must NOT be released for retry on PDF_NOT_FOUND");
  });

  it("releases job for retry when recoverable error occurs and attempts < max_attempts", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-retry-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "not a real pdf");

    // Create a mock worker script that throws an error
    const mockWorkerScript = path.join(tmpDir, "failingWorker.js");
    fs.writeFileSync(
      mockWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          parentPort.postMessage({
            type: "ERROR",
            error: { message: "Simulated worker parsing crash", code: "CRASH" }
          });
        }
      });
      `
    );

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });
        if (sql.includes("SET status = 'pending'")) {
          return { rowCount: 1, rows: [{ id: "job-1" }] };
        }
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    try {
      await assert.rejects(
        async () => {
          await processExtractionJob({
            job,
            client: mockClient,
            workerScriptPath: mockWorkerScript,
            heartbeatIntervalMs: 60000, // Do not trigger heartbeat during quick test
          });
        },
        (err) => {
          assert.equal(err.code, "CRASH");
          return true;
        }
      );

      // Verify releaseJobForRetry was called
      const retryQuery = executedQueries.find((q) =>
        q.sql.includes("SET status = 'pending'")
      );
      assert.ok(retryQuery, "Job must be released for retry when attempts < max_attempts");
      assert.ok(retryQuery.params[2].includes("Simulated worker parsing crash"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("marks job as failed when error occurs and attempts >= max_attempts", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-exhaust-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "not a real pdf");

    const mockWorkerScript = path.join(tmpDir, "failingWorker.js");
    fs.writeFileSync(
      mockWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          parentPort.postMessage({
            type: "ERROR",
            error: { message: "Out of memory in worker", code: "OOM" }
          });
        }
      });
      `
    );

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });
        if (sql.includes("SET status = 'failed'")) {
          return { rowCount: 1, rows: [{ id: "job-1" }] };
        }
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 3, // Already at max_attempts!
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    try {
      await assert.rejects(
        async () => {
          await processExtractionJob({
            job,
            client: mockClient,
            workerScriptPath: mockWorkerScript,
            heartbeatIntervalMs: 60000,
          });
        },
        (err) => {
          assert.equal(err.code, "OOM");
          return true;
        }
      );

      // Verify failJob was called
      const failQuery = executedQueries.find((q) =>
        q.sql.includes("SET status = 'failed'")
      );
      assert.ok(failQuery, "Job must transition to 'failed' when attempts >= max_attempts");

      const retryQuery = executedQueries.find((q) =>
        q.sql.includes("SET status = 'pending'")
      );
      assert.equal(retryQuery, undefined, "Job must NOT be released for retry when exhausted");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("completes full extraction cycle and commits when worker succeeds", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-success-"));
    const stagingDir = path.join(tmpDir, "staging");
    const canonicalDir = path.join(tmpDir, "canonical");
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "valid-pdf-content");

    const jobId = "11111111-1111-4111-8111-111111111111";
    const paperId = "22222222-2222-4222-8222-222222222222";
    const leaseToken = "33333333-3333-4333-8333-333333333333";
    const attemptId = "att-1";

    // Setup staging asset
    const stagedDir = path.join(stagingDir, jobId, attemptId);
    fs.mkdirSync(stagedDir, { recursive: true });
    const stagedFile = path.join(stagedDir, "figure_p1_1.png");
    fs.writeFileSync(stagedFile, "asset-bytes");

    const mockWorkerScript = path.join(tmpDir, "successWorker.js");
    fs.writeFileSync(
      mockWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          parentPort.postMessage({
            type: "PROGRESS",
            payload: { page: 1, totalPages: 1 }
          });
          parentPort.postMessage({
            type: "COMPLETE",
            payload: {
              assets: [
                {
                  assetType: "figure",
                  pageNumber: 1,
                  assetOrder: 1,
                  filename: "figure_p1_1.png",
                  stagedFilePath: "${stagedFile.replace(/\\/g, "\\\\")}",
                  fileSizeBytes: 11,
                  mimeType: "image/png"
                }
              ],
              statistics: { totalPages: 1, assetsExtracted: 1, pageFailureCount: 0 }
            }
          });
        }
      });
      `
    );

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });
        if (sql.startsWith("BEGIN") || sql.startsWith("COMMIT")) {
          return { rowCount: 1 };
        }
        if (sql.includes("SELECT id FROM paper_extraction_jobs")) {
          return { rowCount: 1, rows: [{ id: jobId }] };
        }
        if (sql.includes("UPDATE paper_extraction_jobs") && sql.includes("lease_expires_at")) {
          return { rowCount: 1, rows: [{ id: jobId }] };
        }
        if (sql.includes("INSERT INTO paper_assets")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: "asset-1",
                paper_id: paperId,
                job_id: jobId,
                file_path: `uploads/assets/${paperId}/${jobId}/${attemptId}/figure_p1_1.png`,
              },
            ],
          };
        }
        if (sql.includes("UPDATE paper_extraction_jobs") && sql.includes("status = 'completed'")) {
          return { rowCount: 1, rows: [{ id: jobId }] };
        }
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: jobId,
      paper_id: paperId,
      lease_token: leaseToken,
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    const progressReports = [];
    try {
      const result = await processExtractionJob({
        job,
        client: mockClient,
        workerScriptPath: mockWorkerScript,
        stagingBaseDir: stagingDir,
        canonicalBaseDir: canonicalDir,
        heartbeatIntervalMs: 60000,
        onProgress: (p) => progressReports.push(p),
      });

      assert.ok(result.success);
      assert.equal(result.jobId, jobId);
      assert.equal(result.paperId, paperId);
      assert.equal(result.assetsCount, 1);
      assert.equal(progressReports.length, 1);
      assert.equal(progressReports[0].page, 1);

      // Verify canonical file was created in attempt-isolated path
      const canonicalFile = path.join(canonicalDir, paperId, jobId, attemptId, "figure_p1_1.png");
      assert.ok(fs.existsSync(canonicalFile));
      assert.equal(fs.readFileSync(canonicalFile, "utf-8"), "asset-bytes");

      // Verify staging attempt was cleaned
      assert.equal(fs.existsSync(stagedDir), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("enforces maximum execution duration and terminates stalled worker without persistence", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-timeout-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "valid-pdf");

    // Mock worker that simulates an infinite / hanging loop
    const hangingWorkerScript = path.join(tmpDir, "hangingWorker.js");
    fs.writeFileSync(
      hangingWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          // Never emits COMPLETE or ERROR
        }
      });
      `
    );

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });
        if (sql.includes("SET status = 'pending'")) {
          return { rowCount: 1, rows: [{ id: "job-1" }] };
        }
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    try {
      await assert.rejects(
        async () => {
          await processExtractionJob({
            job,
            client: mockClient,
            workerScriptPath: hangingWorkerScript,
            heartbeatIntervalMs: 60000,
            maxJobDurationMs: 100, // Short 100ms timeout for test
          });
        },
        (err) => {
          assert.equal(err.code, "JOB_EXECUTION_TIMEOUT");
          return true;
        }
      );

      // Verify no persistence queries were executed
      assert.equal(
        executedQueries.some((q) => q.sql.includes("INSERT INTO paper_assets")),
        false,
        "No assets must be persisted on execution timeout"
      );
      assert.equal(
        executedQueries.some((q) => q.sql.includes("SET status = 'completed'")),
        false,
        "Job must not be marked completed on execution timeout"
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("extractionJobProcessor — Worker Settlement, Cancellation & Heartbeat", () => {
  it("rejects when worker exits with code 0 without COMPLETE or ERROR", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "exit0-test-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    const exitWorkerScript = path.join(tmpDir, "exitWorker.js");
    fs.writeFileSync(
      exitWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          process.exit(0);
        }
      });
      `
    );

    const mockClient = {
      query: async (sql) => {
        if (sql.includes("SET status = 'pending'")) return { rowCount: 1, rows: [{ id: "j1" }] };
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    try {
      await assert.rejects(
        async () => {
          await processExtractionJob({
            job,
            client: mockClient,
            workerScriptPath: exitWorkerScript,
            heartbeatIntervalMs: 60000,
          });
        },
        (err) => {
          assert.equal(err.code, "WORKER_EXIT_WITHOUT_RESULT");
          return true;
        }
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("settles normally when worker sends COMPLETE and exits cleanly", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "complete-exit-test-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    const completeExitWorkerScript = path.join(tmpDir, "completeExitWorker.js");
    fs.writeFileSync(
      completeExitWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          parentPort.postMessage({
            type: "COMPLETE",
            payload: {
              assets: [],
              statistics: { totalPages: 1, assetsExtracted: 0, pageFailureCount: 0 }
            }
          });
          setTimeout(() => process.exit(0), 10);
        }
      });
      `
    );

    const mockClient = {
      query: async (sql) => {
        if (sql.startsWith("BEGIN") || sql.startsWith("COMMIT")) return { rowCount: 1 };
        if (sql.includes("SELECT id FROM paper_extraction_jobs")) return { rowCount: 1, rows: [{ id: "j1" }] };
        if (sql.includes("UPDATE paper_extraction_jobs")) return { rowCount: 1, rows: [{ id: "j1" }] };
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    try {
      const result = await processExtractionJob({
        job,
        client: mockClient,
        workerScriptPath: completeExitWorkerScript,
        stagingBaseDir: path.join(tmpDir, "stg"),
        canonicalBaseDir: path.join(tmpDir, "can"),
        heartbeatIntervalMs: 60000,
      });
      assert.equal(result.success, true);
      assert.equal(result.assetsCount, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("terminates non-responsive worker on lease loss", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "leaseloss-term-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    // Worker that ignores cancel and hangs forever
    const stubbornWorkerScript = path.join(tmpDir, "stubbornWorker.js");
    fs.writeFileSync(
      stubbornWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        // Do nothing even on CANCEL
      });
      `
    );

    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes("UPDATE paper_extraction_jobs") && sql.includes("lease_expires_at")) {
          // Simulate lease loss
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes("SET status = 'failed'")) {
          return { rowCount: 1, rows: [{ id: "j1" }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    const startTime = Date.now();
    try {
      await assert.rejects(
        async () => {
          await processExtractionJob({
            job,
            client: mockClient,
            workerScriptPath: stubbornWorkerScript,
            heartbeatIntervalMs: 50,
            maxJobDurationMs: 10000,
          });
        },
        (err) => {
          assert.ok(
            err.code === "LEASE_LOST_BEFORE_PERSISTENCE" ||
            err.code === "EXTRACTION_CANCELLED" ||
            err.message.includes("Lease lost") ||
            err.message.includes("cancelled")
          );
          return true;
        }
      );
      const elapsed = Date.now() - startTime;
      assert.ok(elapsed < 4000, `Worker should terminate via lease-loss fallback (elapsed ${elapsed}ms)`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("handles cancellation requested before worker assignment", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "precancel-test-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    const hangingWorkerScript = path.join(tmpDir, "hangingWorker.js");
    fs.writeFileSync(
      hangingWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        // Ignored
      });
      `
    );

    const mockClient = {
      query: async (sql) => {
        if (sql.includes("SET status = 'pending'")) return { rowCount: 1, rows: [{ id: "j1" }] };
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    try {
      await assert.rejects(
        async () => {
          await processExtractionJob({
            job,
            client: mockClient,
            workerScriptPath: hangingWorkerScript,
            heartbeatIntervalMs: 60000,
            registerCancelHandler: (cancelFn) => {
              cancelFn();
            },
          });
        },
        (err) => {
          assert.ok(
            err.code === "EXTRACTION_CANCELLED" ||
            err.message.includes("cancelled")
          );
          return true;
        }
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("correctly passes custom heartbeatIntervalMs to LeaseHeartbeat", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "heartbeat-cfg-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    const delayWorkerScript = path.join(tmpDir, "delayWorker.js");
    fs.writeFileSync(
      delayWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          setTimeout(() => {
            parentPort.postMessage({
              type: "COMPLETE",
              payload: { assets: [], statistics: { totalPages: 1, assetsExtracted: 0, pageFailureCount: 0 } }
            });
          }, 120);
        }
      });
      `
    );

    let heartbeatPulses = 0;
    const mockClient = {
      query: async (sql) => {
        if (sql.startsWith("BEGIN") || sql.startsWith("COMMIT")) return { rowCount: 1 };
        if (sql.includes("SELECT id FROM paper_extraction_jobs")) return { rowCount: 1, rows: [{ id: "j1" }] };
        if (sql.includes("UPDATE paper_extraction_jobs") && sql.includes("lease_expires_at")) {
          heartbeatPulses++;
          return { rowCount: 1, rows: [{ id: "j1" }] };
        }
        if (sql.includes("UPDATE paper_extraction_jobs")) return { rowCount: 1, rows: [{ id: "j1" }] };
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    try {
      const result = await processExtractionJob({
        job,
        client: mockClient,
        workerScriptPath: delayWorkerScript,
        stagingBaseDir: path.join(tmpDir, "stg"),
        canonicalBaseDir: path.join(tmpDir, "can"),
        heartbeatIntervalMs: 40,
      });
      assert.ok(result.success);
      assert.ok(heartbeatPulses >= 2, `Expected at least 2 pulses at 40ms interval, got ${heartbeatPulses}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("dispatches cancellation to worker immediately before delayed heartbeat shutdown completes", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cancel-order-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    const markerFile = path.join(tmpDir, "cancel_received.txt");

    const cancelTrackingWorker = path.join(tmpDir, "cancelTrackingWorker.js");
    fs.writeFileSync(
      cancelTrackingWorker,
      `
      import { parentPort } from "node:worker_threads";
      import fs from "node:fs";
      parentPort.on("message", (msg) => {
        if (msg.type === "CANCEL") {
          fs.writeFileSync("${markerFile.replace(/\\/g, "\\\\")}", String(Date.now()));
          process.exit(1);
        }
      });
      `
    );

    let heartbeatStopCompletedAt = 0;
    let cancelCalledAt = 0;
    let inFlightPulse = false;

    const mockClient = {
      query: async (sql) => {
        if (sql.includes("UPDATE paper_extraction_jobs") && sql.includes("lease_expires_at")) {
          inFlightPulse = true;
          // Simulate slow DB response during heartbeat pulse (300ms)
          await new Promise((r) => setTimeout(r, 300));
          inFlightPulse = false;
          return { rowCount: 1, rows: [{ id: "j1" }] };
        }
        if (sql.includes("SET status = 'pending'")) return { rowCount: 1, rows: [{ id: "j1" }] };
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    let cancelHandler = null;
    try {
      const processPromise = processExtractionJob({
        job,
        client: mockClient,
        workerScriptPath: cancelTrackingWorker,
        heartbeatIntervalMs: 40,
        registerCancelHandler: (fn) => {
          cancelHandler = fn;
        },
      });

      // Wait until heartbeat has initiated the pulse
      while (!inFlightPulse) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Now pulse is in-flight; invoke cancelHandler
      cancelCalledAt = Date.now();
      const cancelPromise = cancelHandler().then(() => {
        heartbeatStopCompletedAt = Date.now();
      });

      await assert.rejects(processPromise);
      await cancelPromise;

      assert.ok(fs.existsSync(markerFile), "Worker should have received CANCEL message");
      const cancelReceivedAt = Number(fs.readFileSync(markerFile, "utf-8"));
      assert.ok(
        cancelReceivedAt < heartbeatStopCompletedAt,
        `Worker received CANCEL at ${cancelReceivedAt}, but heartbeat stop finished later at ${heartbeatStopCompletedAt}`
      );
      assert.ok(
        cancelReceivedAt - cancelCalledAt < 200,
        `Worker should receive CANCEL almost immediately (took ${cancelReceivedAt - cancelCalledAt}ms)`
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("enforces timeout termination using managed worker termination timer", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "timeout-managed-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "valid-pdf");

    // Stubborn worker that ignores CANCEL message
    const stubbornWorkerScript = path.join(tmpDir, "stubbornTimeoutWorker.js");
    fs.writeFileSync(
      stubbornWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        // Ignores START and CANCEL
      });
      `
    );

    const mockClient = {
      query: async (sql) => {
        if (sql.includes("SET status = 'pending'")) return { rowCount: 1, rows: [{ id: "job-1" }] };
        return { rowCount: 1, rows: [] };
      },
    };

    const job = {
      id: "11111111-1111-4111-8111-111111111111",
      paper_id: "22222222-2222-4222-8222-222222222222",
      lease_token: "33333333-3333-4333-8333-333333333333",
      attempts: 1,
      max_attempts: 3,
      paper_file_path: dummyPdf,
    };

    const startTime = Date.now();
    try {
      await assert.rejects(
        async () => {
          await processExtractionJob({
            job,
            client: mockClient,
            workerScriptPath: stubbornWorkerScript,
            heartbeatIntervalMs: 60000,
            maxJobDurationMs: 100, // 100ms timeout
          });
        },
        (err) => {
          assert.equal(err.code, "JOB_EXECUTION_TIMEOUT");
          return true;
        }
      );
      const elapsed = Date.now() - startTime;
      assert.ok(elapsed >= 500, `Must allow 500ms bounded termination grace period (elapsed ${elapsed}ms)`);
      assert.ok(elapsed < 2000, `Worker must be terminated by managed timer (elapsed ${elapsed}ms)`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

