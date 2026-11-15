/**
 * extractionJobProcessor.js
 *
 * FR-09 Phase 3.3.1: Extraction Job Processor & Lifecycle Coordinator.
 *
 * Coordinates execution of a single claimed extraction job:
 * 1. Initializes attempt-specific staging environment.
 * 2. Starts periodic lease heartbeat timer with fencing.
 * 3. Spawns isolated Worker Thread for CPU-heavy PDF parsing and rendering.
 * 4. Relays progress notifications.
 * 5. On completion: atomically promotes assets, inserts DB records, marks job complete.
 * 6. On failure: unlinks staging, terminates worker, evaluates retry eligibility.
 */

import path from "node:path";
import fs from "node:fs";
import { Worker } from "node:worker_threads";
import pool from "../config/database.js";
import { LeaseHeartbeat } from "./leaseHeartbeat.js";
import { commitExtractionJobTransaction } from "./atomicPersistence.js";
import { releaseJobForRetry, failJob } from "../repositories/extractionJob.repository.js";
import { cleanStagingDirectory } from "../utils/assetStagingManager.js";
import { DEFAULT_RENDER_SCALE } from "../utils/regionCropper.js";
import { fileURLToPath } from "node:url";

// Resolve __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repository root: three levels up from backend/src/workers -> backend -> repo root
const REPO_ROOT = path.resolve(__dirname, "../../..");

// Repository-root-based directory defaults
export const DEFAULT_STAGING_BASE_DIR = path.resolve(REPO_ROOT, "uploads/assets/.staging");
export const DEFAULT_CANONICAL_BASE_DIR = path.resolve(REPO_ROOT, "uploads/assets");

// Default worker script resolved relative to this file's directory
const DEFAULT_WORKER_SCRIPT = path.resolve(__dirname, "extractionWorkerThread.js");

/**
 * Resolves the absolute path for a paper PDF file from stored path.
 *
 * The stored `file_path` is relative to the **repository root** (three levels up
 * from this file). Previously we used `process.cwd()`, which broke when the
 * backend was started from the `backend/` directory. We now resolve relative
 * paths against the repository root, regardless of the current working
 * directory.
 */
export function resolvePaperPdfPath(rawPath) {
  if (!rawPath) return "";
  if (path.isAbsolute(rawPath)) return rawPath;
  return path.resolve(REPO_ROOT, rawPath);
}

/**
 * Executes extraction for a single claimed job record.
 *
 * @param {object} params
 * @param {object} params.job - Job row claimed via claimNextJob
 * @param {object} [params.client] - PostgreSQL client for transactions
 * @param {string} [params.workerScriptPath] - Custom worker thread script
 * @param {number} [params.leaseDurationSeconds=45]
 * @param {number} [params.heartbeatIntervalMs=15000]
 * @param {number} [params.renderScale=DEFAULT_RENDER_SCALE]
 * @param {string} [params.stagingBaseDir=DEFAULT_STAGING_BASE_DIR]
 * @param {string} [params.canonicalBaseDir=DEFAULT_CANONICAL_BASE_DIR]
 * @param {function} [params.onProgress]
 * @returns {Promise<{ success: boolean, jobId: string, paperId: string, assetsCount: number, assets?: object[], statistics?: object }>} 
 */
