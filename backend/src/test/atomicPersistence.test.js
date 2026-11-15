/**
 * atomicPersistence.test.js
 *
 * FR-09 Phase 3.3.1: Unit Tests for Atomic Persistence & Filesystem Rollback.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  promoteStagedAsset,
  rollbackPromotedFiles,
  commitExtractionJobTransaction,
} from "../workers/atomicPersistence.js";

describe("atomicPersistence — Filesystem Promotion & Rollback", () => {
  it("promotes staged file to canonical location", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-test-"));
    const stagedPath = path.join(tmpDir, "staged.png");
    const canonicalPath = path.join(tmpDir, "canonical/nested/asset.png");

    fs.writeFileSync(stagedPath, Buffer.from("fake-png-data"));

    try {
      const result = await promoteStagedAsset(stagedPath, canonicalPath);
      assert.equal(result, canonicalPath);
      assert.ok(fs.existsSync(canonicalPath));
      assert.equal(fs.readFileSync(canonicalPath, "utf-8"), "fake-png-data");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails promotion with STAGED_ASSET_NOT_FOUND if source does not exist", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-test-"));
    const stagedPath = path.join(tmpDir, "nonexistent.png");
    const canonicalPath = path.join(tmpDir, "canonical.png");

    try {
      await assert.rejects(
        async () => {
          await promoteStagedAsset(stagedPath, canonicalPath);
        },
        (err) => {
          assert.equal(err.code, "STAGED_ASSET_NOT_FOUND");
          return true;
        }
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rollbackPromotedFiles deletes tracked files without throwing on missing files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-test-"));
    const file1 = path.join(tmpDir, "file1.png");
    const file2 = path.join(tmpDir, "file2.png");
    const missing = path.join(tmpDir, "missing.png");

    fs.writeFileSync(file1, "1");
    fs.writeFileSync(file2, "2");

    try {
      await rollbackPromotedFiles([file1, file2, missing]);
      assert.equal(fs.existsSync(file1), false);
      assert.equal(fs.existsSync(file2), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("atomicPersistence — commitExtractionJobTransaction", () => {
  it("commits successfully and removes staging when lease and DB succeed", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-tx-"));
    const stagingDir = path.join(tmpDir, "staging");
    const canonicalDir = path.join(tmpDir, "canonical");
    const jobId = "11111111-1111-4111-8111-111111111111";
    const attemptId = "att-1";
    const paperId = "22222222-2222-4222-8222-222222222222";
    const leaseToken = "33333333-3333-4333-8333-333333333333";

    // Setup staging file
    const stagedAttemptDir = path.join(stagingDir, jobId, attemptId);
    fs.mkdirSync(stagedAttemptDir, { recursive: true });
    const stagedFilePath = path.join(stagedAttemptDir, "figure_p1_1.png");
    fs.writeFileSync(stagedFilePath, "test-figure-content");

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });
        if (sql.startsWith("BEGIN") || sql.startsWith("COMMIT")) {
          return { rowCount: 1 };
        }
        if (sql.includes("SELECT id FROM paper_extraction_jobs")) {
          // Fencing check succeeds
          return { rowCount: 1, rows: [{ id: jobId }] };
        }
        if (sql.includes("INSERT INTO paper_assets")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: "asset-uuid-1",
                paper_id: paperId,
                job_id: jobId,
                file_path: `uploads/assets/${paperId}/${jobId}/figure_p1_1.png`,
              },
            ],
          };
        }
        if (sql.includes("UPDATE paper_extraction_jobs")) {
          return { rowCount: 1, rows: [{ id: jobId }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    try {
      const result = await commitExtractionJobTransaction({
        client: mockClient,
        paperId,
        jobId,
        leaseToken,
        assets: [
          {
            assetType: "figure",
            pageNumber: 1,
            assetOrder: 1,
            filename: "figure_p1_1.png",
            stagedFilePath,
            fileSizeBytes: 19,
            mimeType: "image/png",
          },
        ],
        attemptId,
        stagingBaseDir: stagingDir,
        canonicalBaseDir: canonicalDir,
      });

      assert.ok(result);
      assert.equal(result.assetsCount, 1);
      assert.ok(executedQueries.some((q) => q.sql === "BEGIN"));
      assert.ok(executedQueries.some((q) => q.sql === "COMMIT"));

      // Verify canonical file exists
      const canonicalFile = path.join(canonicalDir, paperId, jobId, attemptId, "figure_p1_1.png");
      assert.ok(fs.existsSync(canonicalFile));
      assert.equal(fs.readFileSync(canonicalFile, "utf-8"), "test-figure-content");

      // Verify staging attempt directory was cleaned
      assert.equal(fs.existsSync(stagedAttemptDir), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rolls back DB and unlinks promoted files when lease fencing check fails", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-fence-fail-"));
    const stagingDir = path.join(tmpDir, "staging");
    const canonicalDir = path.join(tmpDir, "canonical");
    const jobId = "11111111-1111-4111-8111-111111111111";
    const attemptId = "att-1";
    const paperId = "22222222-2222-4222-8222-222222222222";
    const leaseToken = "expired-lease-token";

    // Setup staging file
    const stagedAttemptDir = path.join(stagingDir, jobId, attemptId);
    fs.mkdirSync(stagedAttemptDir, { recursive: true });
    const stagedFilePath = path.join(stagedAttemptDir, "table_p1_1.png");
    fs.writeFileSync(stagedFilePath, "table-content");

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });
        if (sql.startsWith("BEGIN")) return { rowCount: 1 };
        if (sql.startsWith("ROLLBACK")) return { rowCount: 1 };
        if (sql.includes("SELECT id FROM paper_extraction_jobs")) {
          // Fencing check fails (0 rows returned because lease expired or was stolen)
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const canonicalFile = path.join(canonicalDir, paperId, jobId, attemptId, "table_p1_1.png");

    try {
      await assert.rejects(
        async () => {
          await commitExtractionJobTransaction({
            client: mockClient,
            paperId,
            jobId,
            leaseToken,
            assets: [
              {
                assetType: "table",
                pageNumber: 1,
                assetOrder: 1,
                filename: "table_p1_1.png",
                stagedFilePath,
                fileSizeBytes: 13,
                mimeType: "image/png",
              },
            ],
            attemptId,
            stagingBaseDir: stagingDir,
            canonicalBaseDir: canonicalDir,
          });
        },
        (err) => {
          assert.equal(err.code, "LEASE_FENCING_FAILED");
          return true;
        }
      );

      // Verify ROLLBACK was executed
      assert.ok(executedQueries.some((q) => q.sql === "ROLLBACK"));

      // Compensating filesystem rollback: promoted file MUST NOT remain on disk!
      assert.equal(fs.existsSync(canonicalFile), false, "Promoted file must be unlinked on transaction abort");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rolls back DB and unlinks promoted files when database insert fails", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-db-fail-"));
    const stagingDir = path.join(tmpDir, "staging");
    const canonicalDir = path.join(tmpDir, "canonical");
    const jobId = "11111111-1111-4111-8111-111111111111";
    const attemptId = "att-1";
    const paperId = "22222222-2222-4222-8222-222222222222";
    const leaseToken = "valid-lease-token";

    // Setup staging file
    const stagedAttemptDir = path.join(stagingDir, jobId, attemptId);
    fs.mkdirSync(stagedAttemptDir, { recursive: true });
    const stagedFilePath = path.join(stagedAttemptDir, "chart_p1_1.png");
    fs.writeFileSync(stagedFilePath, "chart-content");

    const executedQueries = [];
    const mockClient = {
      query: async (sql, params) => {
        executedQueries.push({ sql: sql.trim(), params });
        if (sql.startsWith("BEGIN")) return { rowCount: 1 };
        if (sql.startsWith("ROLLBACK")) return { rowCount: 1 };
        if (sql.includes("SELECT id FROM paper_extraction_jobs")) {
          return { rowCount: 1, rows: [{ id: jobId }] };
        }
        if (sql.includes("INSERT INTO paper_assets")) {
          throw new Error("Simulated DB connection or disk error");
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const canonicalFile = path.join(canonicalDir, paperId, jobId, attemptId, "chart_p1_1.png");

    try {
      await assert.rejects(
        async () => {
          await commitExtractionJobTransaction({
            client: mockClient,
            paperId,
            jobId,
            leaseToken,
            assets: [
              {
                assetType: "chart",
                pageNumber: 1,
                assetOrder: 1,
                filename: "chart_p1_1.png",
                stagedFilePath,
                fileSizeBytes: 13,
                mimeType: "image/png",
              },
            ],
            attemptId,
            stagingBaseDir: stagingDir,
            canonicalBaseDir: canonicalDir,
          });
        },
        (err) => {
          assert.ok(err.message.includes("Simulated DB connection"));
          return true;
        }
      );

      // Verify ROLLBACK was executed
      assert.ok(executedQueries.some((q) => q.sql === "ROLLBACK"));

      // Verify promoted file was unlinked
      assert.equal(fs.existsSync(canonicalFile), false, "Promoted file must be cleaned up on failure");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("isolates attempts so expired worker A rollback cannot delete worker B's files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-isolate-"));
    const stagingDir = path.join(tmpDir, "staging");
    const canonicalDir = path.join(tmpDir, "canonical");
    const jobId = "11111111-1111-4111-8111-111111111111";
    const paperId = "22222222-2222-4222-8222-222222222222";

    // Pre-create Worker B's committed attempt files (att-2)
    const workerBDir = path.join(canonicalDir, paperId, jobId, "att-2");
    fs.mkdirSync(workerBDir, { recursive: true });
    const workerBFile = path.join(workerBDir, "figure_p1_1.png");
    fs.writeFileSync(workerBFile, "worker-b-winning-asset");

    // Staging file for Worker A (att-1)
    const workerAStagingDir = path.join(stagingDir, jobId, "att-1");
    fs.mkdirSync(workerAStagingDir, { recursive: true });
    const workerAStagedFile = path.join(workerAStagingDir, "figure_p1_1.png");
    fs.writeFileSync(workerAStagedFile, "worker-a-stale-asset");

    // Mock client: Worker A's lease check returns 0 rows (lease was stolen by Worker B)
    const mockClient = {
      query: async (sql) => {
        if (sql.startsWith("BEGIN") || sql.startsWith("ROLLBACK")) return { rowCount: 1 };
        if (sql.includes("SELECT id FROM paper_extraction_jobs")) {
          return { rowCount: 0, rows: [] }; // Lease lost!
        }
        return { rowCount: 0, rows: [] };
      },
    };

    try {
      await assert.rejects(
        async () => {
          await commitExtractionJobTransaction({
            client: mockClient,
            paperId,
            jobId,
            leaseToken: "stale-token-a",
            assets: [
              {
                assetType: "figure",
                pageNumber: 1,
                assetOrder: 1,
                filename: "figure_p1_1.png",
                stagedFilePath: workerAStagedFile,
                fileSizeBytes: 10,
                mimeType: "image/png",
              },
            ],
            attemptId: "att-1",
            stagingBaseDir: stagingDir,
            canonicalBaseDir: canonicalDir,
          });
        },
        (err) => {
          assert.equal(err.code, "LEASE_FENCING_FAILED");
          return true;
        }
      );

      // Verify Worker B's file is completely untouched and intact!
      assert.ok(fs.existsSync(workerBFile), "Worker B's file must NOT be deleted by Worker A's rollback!");
      assert.equal(fs.readFileSync(workerBFile, "utf-8"), "worker-b-winning-asset");

      // Verify Worker A's file was not even promoted
      const workerAFile = path.join(canonicalDir, paperId, jobId, "att-1", "figure_p1_1.png");
      assert.equal(fs.existsSync(workerAFile), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("partial promotion failure unlinks only its own attempt files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "persist-partial-"));
    const stagingDir = path.join(tmpDir, "staging");
    const canonicalDir = path.join(tmpDir, "canonical");
    const jobId = "11111111-1111-4111-8111-111111111111";
    const paperId = "22222222-2222-4222-8222-222222222222";

    // Setup attempt 1 with two assets, but asset 2's source file is missing
    const attDir = path.join(stagingDir, jobId, "att-1");
    fs.mkdirSync(attDir, { recursive: true });
    const file1 = path.join(attDir, "fig1.png");
    fs.writeFileSync(file1, "fig1-content");

    const mockClient = {
      query: async (sql) => {
        if (sql.startsWith("BEGIN") || sql.startsWith("ROLLBACK")) return { rowCount: 1 };
        if (sql.includes("SELECT id FROM paper_extraction_jobs")) {
          return { rowCount: 1, rows: [{ id: jobId }] };
        }
        return { rowCount: 1, rows: [] };
      },
    };

    try {
      await assert.rejects(
        async () => {
          await commitExtractionJobTransaction({
            client: mockClient,
            paperId,
            jobId,
            leaseToken: "valid-token",
            assets: [
              {
                assetType: "figure",
                pageNumber: 1,
                assetOrder: 1,
                filename: "fig1.png",
                stagedFilePath: file1,
                fileSizeBytes: 12,
                mimeType: "image/png",
              },
              {
                assetType: "figure",
                pageNumber: 1,
                assetOrder: 2,
                filename: "fig2.png",
                stagedFilePath: path.join(attDir, "fig2_nonexistent.png"), // MISSING!
                fileSizeBytes: 12,
                mimeType: "image/png",
              },
            ],
            attemptId: "att-1",
            stagingBaseDir: stagingDir,
            canonicalBaseDir: canonicalDir,
          });
        },
        (err) => {
          assert.equal(err.code, "STAGED_ASSET_NOT_FOUND");
          return true;
        }
      );

      // Verify fig1 (which was promoted before fig2 failed) was unlinked in rollback
      const canonicalFig1 = path.join(canonicalDir, paperId, jobId, "att-1", "fig1.png");
      assert.equal(fs.existsSync(canonicalFig1), false, "Partially promoted file must be unlinked");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

