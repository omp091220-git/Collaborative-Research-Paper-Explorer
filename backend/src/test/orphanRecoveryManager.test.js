/**
 * orphanRecoveryManager.test.js
 *
 * FR-09 Phase 3.3.3: Unit Tests for Crash-Orphan Staging & Permanent Asset Recovery.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  cleanStaleStagingDirectories,
  cleanOrphanPermanentAssets,
  runOrphanRecoverySweep,
} from "../workers/orphanRecoveryManager.js";

describe("orphanRecoveryManager — Staging Directory Recovery", () => {
  it("preserves active jobs with valid leases even if older than grace period", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-stg-active-"));
    const stagingBase = path.join(tmpDir, "staging");
    const jobId = "job-active-123";
    const attPath = path.join(stagingBase, jobId, "att-1");
    fs.mkdirSync(attPath, { recursive: true });
    fs.writeFileSync(path.join(attPath, "img.png"), "data");

    // Artificially age the attempt directory to 10 seconds ago
    const pastTime = new Date(Date.now() - 10000);
    fs.utimesSync(attPath, pastTime, pastTime);

    const mockPool = {
      query: async (sql, params) => {
        // Returns active job with future lease expiration
        return {
          rowCount: 1,
          rows: [
            {
              id: jobId,
              status: "processing",
              lease_expires_at: new Date(Date.now() + 60000).toISOString(),
            },
          ],
        };
      },
    };

    try {
      const result = await cleanStaleStagingDirectories({
        dbPool: mockPool,
        stagingBaseDir: stagingBase,
        gracePeriodMs: 5000, // 5s grace period
      });

      assert.equal(result.cleanedAttempts, 0);
      assert.ok(fs.existsSync(attPath), "Active leased attempt staging must NEVER be deleted");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("removes abandoned staging directories after grace period for completed or failed jobs", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-stg-clean-"));
    const stagingBase = path.join(tmpDir, "staging");
    const jobId = "job-failed-456";
    const attPath = path.join(stagingBase, jobId, "att-1");
    fs.mkdirSync(attPath, { recursive: true });
    fs.writeFileSync(path.join(attPath, "stale.png"), "data");

    // Age the directory past grace period
    const pastTime = new Date(Date.now() - 15000);
    fs.utimesSync(attPath, pastTime, pastTime);

    const mockPool = {
      query: async () => ({
        rowCount: 1,
        rows: [{ id: jobId, status: "failed", lease_expires_at: null }],
      }),
    };

    try {
      const result = await cleanStaleStagingDirectories({
        dbPool: mockPool,
        stagingBaseDir: stagingBase,
        gracePeriodMs: 5000,
      });

      assert.equal(result.cleanedAttempts, 1);
      assert.equal(fs.existsSync(attPath), false, "Abandoned staging directory must be purged");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("orphanRecoveryManager — Permanent Asset Recovery", () => {
  it("preserves committed attempt assets while purging uncommitted orphan attempt files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-perm-clean-"));
    const canonicalBase = path.join(tmpDir, "canonical");
    const paperId = "paper-1";
    const jobId = "job-1";

    const committedAtt = path.join(canonicalBase, paperId, jobId, "att-2");
    const abandonedAtt = path.join(canonicalBase, paperId, jobId, "att-1");
    fs.mkdirSync(committedAtt, { recursive: true });
    fs.mkdirSync(abandonedAtt, { recursive: true });

    fs.writeFileSync(path.join(committedAtt, "fig.png"), "committed");
    fs.writeFileSync(path.join(abandonedAtt, "old.png"), "abandoned");

    // Age both past grace period
    const pastTime = new Date(Date.now() - 15000);
    fs.utimesSync(committedAtt, pastTime, pastTime);
    fs.utimesSync(abandonedAtt, pastTime, pastTime);

    const mockPool = {
      query: async (sql, params) => {
        if (sql.includes("FROM paper_extraction_jobs")) {
          return {
            rowCount: 1,
            rows: [{ id: jobId, status: "completed", lease_expires_at: null }],
          };
        }
        if (sql.includes("FROM paper_assets")) {
          // Att-2 is the committed one
          return {
            rowCount: 1,
            rows: [
              {
                file_path: `uploads/assets/${paperId}/${jobId}/att-2/fig.png`,
              },
            ],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    try {
      const result = await cleanOrphanPermanentAssets({
        dbPool: mockPool,
        canonicalBaseDir: canonicalBase,
        gracePeriodMs: 5000,
      });

      assert.equal(result.cleanedAttempts, 1);
      assert.ok(fs.existsSync(committedAtt), "Committed attempt files must NEVER be deleted");
      assert.equal(fs.existsSync(abandonedAtt), false, "Uncommitted attempt files must be cleaned");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("is idempotent and safe when executed multiple times consecutively", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-idem-"));
    const stagingBase = path.join(tmpDir, "staging");
    const canonicalBase = path.join(tmpDir, "canonical");

    const mockPool = {
      query: async () => ({ rowCount: 0, rows: [] }),
    };

    try {
      const sweep1 = await runOrphanRecoverySweep({
        dbPool: mockPool,
        stagingBaseDir: stagingBase,
        canonicalBaseDir: canonicalBase,
        gracePeriodMs: 1000,
      });
      assert.equal(sweep1.stagingCleaned, 0);
      assert.equal(sweep1.permanentCleaned, 0);

      const sweep2 = await runOrphanRecoverySweep({
        dbPool: mockPool,
        stagingBaseDir: stagingBase,
        canonicalBaseDir: canonicalBase,
        gracePeriodMs: 1000,
      });
      assert.equal(sweep2.stagingCleaned, 0);
      assert.equal(sweep2.permanentCleaned, 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

