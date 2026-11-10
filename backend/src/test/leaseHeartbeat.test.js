/**
 * leaseHeartbeat.test.js
 *
 * FR-09 Phase 3.3.1: Unit & Concurrency Test Suite for Lease Heartbeat Manager.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LeaseHeartbeat } from "../workers/leaseHeartbeat.js";

describe("LeaseHeartbeat — Unit & Lifecycle Tests", () => {
  it("throws if jobId or leaseToken are missing", () => {
    assert.throws(() => new LeaseHeartbeat({}), /valid jobId/);
    assert.throws(() => new LeaseHeartbeat({ jobId: "job-1" }), /valid leaseToken/);
  });

  it("successfully pulses and extends lease when renewFn succeeds", async () => {
    let callCount = 0;
    const mockRenew = async (client, params) => {
      callCount++;
      assert.equal(params.jobId, "job-100");
      assert.equal(params.leaseToken, "token-abc");
      assert.equal(params.leaseDurationSeconds, 45);
      return true;
    };

    const heartbeat = new LeaseHeartbeat({
      jobId: "job-100",
      leaseToken: "token-abc",
      renewFn: mockRenew,
    });

    heartbeat.start();
    const result = await heartbeat.pulse();
    heartbeat.stop();

    assert.equal(result, true);
    assert.equal(callCount, 1);
  });

  it("detects expired or revoked lease and invokes onLeaseLost callback", async () => {
    let lostPayload = null;
    const mockRenew = async () => false; // Lease was lost

    const heartbeat = new LeaseHeartbeat({
      jobId: "job-200",
      leaseToken: "token-xyz",
      renewFn: mockRenew,
      onLeaseLost: (info) => {
        lostPayload = info;
      },
    });

    heartbeat.start();
    const result = await heartbeat.pulse();

    assert.equal(result, false);
    assert.equal(heartbeat.isActive, false, "Heartbeat should halt upon lease loss");
    assert.ok(lostPayload);
    assert.equal(lostPayload.jobId, "job-200");
    assert.equal(lostPayload.leaseToken, "token-xyz");
    assert.equal(lostPayload.reason, "LEASE_EXPIRED_OR_REVOKED");
  });

  it("handles database query exceptions safely and halts heartbeat", async () => {
    let lostPayload = null;
    const mockRenew = async () => {
      throw new Error("Connection terminated unexpectedly");
    };

    const heartbeat = new LeaseHeartbeat({
      jobId: "job-300",
      leaseToken: "token-err",
      renewFn: mockRenew,
      onLeaseLost: (info) => {
        lostPayload = info;
      },
    });

    heartbeat.start();
    const result = await heartbeat.pulse();

    assert.equal(result, false);
    assert.equal(heartbeat.isActive, false);
    assert.ok(lostPayload);
    assert.equal(lostPayload.reason, "HEARTBEAT_QUERY_ERROR");
    assert.equal(lostPayload.error.message, "Connection terminated unexpectedly");
  });

  it("prevents overlapping pulses while renewal query is in flight", async () => {
    let concurrentCalls = 0;
    let maxConcurrent = 0;

    const mockRenew = async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((r) => setTimeout(r, 20));
      concurrentCalls--;
      return true;
    };

    const heartbeat = new LeaseHeartbeat({
      jobId: "job-400",
      leaseToken: "token-concurrent",
      renewFn: mockRenew,
    });

    heartbeat.start();
    // Fire two pulses concurrently
    const [p1, p2] = await Promise.all([heartbeat.pulse(), heartbeat.pulse()]);
    heartbeat.stop();

    assert.equal(maxConcurrent, 1, "Only one pulse should execute concurrently");
    assert.ok(p1 || p2);
  });

  it("cancels periodic renewal cleanly when stopped", async () => {
    let pulseCount = 0;
    const mockRenew = async () => {
      pulseCount++;
      return true;
    };

    const heartbeat = new LeaseHeartbeat({
      jobId: "job-500",
      leaseToken: "token-timer",
      heartbeatIntervalMs: 25,
      renewFn: mockRenew,
    });

    heartbeat.start();
    await new Promise((r) => setTimeout(r, 70)); // Expect 2 pulses
    await heartbeat.stop();
    const countAtStop = pulseCount;

    await new Promise((r) => setTimeout(r, 50));
    assert.equal(pulseCount, countAtStop, "No further pulses after stop()");
  });

  it("does not emit false onLeaseLost callback when in-flight pulse completes after stop() (persistence race)", async () => {
    let leaseLostCalled = false;
    let queryPromiseResolve;

    const mockRenew = async () => {
      await new Promise((resolve) => {
        queryPromiseResolve = resolve;
      });
      // Simulate query returning false (e.g. job already marked completed in DB)
      return false;
    };

    const heartbeat = new LeaseHeartbeat({
      jobId: "job-race-600",
      leaseToken: "token-race",
      onLeaseLost: () => {
        leaseLostCalled = true;
      },
      renewFn: mockRenew,
    });

    heartbeat.start();

    // Trigger an asynchronous pulse that blocks inside mockRenew
    const pulsePromise = heartbeat.pulse();

    // Schedule unblocking of the in-flight query
    setTimeout(() => {
      queryPromiseResolve();
    }, 15);

    // stop() will cleanly await the in-flight pulse to settle
    await heartbeat.stop();
    await pulsePromise;

    assert.equal(
      leaseLostCalled,
      false,
      "In-flight pulse completing after stop() must NOT fire onLeaseLost"
    );
  });
});

