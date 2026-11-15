/**
 * extractionSupervisor.test.js
 *
 * FR-09 Phase 3.3.1: Unit & Lifecycle Tests for Extraction Supervisor.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  ExtractionSupervisor,
  createSupervisor,
} from "../workers/extractionSupervisor.js";

describe("ExtractionSupervisor — Instantiation & Safety", () => {
  it("creates supervisor without automatically starting it", () => {
    const supervisor = createSupervisor({ concurrency: 3 });
    assert.ok(supervisor instanceof ExtractionSupervisor);
    assert.equal(supervisor.concurrency, 3);
    assert.equal(supervisor.isRunning, false);
    assert.equal(supervisor.isShuttingDown, false);
    assert.equal(supervisor.activeCount, 0);
  });

  it("prevents duplicate startup via guard check", async () => {
    const mockPool = {
      query: async () => ({ rows: [] }),
    };

    const supervisor = new ExtractionSupervisor({
      dbPool: mockPool,
      pollIntervalMs: 500,
    });

    try {
      supervisor.start();
      assert.equal(supervisor.isRunning, true);

      assert.throws(
        () => supervisor.start(),
        (err) => {
          assert.ok(err.message.includes("is already running"));
          return true;
        }
      );
    } finally {
      await supervisor.stop();
      assert.equal(supervisor.isRunning, false);
    }
  });
});

describe("ExtractionSupervisor — Concurrency & Job Flow", () => {
  it("enforces concurrency ceiling and processes queued jobs", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-concurrency-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    // Mock worker script that takes 50ms to finish
    const mockWorkerScript = path.join(tmpDir, "mockDelayWorker.js");
    fs.writeFileSync(
      mockWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          setTimeout(() => {
            parentPort.postMessage({
              type: "COMPLETE",
              payload: { assets: [], statistics: { totalPages: 1, assetsExtracted: 0, pageFailureCount: 0 } }
            });
          }, 50);
        }
      });
      `
    );

    // Queue of jobs to return
    let jobQueue = [
      {
        id: "job-1",
        paper_id: "paper-1",
        attempts: 1,
        max_attempts: 3,
        paper_file_path: dummyPdf,
      },
      {
        id: "job-2",
        paper_id: "paper-2",
        attempts: 1,
        max_attempts: 3,
        paper_file_path: dummyPdf,
      },
      {
        id: "job-3",
        paper_id: "paper-3",
        attempts: 1,
        max_attempts: 3,
        paper_file_path: dummyPdf,
      },
    ];

    let maxObservedActive = 0;
    const completedJobs = [];

    const mockPool = {
      query: async (sql, params) => {
        const s = sql.trim();
        if (s.startsWith("BEGIN") || s.startsWith("COMMIT")) return { rowCount: 1 };
        if (s.includes("WITH candidate AS")) {
          // claimNextJob simulation
          if (jobQueue.length > 0) {
            const next = jobQueue.shift();
            return {
              rowCount: 1,
              rows: [
                {
                  ...next,
                  status: "processing",
                  lease_token: `token-${next.id}`,
                  paper_file_path: dummyPdf,
                },
              ],
            };
          }
          return { rowCount: 0, rows: [] };
        }
        if (s.includes("SELECT id FROM paper_extraction_jobs")) {
          return { rowCount: 1, rows: [{ id: "mock" }] };
        }
        if (s.includes("UPDATE paper_extraction_jobs") && s.includes("status = 'completed'")) {
          completedJobs.push(params[0]);
          return { rowCount: 1, rows: [{ id: params[0] }] };
        }
        if (s.includes("UPDATE paper_extraction_jobs") && s.includes("lease_expires_at")) {
          return { rowCount: 1, rows: [{ id: params[0] }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const supervisor = new ExtractionSupervisor({
      dbPool: mockPool,
      concurrency: 2, // Concurrency limit 2
      pollIntervalMs: 20,
      heartbeatIntervalMs: 60000,
      workerScriptPath: mockWorkerScript,
    });

    try {
      supervisor.start();

      // Monitor active count
      const checkInterval = setInterval(() => {
        if (supervisor.activeCount > maxObservedActive) {
          maxObservedActive = supervisor.activeCount;
        }
      }, 5);

      // Wait until all 3 jobs are processed
      const timeoutAt = Date.now() + 5000;
      while (completedJobs.length < 3 && Date.now() < timeoutAt) {
        await new Promise((r) => setTimeout(r, 20));
      }

      clearInterval(checkInterval);

      assert.equal(completedJobs.length, 3, "All 3 jobs should have completed");
      assert.ok(maxObservedActive <= 2, `Active jobs (${maxObservedActive}) must not exceed concurrency (2)`);
    } finally {
      await supervisor.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("gracefully shuts down and waits for active jobs to complete", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-shutdown-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    const mockWorkerScript = path.join(tmpDir, "mockFastWorker.js");
    fs.writeFileSync(
      mockWorkerScript,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        if (msg.type === "START") {
          setTimeout(() => {
            parentPort.postMessage({
              type: "COMPLETE",
              payload: { assets: [], statistics: { totalPages: 1, assetsExtracted: 0, pageFailureCount: 0 } }
            });
          }, 150);
        }
      });
      `
    );

    let claimedOnce = false;
    const mockPool = {
      query: async (sql) => {
        const s = sql.trim();
        if (s.startsWith("BEGIN") || s.startsWith("COMMIT")) return { rowCount: 1 };
        if (s.includes("WITH candidate AS")) {
          if (!claimedOnce) {
            claimedOnce = true;
            return {
              rowCount: 1,
              rows: [
                {
                  id: "shut-job-1",
                  paper_id: "paper-shut-1",
                  status: "processing",
                  attempts: 1,
                  max_attempts: 3,
                  lease_token: "token-shut",
                  paper_file_path: dummyPdf,
                },
              ],
            };
          }
          return { rowCount: 0, rows: [] };
        }
        if (s.includes("SELECT id FROM paper_extraction_jobs")) {
          return { rowCount: 1, rows: [{ id: "shut-job-1" }] };
        }
        if (s.includes("UPDATE paper_extraction_jobs") && s.includes("lease_expires_at")) {
          return { rowCount: 1, rows: [{ id: "shut-job-1" }] };
        }
        if (s.includes("UPDATE paper_extraction_jobs") && s.includes("status = 'completed'")) {
          return { rowCount: 1, rows: [{ id: "shut-job-1" }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const supervisor = new ExtractionSupervisor({
      dbPool: mockPool,
      concurrency: 1,
      pollIntervalMs: 20,
      heartbeatIntervalMs: 60000,
      workerScriptPath: mockWorkerScript,
      shutdownTimeoutMs: 2000,
    });

    try {
      supervisor.start();

      // Wait until job is claimed and running
      const startWait = Date.now();
      while (supervisor.activeCount === 0 && Date.now() - startWait < 1000) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Trigger graceful shutdown
      await supervisor.stop();

      assert.equal(supervisor.isRunning, false);
      assert.equal(supervisor.activeCount, 0, "Active jobs must be drained on graceful stop");
    } finally {
      await supervisor.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("forcibly terminates lingering workers when shutdown exceeds timeout", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sup-timeout-shut-"));
    const dummyPdf = path.join(tmpDir, "dummy.pdf");
    fs.writeFileSync(dummyPdf, "pdf content");

    // Worker that never finishes unless cancelled
    const mockHangingWorker = path.join(tmpDir, "hangingWorker.js");
    fs.writeFileSync(
      mockHangingWorker,
      `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (msg) => {
        // Do nothing on START; ignore completion
      });
      `
    );

    let claimed = false;
    const mockPool = {
      query: async (sql) => {
        const s = sql.trim();
        if (s.startsWith("BEGIN") || s.startsWith("COMMIT") || s.startsWith("ROLLBACK")) return { rowCount: 1 };
        if (s.includes("WITH candidate AS")) {
          if (!claimed) {
            claimed = true;
            return {
              rowCount: 1,
              rows: [
                {
                  id: "hang-job-1",
                  paper_id: "paper-hang-1",
                  status: "processing",
                  attempts: 1,
                  max_attempts: 3,
                  lease_token: "token-hang",
                  paper_file_path: dummyPdf,
                },
              ],
            };
          }
          return { rowCount: 0, rows: [] };
        }
        if (s.includes("SET status = 'pending'")) {
          return { rowCount: 1, rows: [{ id: "hang-job-1" }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const supervisor = new ExtractionSupervisor({
      dbPool: mockPool,
      concurrency: 1,
      pollIntervalMs: 20,
      heartbeatIntervalMs: 60000,
      workerScriptPath: mockHangingWorker,
      shutdownTimeoutMs: 100, // Short 100ms shutdown timeout
    });

    try {
      supervisor.start();

      // Wait until job is claimed and running
      const startWait = Date.now();
      while (supervisor.activeCount === 0 && Date.now() - startWait < 1000) {
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.equal(supervisor.activeCount, 1);

      // Stop with short timeout: must force-terminate the worker thread
      await supervisor.stop();

      assert.equal(supervisor.isRunning, false);
      assert.equal(supervisor.activeCount, 0, "Lingering worker must be terminated and cleared");
    } finally {
      await supervisor.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

