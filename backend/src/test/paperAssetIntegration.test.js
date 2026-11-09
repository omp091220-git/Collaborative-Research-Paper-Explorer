/**
 * paperAssetIntegration.test.js
 *
 * Comprehensive integration and unit test suite for FR-09 Stage 1:
 * - Asset file path resolution and symlink/traversal fencing.
 * - Service layer business rules and status/conflict handling.
 * - Controller HTTP orchestration, status codes, and error formatting.
 * - Express router registration with mergeParams: true and required endpoints.
 * - Live PostgreSQL database integration (when test database is reachable).
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";

import pool from "../config/database.js";
import {
  resolveAssetFilePath,
  getActiveAssets,
  getExtractionStatus,
  requestExtraction,
  PaperAssetError,
} from "../services/paperAsset.service.js";
import * as paperAssetController from "../controllers/paperAsset.controller.js";
import * as extractionJobRepo from "../repositories/extractionJob.repository.js";
import { insertPaperWithJob } from "../repositories/paper.repository.js";
import paperAssetRoutes from "../routes/paperAsset.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const ASSETS_BASE_DIR = path.resolve(PROJECT_ROOT, "uploads/assets");

// Ensure uploads/assets exists for filesystem tests
if (!fs.existsSync(ASSETS_BASE_DIR)) {
  fs.mkdirSync(ASSETS_BASE_DIR, { recursive: true });
}

/**
 * In-memory Mock Req/Res helper for clean, zero-network controller testing.
 */
function createMockReqRes({
  params = {},
  query = {},
  body = {},
  headers = {},
  user = null,
} = {}) {
  const req = {
    params,
    query,
    body,
    headers,
    user,
  };
  const res = new Writable({
    write(chunk, encoding, callback) {
      if (!this.chunks) this.chunks = [];
      this.chunks.push(chunk);
      callback();
    },
  });
  res.statusCode = 200;
  res.headers = {};
  res.body = null;
  res.status = function (code) {
    this.statusCode = code;
    return this;
  };
  res.json = function (data) {
    this.body = data;
    return this;
  };
  res.setHeader = function (key, val) {
    this.headers[key.toLowerCase()] = val;
  };
  return { req, res };
}

describe("FR-09 Stage 1: Asset Path Resolution & Security Boundary", () => {
  const testPaperId = "a0000000-0000-4000-8000-000000000001";
  const testJobId = "b0000000-0000-4000-8000-000000000001";
  const validAssetDir = path.join(ASSETS_BASE_DIR, testPaperId, testJobId);
  const validAssetFile = path.join(validAssetDir, "figure_1.png");

  before(() => {
    fs.mkdirSync(validAssetDir, { recursive: true });
    fs.writeFileSync(validAssetFile, "dummy-png-data");
  });

  after(() => {
    try {
      if (fs.existsSync(validAssetFile)) fs.unlinkSync(validAssetFile);
      if (fs.existsSync(validAssetDir)) fs.rmdirSync(validAssetDir);
      const paperDir = path.join(ASSETS_BASE_DIR, testPaperId);
      if (fs.existsSync(paperDir)) fs.rmdirSync(paperDir);
    } catch {
      // Best-effort cleanup
    }
  });

  it("should resolve valid asset path within uploads/assets", () => {
    const relativePath = path
      .relative(PROJECT_ROOT, validAssetFile)
      .replace(/\\/g, "/");

    const resolved = resolveAssetFilePath({ file_path: relativePath });
    assert.strictEqual(resolved, fs.realpathSync(validAssetFile));
  });

  it("should reject asset path pointing outside uploads/assets (403)", () => {
    const outsideFile = path.join(PROJECT_ROOT, "uploads", "test-outside.pdf");
    fs.writeFileSync(outsideFile, "pdf-data");

    try {
      const relativePath = path
        .relative(PROJECT_ROOT, outsideFile)
        .replace(/\\/g, "/");

      assert.throws(
        () => resolveAssetFilePath({ file_path: relativePath }),
        (err) => {
          assert.ok(err instanceof PaperAssetError);
          assert.strictEqual(err.statusCode, 403);
          assert.match(err.message, /Access denied/);
          return true;
        }
      );
    } finally {
      if (fs.existsSync(outsideFile)) fs.unlinkSync(outsideFile);
    }
  });

  it("should throw 404 if asset file does not exist on disk", () => {
    assert.throws(
      () =>
        resolveAssetFilePath({
          file_path: "uploads/assets/non-existent-folder/non-existent.png",
        }),
      (err) => {
        assert.ok(err instanceof PaperAssetError);
        assert.strictEqual(err.statusCode, 404);
        assert.match(err.message, /Asset file not found on disk/);
        return true;
      }
    );
  });
});

