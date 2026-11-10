/**
 * extractionSupervisor.js
 *
 * FR-09 Phase 3.3.1: Background Extraction Worker Supervisor.
 *
 * Manages worker lifecycle, concurrency, polling loop, orphan job recovery,
 * duplicate startup prevention, and graceful shutdown.
 * Does NOT start automatically on module import.
 */

import crypto from "node:crypto";
import pool from "../config/database.js";
import { claimNextJob, recoverExhaustedJobs } from "../repositories/extractionJob.repository.js";
import { processExtractionJob } from "./extractionJobProcessor.js";
import { runOrphanRecoverySweep } from "./orphanRecoveryManager.js";

/**
 * Extraction Supervisor class.
 */
export class ExtractionSupervisor {
  /**
   * @param {object} [options]
   * @param {string} [options.workerId] - Unique ID for this supervisor instance
   * @param {number} [options.concurrency=2] - Max concurrent extraction jobs
   * @param {number} [options.pollIntervalMs=3000] - Polling delay when idle
   * @param {number} [options.orphanRecoveryIntervalMs=60000] - Interval for orphan job sweep
   * @param {number} [options.leaseDurationSeconds=45] - Lease time per claim/renew
   * @param {number} [options.heartbeatIntervalMs=15000] - Heartbeat renewal pulse
   * @param {number} [options.shutdownTimeoutMs=15000] - Graceful stop timeout
   * @param {string} [options.workerScriptPath] - Worker Thread script path
   * @param {string} [options.stagingBaseDir] - Staging directory
   * @param {string} [options.canonicalBaseDir] - Canonical assets directory
   * @param {object} [options.dbPool] - PostgreSQL connection pool
   */
  constructor(options = {}) {
    this.workerId = options.workerId || `worker-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    this.concurrency = Math.max(1, options.concurrency || 2);
    this.pollIntervalMs = options.pollIntervalMs || 3000;
    this.orphanRecoveryIntervalMs = options.orphanRecoveryIntervalMs || 60000;
    this.orphanGracePeriodMs = options.orphanGracePeriodMs || 3600000;
    this.leaseDurationSeconds = options.leaseDurationSeconds || 45;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 15000;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs || 15000;
    this.workerScriptPath = options.workerScriptPath;
    this.stagingBaseDir = options.stagingBaseDir;
    this.canonicalBaseDir = options.canonicalBaseDir;
    this.pool = options.dbPool || pool;

    this.isRunning = false;
    this.isShuttingDown = false;
    this.activeJobs = new Map();

    this._pollTimer = null;
    this._orphanTimer = null;
    this._wakePoll = null;
  }

  /**
   * Starts the supervisor polling loop and maintenance sweep.
   * Duplicate startup guard: throws if already running.
   */
  start() {
    if (this.isRunning) {
      throw new Error(`ExtractionSupervisor (${this.workerId}) is already running.`);
    }

    this.isRunning = true;
    this.isShuttingDown = false;

    // Start background orphan sweep
    this._startOrphanRecovery();

    // Start polling loop asynchronously
    this._runPollLoop();
  }

  /**
   * Returns current count of actively running jobs.
   */
  get activeCount() {
    return this.activeJobs.size;
  }

  /**
   * Main polling loop.
   * Continuously claims jobs while capacity permits.
   * @private
   */
  async _runPollLoop() {
    while (this.isRunning && !this.isShuttingDown) {
      try {
        if (this.activeJobs.size >= this.concurrency) {
          // Wait until a slot becomes available
          await this._waitForSlotOrDelay(this.pollIntervalMs);
          continue;
        }

        // Attempt to claim next job
        const job = await claimNextJob(this.pool, {
          workerId: this.workerId,
          leaseDurationSeconds: this.leaseDurationSeconds,
        });

        if (job) {
          // Launch job without blocking the poll loop
          this._executeJob(job);

          // If capacity remains, poll again immediately for next job
          if (this.activeJobs.size < this.concurrency) {
            continue;
          }
        } else {
          // No job claimed: idle wait
          await this._waitForSlotOrDelay(this.pollIntervalMs);
        }
      } catch (err) {
        if (!this.isRunning || this.isShuttingDown) break;
        // Backoff on transient database or claim errors
        await this._waitForSlotOrDelay(Math.min(this.pollIntervalMs * 2, 10000));
      }
    }
  }

  /**
   * Spawns execution for a claimed job and tracks it in activeJobs.
   * @private
   * @param {object} job
   */
  _executeJob(job) {
    let cancelHandler = null;

    const jobPromise = processExtractionJob({
      job,
      dbPool: this.pool,
      workerScriptPath: this.workerScriptPath,
      leaseDurationSeconds: this.leaseDurationSeconds,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      stagingBaseDir: this.stagingBaseDir,
      canonicalBaseDir: this.canonicalBaseDir,
      registerCancelHandler: (fn) => {
        cancelHandler = fn;
      },
    })
      .catch(() => {
        // Errors are already handled, released, or failed within processExtractionJob
      })
      .finally(() => {
        this.activeJobs.delete(job.id);
        if (this._wakePoll) {
          this._wakePoll();
        }
      });

    this.activeJobs.set(job.id, {
      job,
      promise: jobPromise,
      cancel: async () => {
        if (typeof cancelHandler === "function") {
          await cancelHandler();
        }
      },
      startedAt: Date.now(),
    });
  }

  /**
   * Waits for a slot to open or delay to elapse.
   * @private
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _waitForSlotOrDelay(ms) {
    return new Promise((resolve) => {
      let timer = null;
      const onWake = () => {
        if (timer) clearTimeout(timer);
        this._wakePoll = null;
        resolve();
      };

      this._wakePoll = onWake;
      timer = setTimeout(() => {
        this._wakePoll = null;
        resolve();
      }, ms);
    });
  }

  /**
   * Starts periodic orphan recovery timer.
   * @private
   */
  _startOrphanRecovery() {
    this._orphanTimer = setInterval(async () => {
      if (!this.isRunning || this.isShuttingDown) return;
      try {
        await recoverExhaustedJobs(this.pool);
        await runOrphanRecoverySweep({
          dbPool: this.pool,
          stagingBaseDir: this.stagingBaseDir,
          canonicalBaseDir: this.canonicalBaseDir,
          gracePeriodMs: this.orphanGracePeriodMs,
        });
      } catch {
        // Non-fatal background maintenance error
      }
    }, this.orphanRecoveryIntervalMs);

    if (this._orphanTimer.unref) {
      this._orphanTimer.unref();
    }
  }

  /**
   * Gracefully shuts down the supervisor.
   * 1. Stops polling.
   * 2. Clears maintenance sweep timer.
   * 3. Awaits active jobs up to shutdownTimeoutMs.
   *
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning && !this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.isRunning = false;

    if (this._orphanTimer) {
      clearInterval(this._orphanTimer);
      this._orphanTimer = null;
    }

    if (this._wakePoll) {
      this._wakePoll();
    }

    if (this.activeJobs.size === 0) {
      this.isShuttingDown = false;
      return;
    }

    // First await in-flight jobs gracefully up to shutdownTimeoutMs
    const pendingPromises = Array.from(this.activeJobs.values()).map((entry) => entry.promise);
    let didTimeout = false;
    const timeoutPromise = new Promise((resolve) => setTimeout(() => {
      didTimeout = true;
      resolve();
    }, this.shutdownTimeoutMs));

    await Promise.race([
      Promise.allSettled(pendingPromises),
      timeoutPromise,
    ]);

    // If timeout was reached and jobs are still running, forcefully cancel & terminate them
    if (didTimeout && this.activeJobs.size > 0) {
      const cancelPromises = [];
      for (const entry of this.activeJobs.values()) {
        if (typeof entry.cancel === "function") {
          cancelPromises.push(entry.cancel().catch(() => {}));
        }
      }
      await Promise.allSettled(cancelPromises);

      // Await settling of remaining in-flight promises after termination
      const remainingPromises = Array.from(this.activeJobs.values()).map((e) => e.promise);
      await Promise.allSettled(remainingPromises);
    }

    this.activeJobs.clear();
    this.isShuttingDown = false;
  }
}

/**
 * Factory function to create an ExtractionSupervisor instance without starting it.
 *
 * @param {object} [options]
 * @returns {ExtractionSupervisor}
 */
export function createSupervisor(options) {
  return new ExtractionSupervisor(options);
}