export async function processExtractionJob({
  job,
  client: providedClient,
  dbPool = pool,
  workerScriptPath = DEFAULT_WORKER_SCRIPT,
  leaseDurationSeconds = 45,
  heartbeatIntervalMs = 15000,
  maxJobDurationMs = 600000,
  renderScale = DEFAULT_RENDER_SCALE,
  stagingBaseDir = DEFAULT_STAGING_BASE_DIR,
  canonicalBaseDir = DEFAULT_CANONICAL_BASE_DIR,
  onProgress = () => {},
  registerCancelHandler = () => {},
}) {
  if (!job || !job.id || !job.paper_id || !job.lease_token) {
    throw new Error("processExtractionJob: Invalid or un-leased job record provided.");
  }

  const attemptId = `att-${job.attempts || 1}`;
  let client = providedClient;
  let ownClient = false;

  if (!client) {
    if (dbPool && typeof dbPool.connect === "function") {
      client = await dbPool.connect();
      ownClient = true;
    } else {
      client = dbPool;
    }
  }

  let worker = null;
  let heartbeat = null;
  let isCancelled = false;
  let isLeaseLost = false;
  let isTimedOut = false;
  let timeoutTimer = null;
  let workerTerminationTimer = null;
  let stopHeartbeatPromise = null;

  const stopHeartbeat = async () => {
    if (!heartbeat) return;
    if (!stopHeartbeatPromise) {
      stopHeartbeatPromise = heartbeat.stop().catch(() => {});
    }
    return stopHeartbeatPromise;
  };

  const scheduleWorkerTermination = (delayMs = 500) => {
    if (!workerTerminationTimer) {
      workerTerminationTimer = setTimeout(() => {
        if (worker) worker.terminate().catch(() => {});
      }, delayMs);
      if (workerTerminationTimer.unref) workerTerminationTimer.unref();
    }
  };

  const clearWorkerTermination = () => {
    if (workerTerminationTimer) {
      clearTimeout(workerTerminationTimer);
      workerTerminationTimer = null;
    }
  };

  try {
    // Register cancel handler for supervisor graceful shutdown
    registerCancelHandler(async () => {
      isCancelled = true;
      if (worker) {
        try { worker.postMessage({ type: "CANCEL" }); } catch {}
        scheduleWorkerTermination(500);
      }
      await stopHeartbeat();
    });

    // 1. Initialize lease heartbeat
    heartbeat = new LeaseHeartbeat({
      client,
      jobId: job.id,
      leaseToken: job.lease_token,
      leaseDurationSeconds,
      heartbeatIntervalMs,
      onLeaseLost: (err) => {
        isLeaseLost = true;
        isCancelled = true;
        if (worker) {
          try { worker.postMessage({ type: "CANCEL" }); } catch {}
          scheduleWorkerTermination(500);
        }
      },
    });
    heartbeat.start();

    // 2. Resolve PDF path
    const pdfPath = resolvePaperPdfPath(job.paper_file_path);
    if (!fs.existsSync(pdfPath)) {
      const err = new Error(`Source PDF file not found at: ${pdfPath}`);
      err.code = "PDF_NOT_FOUND";
      throw err;
    }

    // 3. Start execution duration watchdog timer
    timeoutTimer = setTimeout(async () => {
      isTimedOut = true;
      isCancelled = true;
      if (worker) {
        try { worker.postMessage({ type: "CANCEL" }); } catch {}
        scheduleWorkerTermination(500);
      }
      await stopHeartbeat();
    }, maxJobDurationMs);
    if (timeoutTimer.unref) timeoutTimer.unref();

    // 4. Spawn Worker Thread with clean execArgv
    worker = new Worker(workerScriptPath, { execArgv: [] });

    // Handle the case where cancellation occurred before worker assignment
    if (isCancelled) {
      try { worker.postMessage({ type: "CANCEL" }); } catch {}
      scheduleWorkerTermination(500);
    }

    // 5. Await extraction completion from Worker Thread
    const extractionResult = await new Promise((resolve, reject) => {
      let settled = false;

      const safeResolve = (val) => {
        if (settled) return;
        settled = true;
        clearWorkerTermination();
        resolve(val);
      };

      const safeReject = (err) => {
        if (settled) return;
        settled = true;
        clearWorkerTermination();
        reject(err);
      };

      worker.on("message", (msg) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "PROGRESS") {
          onProgress(msg.payload);
        } else if (msg.type === "COMPLETE") {
          safeResolve(msg.payload);
        } else if (msg.type === "ERROR") {
          const err = new Error(msg.error?.message || "Worker extraction failed");
          if (msg.error?.code) err.code = msg.error.code;
          safeReject(err);
        }
      });

      worker.on("error", (err) => {
        safeReject(err);
      });

      worker.on("exit", (code) => {
        if (settled) return;
        if (isTimedOut) {
          const err = new Error(`Job execution exceeded maximum allowed duration of ${maxJobDurationMs}ms.`);
          err.code = "JOB_EXECUTION_TIMEOUT";
          return safeReject(err);
        }
        if (isLeaseLost) {
          const err = new Error("Lease lost before persistence could be established.");
          err.code = "LEASE_LOST_BEFORE_PERSISTENCE";
          return safeReject(err);
        }
        if (isCancelled) {
          const err = new Error("Extraction cancelled due to lease expiration or supervisor shutdown.");
          err.code = "EXTRACTION_CANCELLED";
          return safeReject(err);
        }
        if (code !== 0) {
          return safeReject(new Error(`Worker thread exited abnormally with code ${code}`));
        }
        const err = new Error("Worker thread exited with code 0 without completing extraction.");
        err.code = "WORKER_EXIT_WITHOUT_RESULT";
        return safeReject(err);
      });

      worker.postMessage({
        type: "START",
        payload: {
          jobId: job.id,
          attemptId,
          paperId: job.paper_id,
          pdfPath,
          stagingBaseDir,
          canonicalBaseDir,
          renderScale,
        },
      });
    });

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    clearWorkerTermination();

    if (isTimedOut) {
      const err = new Error(`Job execution exceeded maximum allowed duration of ${maxJobDurationMs}ms.`);
      err.code = "JOB_EXECUTION_TIMEOUT";
      throw err;
    }

    if (isLeaseLost) {
      const err = new Error("Lease lost before persistence could be established.");
      err.code = "LEASE_LOST_BEFORE_PERSISTENCE";
      throw err;
    }

    if (isCancelled) {
      const err = new Error("Extraction cancelled due to lease expiration or supervisor shutdown.");
      err.code = "EXTRACTION_CANCELLED";
      throw err;
    }

    // 6. Extraction succeeded: pulse heartbeat to ensure fresh lease window before transaction
    if (heartbeat.isRenewing) {
      await heartbeat.waitForPendingPulse();
    }
    if (heartbeat.isActive) {
      await heartbeat.pulse();
    }

    if (isLeaseLost) {
      const err = new Error("Lease lost before persistence could be established.");
      err.code = "LEASE_LOST_BEFORE_PERSISTENCE";
      throw err;
    }

    // Stop heartbeat timer cleanly and await any in-flight pulse query
    await stopHeartbeat();

    if (isCancelled) {
      const err = new Error("Extraction cancelled due to lease expiration or supervisor shutdown.");
      err.code = "EXTRACTION_CANCELLED";
      throw err;
    }

    // 7. Atomically persist assets and complete job under FOR UPDATE row-level lock
    const persistenceResult = await commitExtractionJobTransaction({
      client,
      paperId: job.paper_id,
      jobId: job.id,
      leaseToken: job.lease_token,
      assets: extractionResult.assets,
      attemptId,
      stagingBaseDir,
      canonicalBaseDir,
    });

    return {
      success: true,
      jobId: job.id,
      paperId: job.paper_id,
      assetsCount: persistenceResult.assetsCount,
      assets: persistenceResult.assets,
      statistics: extractionResult.statistics,
    };
  } catch (err) {
    await stopHeartbeat();

    // Clean up temporary attempt staging
    await cleanStagingDirectory(job.id, attemptId, stagingBaseDir).catch(() => {});

    // Evaluate retry policy
    const canRetry =
      (job.attempts < job.max_attempts) &&
      err.code !== "PDF_NOT_FOUND" &&
      err.code !== "LEASE_FENCING_FAILED" &&
      err.code !== "LEASE_LOST_ON_COMPLETION" &&
      err.code !== "LEASE_LOST_BEFORE_PERSISTENCE";

    if (canRetry) {
      await releaseJobForRetry(client, {
        jobId: job.id,
        leaseToken: job.lease_token,
        errorMessage: err.message,
      }).catch(() => {});
    } else {
      await failJob(client, {
        jobId: job.id,
        leaseToken: job.lease_token,
        errorMessage: err.message,
      }).catch(() => {});
    }

    throw err;
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
    clearWorkerTermination();
    if (worker) {
      await worker.terminate().catch(() => {});
    }
    if (ownClient && client) {
      client.release();
    }
  }
}