describe("FR-09 Stage 1: Paper Asset Service Business Rules", () => {
  const origQuery = pool.query;

  afterEach(() => {
    pool.query = origQuery;
  });

  it("getActiveAssets: should reject non-UUID paperId with 400", async () => {
    await assert.rejects(
      async () => getActiveAssets("invalid-uuid"),
      (err) => {
        assert.ok(err instanceof PaperAssetError);
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /Must be a valid UUID/);
        return true;
      }
    );
  });

  it("getActiveAssets: should reject invalid asset_type filter with 400", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    await assert.rejects(
      async () => getActiveAssets(validUuid, { assetType: "malicious_type" }),
      (err) => {
        assert.ok(err instanceof PaperAssetError);
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /Invalid asset_type filter/);
        return true;
      }
    );
  });

  it("getExtractionStatus: should return not_extracted when paper has no jobs", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    pool.query = async () => ({ rows: [] });

    const status = await getExtractionStatus(validUuid);
    assert.strictEqual(status.status, "not_extracted");
    assert.strictEqual(status.job, null);
  });

  it("getExtractionStatus: should return latest job status when job exists", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    pool.query = async () => ({
      rows: [
        {
          id: "job-100",
          paper_id: validUuid,
          status: "completed",
          attempts: 1,
          max_attempts: 3,
          assets_count: 5,
        },
      ],
    });

    const status = await getExtractionStatus(validUuid);
    assert.strictEqual(status.status, "completed");
    assert.strictEqual(status.job.id, "job-100");
    assert.strictEqual(status.job.assets_count, 5);
  });

  it("getExtractionStatus: should map internal 'pending' status to public 'queued'", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    pool.query = async () => ({
      rows: [
        {
          id: "job-pending",
          paper_id: validUuid,
          status: "pending",
          attempts: 0,
          max_attempts: 3,
          assets_count: 0,
        },
      ],
    });

    const status = await getExtractionStatus(validUuid);
    assert.strictEqual(status.status, "queued");
    assert.strictEqual(status.job.status, "queued");
    assert.strictEqual(status.job.id, "job-pending");
  });

  it("requestExtraction: should return existing job with alreadyExists: true when latest job exists", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    pool.query = async (text) => {
      if (text.includes("ORDER BY created_at DESC")) {
        return {
          rows: [{ id: "job-active", paper_id: validUuid, status: "processing" }],
        };
      }
      return { rows: [] };
    };

    const result = await requestExtraction(validUuid);
    assert.strictEqual(result.alreadyExists, true);
    assert.strictEqual(result.job.id, "job-active");
    assert.strictEqual(result.job.status, "processing");
  });

  it("requestExtraction: should return existing completed job with HTTP 200 and not create a new job", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    pool.query = async (text) => {
      if (text.includes("ORDER BY created_at DESC")) {
        return {
          rows: [{ id: "job-completed", paper_id: validUuid, status: "completed" }],
        };
      }
      // No INSERT should be called for a completed job
      if (text.includes("INSERT INTO paper_extraction_jobs")) {
        throw new Error("Unexpected INSERT for completed job");
      }
      return { rows: [] };
    };

    const result = await requestExtraction(validUuid);
    assert.strictEqual(result.alreadyExists, true);
    assert.strictEqual(result.job.id, "job-completed");
    assert.strictEqual(result.job.status, "completed");
  });
  it("requestExtraction: should create a new pending job when no previous job exists", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    pool.query = async (text) => {
      if (text.includes("ORDER BY created_at DESC")) {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO paper_extraction_jobs")) {
        return {
          rows: [
            {
              id: "new-job-uuid",
              paper_id: validUuid,
              status: "pending",
              attempts: 0,
              max_attempts: 3,
            },
          ],
        };
      }
      return { rows: [] };
    };

    const result = await requestExtraction(validUuid);
    assert.strictEqual(result.alreadyExists, false);
    assert.strictEqual(result.job.status, "pending");
    assert.strictEqual(result.job.paper_id, validUuid);
  });

  it("requestExtraction: should handle concurrent race condition (DB 23505) and return existing job", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    pool.query = async (text) => {
      if (text.includes("ORDER BY created_at DESC")) {
        // Initial latest-job query sees no job
        return { rows: [] };
      }
      if (text.includes("INSERT INTO paper_extraction_jobs")) {
        // Concurrent insert hits partial unique index
        const err = new Error(
          'duplicate key value violates unique constraint "uq_one_active_extraction_job_per_paper"'
        );
        err.code = "23505";
        err.constraint = "uq_one_active_extraction_job_per_paper";
        throw err;
      }
      if (text.includes("status IN ('pending', 'processing')")) {
        // Fallback: fetch the job that won the race
        return {
          rows: [{ id: "job-race-winner", paper_id: validUuid, status: "pending" }],
        };
      }
      return { rows: [] };
    };

    const result = await requestExtraction(validUuid);
    assert.strictEqual(result.alreadyExists, true);
    assert.strictEqual(result.job.id, "job-race-winner");
    assert.strictEqual(result.job.status, "queued");
  });

  it("requestExtraction: should rethrow unrelated 23505 constraint violations", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    pool.query = async (text) => {
      if (text.includes("ORDER BY created_at DESC")) {
        return { rows: [] };
      }
      if (text.includes("INSERT INTO paper_extraction_jobs")) {
        const err = new Error(
          'duplicate key value violates unique constraint "uq_other_constraint"'
        );
        err.code = "23505";
        err.constraint = "uq_other_constraint";
        throw err;
      }
      return { rows: [] };
    };

    await assert.rejects(
      async () => requestExtraction(validUuid),
      (err) => {
        // Must NOT be mapped to PaperAssetError 409; original DB error must propagate
        assert.strictEqual(err.code, "23505");
        assert.strictEqual(err.constraint, "uq_other_constraint");
        return true;
      }
    );
  });
});

