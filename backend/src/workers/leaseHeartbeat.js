/**
 * leaseHeartbeat.js
 *
 * FR-09 Phase 3.3.1: Distributed Job Lease Heartbeat Manager.
 *
 * Maintains active lease ownership on paper_extraction_jobs by periodically
 * extending lease_expires_at (15s heartbeat interval for 45s lease duration).
 * Enforces fail-closed lease loss detection: if lease renewal fails or throws,
 * immediately notifies the supervisor via onLeaseLost and halts further renewal.
 */

import { renewLease } from "../repositories/extractionJob.repository.js";

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000;
export const DEFAULT_LEASE_DURATION_SECONDS = 45;

export class LeaseHeartbeat {
  /**
   * @param {object} params
   * @param {string} params.jobId - UUID of the extraction job
   * @param {string} params.leaseToken - Secret lease token assigned during claim
   * @param {function} [params.onLeaseLost] - Callback invoked when lease renewal fails
   * @param {number} [params.heartbeatIntervalMs=15000] - Interval between renewal pulses
   * @param {number} [params.leaseDurationSeconds=45] - Seconds by which lease is extended
   * @param {function} [params.renewFn] - Optional mockable renewal function (defaults to repo renewLease)
   */
  constructor({
    client = null,
    jobId,
    leaseToken,
    onLeaseLost,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    leaseDurationSeconds = DEFAULT_LEASE_DURATION_SECONDS,
    renewFn = renewLease,
  }) {
    if (!jobId || typeof jobId !== "string") {
      throw new Error("LeaseHeartbeat requires a valid jobId string");
    }
    if (!leaseToken || typeof leaseToken !== "string") {
      throw new Error("LeaseHeartbeat requires a valid leaseToken string");
    }

    this.client = client;
    this.jobId = jobId;
    this.leaseToken = leaseToken;
    this.onLeaseLost = onLeaseLost || (() => {});
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.leaseDurationSeconds = leaseDurationSeconds;
    this.renewFn = renewFn;

    this.timer = null;
    this.isActive = false;
    this.isRenewing = false;
    this._pendingPulseResolve = null;
  }

  /**
   * Starts the periodic heartbeat timer.
   */
  start() {
    if (this.isActive) return;
    this.isActive = true;

    this.timer = setInterval(async () => {
      await this.pulse();
    }, this.heartbeatIntervalMs);

    // Unref timer so it does not block Node process exit during shutdown
    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  /**
   * Waits for any in-flight renewal pulse to conclude.
   *
   * @returns {Promise<void>}
   */
  async waitForPendingPulse() {
    if (this.isRenewing) {
      await new Promise((resolve) => {
        this._pendingPulseResolve = resolve;
      });
    }
  }

  /**
   * Executes a single heartbeat renewal pulse.
   *
   * @returns {Promise<boolean>} True if renewed successfully; false if lease was lost
   */
  async pulse() {
    if (!this.isActive || this.isRenewing) {
      return false;
    }

    this.isRenewing = true;
    try {
      const renewed = await this.renewFn(this.client, {
        jobId: this.jobId,
        leaseToken: this.leaseToken,
        leaseDurationSeconds: this.leaseDurationSeconds,
      });

      // If heartbeat was stopped while query was in-flight, ignore result and avoid false loss callback
      if (!this.isActive) {
        return false;
      }

      if (!renewed) {
        this._handleLoss("LEASE_EXPIRED_OR_REVOKED");
        return false;
      }

      return true;
    } catch (err) {
      if (!this.isActive) {
        return false;
      }
      this._handleLoss("HEARTBEAT_QUERY_ERROR", err);
      return false;
    } finally {
      this.isRenewing = false;
      if (this._pendingPulseResolve) {
        this._pendingPulseResolve();
        this._pendingPulseResolve = null;
      }
    }
  }

  /**
   * Halts the heartbeat timer and awaits any in-flight pulse.
   */
  async stop() {
    this.isActive = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.waitForPendingPulse();
  }

  /**
   * Internal lease loss handler.
   *
   * @param {string} reason
   * @param {Error} [error]
   */
  _handleLoss(reason, error) {
    if (!this.isActive) return;
    this.isActive = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.onLeaseLost({
        jobId: this.jobId,
        leaseToken: this.leaseToken,
        reason,
        error: error || null,
      });
    } catch {
      // Prevent callback exceptions from uncaught propagation
    }
  }
}