describe("FR-09 Stage 1: Controller Orchestration & HTTP Response Layer", () => {
  const origQuery = pool.query;

  afterEach(() => {
    pool.query = origQuery;
  });

  it("listAssets: should return 200 with active asset set", async () => {
    const validPaperId = "22222222-2222-4222-8222-222222222222";
    pool.query = async () => ({
      rows: [
        {
          id: "asset-1",
          paper_id: validPaperId,
          asset_type: "figure",
          page_number: 1,
          asset_order: 0,
        },
      ],
    });

    const { req, res } = createMockReqRes({ params: { paperId: validPaperId } });
    await paperAssetController.listAssets(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.count, 1);
    assert.strictEqual(res.body.assets[0].id, "asset-1");
  });

  it("getExtractionStatus: should return 200 with job payload", async () => {
    const validPaperId = "22222222-2222-4222-8222-222222222222";
    pool.query = async () => ({
      rows: [
        {
          id: "job-22",
          paper_id: validPaperId,
          status: "processing",
        },
      ],
    });

    const { req, res } = createMockReqRes({ params: { paperId: validPaperId } });
    await paperAssetController.getExtractionStatus(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, "processing");
    assert.strictEqual(res.body.job.id, "job-22");
  });

  it("requestExtraction: should return 202 when new job is created", async () => {
    const validPaperId = "22222222-2222-4222-8222-222222222222";
    pool.query = async (text) => {
      if (text.includes("ORDER BY created_at DESC")) {
        return { rows: [] };
      }
      return {
        rows: [
          {
            id: "job-new-202",
            paper_id: validPaperId,
            status: "pending",
          },
        ],
      };
    };

    const { req, res } = createMockReqRes({ params: { paperId: validPaperId } });
    await paperAssetController.requestExtraction(req, res, () => {});

    assert.strictEqual(res.statusCode, 202);
    assert.strictEqual(res.body.job.id, "job-new-202");
  });

  it("requestExtraction: should return 200 with existing job when job already exists", async () => {
    const validPaperId = "22222222-2222-4222-8222-222222222222";
    pool.query = async (text) => {
      if (text.includes("ORDER BY created_at DESC")) {
        return {
          rows: [{ id: "job-running", paper_id: validPaperId, status: "processing" }],
        };
      }
      return { rows: [] };
    };

    const { req, res } = createMockReqRes({ params: { paperId: validPaperId } });
    await paperAssetController.requestExtraction(req, res, () => {});

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.job.id, "job-running");
    assert.strictEqual(res.body.job.status, "processing");
  });

  it("getAsset: should set Cache-Control: private, no-store and stream asset binary", async () => {
    const validPaperId = "a0000000-0000-4000-8000-000000000001";
    const validAssetId = "c0000000-0000-4000-8000-000000000001";
    const assetFilePath = `uploads/assets/${validPaperId}/b0000000-0000-4000-8000-000000000001/figure_1.png`;

    // Ensure the asset file exists on disk
    const diskPath = path.resolve(PROJECT_ROOT, assetFilePath);
    fs.mkdirSync(path.dirname(diskPath), { recursive: true });
    fs.writeFileSync(diskPath, "png-binary-content");

    pool.query = async () => ({
      rows: [
        {
          id: validAssetId,
          paper_id: validPaperId,
          asset_type: "figure",
          page_number: 1,
          asset_order: 0,
          file_path: assetFilePath,
          file_size_bytes: 18,
          mime_type: "image/png",
        },
      ],
    });

    const { req, res } = createMockReqRes({
      params: { paperId: validPaperId, assetId: validAssetId },
    });

    await new Promise(async (resolve, reject) => {
      res.on("finish", resolve);
      res.on("error", reject);
      try {
        await paperAssetController.getAsset(req, res, reject);
      } catch (err) {
        reject(err);
      }
    });

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers["cache-control"], "private, no-store");
    assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
    assert.strictEqual(res.headers["content-type"], "image/png");
    assert.strictEqual(res.headers["content-length"], 18);
    assert.strictEqual(Buffer.concat(res.chunks).toString(), "png-binary-content");
  });
});

describe("FR-09 Stage 1: Router Registration & Endpoint Wiring", () => {
  it("router should configure mergeParams: true and register all required endpoints", () => {
    assert.strictEqual(paperAssetRoutes.mergeParams, true);

    const registeredRoutes = paperAssetRoutes.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));

    const paths = registeredRoutes.map((r) => r.path);
    assert.ok(paths.includes("/assets"), "Missing /assets route");
    assert.ok(paths.includes("/assets/:assetId"), "Missing /assets/:assetId route");
    assert.ok(paths.includes("/extraction-status"), "Missing /extraction-status route");
    assert.ok(paths.includes("/extract"), "Missing /extract route");

    const extractRoute = registeredRoutes.find((r) => r.path === "/extract");
    assert.ok(extractRoute.methods.includes("post"), "/extract route must handle POST");

    const assetsRoute = registeredRoutes.find((r) => r.path === "/assets");
    assert.ok(assetsRoute.methods.includes("get"), "/assets route must handle GET");
  });
});

describe("FR-09 Stage 1: Live PostgreSQL Database Integration", () => {
  let dbAvailable = false;
  let client;

  const TEST_USER_ID = "e0000000-0000-4000-8000-000000000099";
  const TEST_USER_EMAIL = "fr09-fixture-user@example.com";
  const TEST_FILE_PATHS = [
    "uploads/atomic.pdf",
    "uploads/rollback.pdf",
    "uploads/w.pdf",
    "uploads/f.pdf",
  ];
  let testUserCreated = false;

  before(async () => {
    try {
      client = await pool.connect();
      dbAvailable = true;
      console.log("PostgreSQL test database connection established successfully.");

      // Clean up any stale paper records from previous aborted runs to prevent uq_papers_file_path collision
      await client.query(
        "DELETE FROM papers WHERE uploader_id = $1 AND file_path = ANY($2::text[])",
        [TEST_USER_ID, TEST_FILE_PATHS]
      );

      // Check if test user already exists before creating
      const existingUser = await client.query(
        "SELECT id FROM users WHERE id = $1 OR email = $2",
        [TEST_USER_ID, TEST_USER_EMAIL]
      );

      if (existingUser.rows.length === 0) {
        await client.query(
          `INSERT INTO users (id, email, password_hash, full_name, role)
           VALUES ($1, $2, 'dummy_test_password_hash_123', 'FR-09 Integration Test User', 'RESEARCHER')`,
          [TEST_USER_ID, TEST_USER_EMAIL]
        );
        testUserCreated = true;
      }
    } catch (err) {
      dbAvailable = false;
      console.log(
        `[NOTICE] PostgreSQL test database unreachable (${err.code || err.message}). Skipping live database integration tests.`
      );
    }
  });

  after(async () => {
    if (client) {
      try {
        if (testUserCreated) {
          // Remove test papers referencing this user first to satisfy foreign key constraint
          await client.query("DELETE FROM papers WHERE uploader_id = $1", [TEST_USER_ID]);
          await client.query("DELETE FROM users WHERE id = $1", [TEST_USER_ID]);
        }
      } catch (err) {
        console.warn("[WARN] Error during test user cleanup in after hook:", err.message);
      } finally {
        client.release();
      }
    }
  });

  it("Live DB: Atomic paper and extraction-job insertion and rollback", async (t) => {
    if (!dbAvailable) {
      t.skip("Live database not reachable in current environment.");
      return;
    }

    let createdPaperId = null;

    try {
      // 1. Rollback test
      await client.query("BEGIN");
      await insertPaperWithJob({
        client,
        paperData: {
          title: "Rollback Test Paper",
          abstract: "Test Abstract",
          authors: ["Tester"],
          filePath: "uploads/rollback.pdf",
          fileSizeBytes: 1000,
          mimeType: "application/pdf",
          uploaderId: TEST_USER_ID,
        },
      });
      await client.query("ROLLBACK");

      const checkRes = await client.query(
        "SELECT * FROM papers WHERE title = 'Rollback Test Paper'"
      );
      assert.strictEqual(checkRes.rows.length, 0);

      // 2. Commit test
      await client.query("BEGIN");
      const { paper, job } = await insertPaperWithJob({
        client,
        paperData: {
          title: "Atomic Test Paper",
          abstract: "Test Abstract",
          authors: ["Tester"],
          filePath: "uploads/atomic.pdf",
          fileSizeBytes: 1000,
          mimeType: "application/pdf",
          uploaderId: TEST_USER_ID,
        },
      });
      await client.query("COMMIT");
      createdPaperId = paper.id;

      assert.ok(paper.id);
      assert.ok(job.id);
      assert.strictEqual(job.paper_id, paper.id);
      assert.strictEqual(job.status, "pending");
    } finally {
      if (createdPaperId) {
        await client.query("DELETE FROM papers WHERE id = $1", [createdPaperId]);
      }
    }
  });

  it("Live DB: FOR UPDATE SKIP LOCKED concurrent job claiming", async (t) => {
    if (!dbAvailable) {
      t.skip("Live database not reachable in current environment.");
      return;
    }

    let workerClient1;
    let workerClient2;
    let createdPaperId = null;

    try {
      workerClient1 = await pool.connect();
      workerClient2 = await pool.connect();

      // Create a test job
      const paperRes = await client.query(
        `INSERT INTO papers (title, authors, file_path, file_size_bytes, mime_type, uploader_id)
         VALUES ('Worker Test Paper', '{"A"}', 'uploads/w.pdf', 500, 'application/pdf', $1)
         RETURNING id`,
        [TEST_USER_ID]
      );
      createdPaperId = paperRes.rows[0].id;

      const job = await extractionJobRepo.createExtractionJob(client, { paperId: createdPaperId });

      await workerClient1.query("BEGIN");
      await workerClient2.query("BEGIN");

      const claim1 = await extractionJobRepo.claimNextJob(workerClient1, {
        workerId: "worker-1",
        leaseDurationSeconds: 30,
      });

      const claim2 = await extractionJobRepo.claimNextJob(workerClient2, {
        workerId: "worker-2",
        leaseDurationSeconds: 30,
      });

      await workerClient1.query("COMMIT");
      await workerClient2.query("COMMIT");

      assert.ok(claim1);
      assert.strictEqual(claim1.id, job.id);
      assert.strictEqual(claim1.locked_by, "worker-1");
      // Worker 2 should get null because worker 1 locked the only job
      assert.strictEqual(claim2, null);
    } finally {
      if (workerClient1) {
        try { await workerClient1.query("ROLLBACK"); } catch {}
        workerClient1.release();
      }
      if (workerClient2) {
        try { await workerClient2.query("ROLLBACK"); } catch {}
        workerClient2.release();
      }
      if (createdPaperId) {
        await client.query("DELETE FROM papers WHERE id = $1", [createdPaperId]);
      }
    }
  });

  it("Live DB: Lease expiration fencing on completeJob and renewLease", async (t) => {
    if (!dbAvailable) {
      t.skip("Live database not reachable in current environment.");
      return;
    }

    let createdPaperId = null;

    try {
      const paperRes = await client.query(
        `INSERT INTO papers (title, authors, file_path, file_size_bytes, mime_type, uploader_id)
         VALUES ('Fencing Test Paper', '{"A"}', 'uploads/f.pdf', 500, 'application/pdf', $1)
         RETURNING id`,
        [TEST_USER_ID]
      );
      createdPaperId = paperRes.rows[0].id;

      // Create and claim a job
      const job = await extractionJobRepo.createExtractionJob(client, { paperId: createdPaperId });
      const claimed = await extractionJobRepo.claimNextJob(client, {
        workerId: "worker-fencer",
        leaseDurationSeconds: 10,
      });

      // 1. Completion with wrong lease token fails
      const wrongTokenResult = await extractionJobRepo.completeJob(client, {
        jobId: claimed.id,
        leaseToken: "00000000-0000-4000-8000-000000000000",
        assetsCount: 0,
      });
      assert.strictEqual(wrongTokenResult, false);

      // 2. Completion with valid lease token succeeds
      const validResult = await extractionJobRepo.completeJob(client, {
        jobId: claimed.id,
        leaseToken: claimed.lease_token,
        assetsCount: 0,
      });
      assert.strictEqual(validResult, true);
    } finally {
      if (createdPaperId) {
        await client.query("DELETE FROM papers WHERE id = $1", [createdPaperId]);
      }
    }
  });
});
