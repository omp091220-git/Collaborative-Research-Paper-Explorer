import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import pool from "../config/database.js";
import { createSummaryRouter } from "../routes/summary.routes.js";
import { ROLES } from "../utils/roles.js";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const PAPER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TEST_SECRET = process.env.JWT_SECRET || "super_secure_test_jwt_secret_with_32_characters_12345";
const originalPoolQuery = pool.query;
afterEach(() => { pool.query = originalPoolQuery; });

function tokenFor(role = ROLES.STUDENT) {
  return jwt.sign({ id: USER_ID, role }, TEST_SECRET, { expiresIn: "1h" });
}

function setupUser(role = ROLES.STUDENT) {
  pool.query = async (sql, params) => {
    const text = String(sql);
    if (text.includes("FROM users") && text.includes("WHERE id = $1") && params?.[0] === USER_ID) {
      return { rows: [{ id: USER_ID, email: "test@university.edu", full_name: "Test User", role }] };
    }
    return { rows: [] };
  };
}

function buildApp(options) {
  const app = express();
  app.use(express.json());
  app.use("/api/summaries", createSummaryRouter(options));
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  return app;
}

test("summary routes require authentication", async () => {
  const app = buildApp({ db: { query: async () => ({ rows: [] }) }, enqueue: async () => {} });
  const response = await request(app).get(`/api/summaries/jobs/${PAPER_ID}`);
  assert.equal(response.status, 401);
});

test("summary generation rejects malformed paper UUID before querying the injected database", async () => {
  setupUser();
  let queried = false;
  const app = buildApp({ db: { query: async () => { queried = true; return { rows: [] }; } } });
  const response = await request(app)
    .post("/api/summaries/papers/not-a-uuid/generate")
    .set("Authorization", `Bearer ${tokenFor()}`)
    .send({});
  assert.equal(response.status, 400);
  assert.equal(queried, false);
});

test("summary generation queues a valid request with a content hash", async () => {
  setupUser();
  const enqueued = [];
  const queries = [];
  const db = {
    async query(sql, params) {
      const text = String(sql);
      queries.push(text);
      if (text.includes("SELECT id, file_path, file_size_bytes FROM papers")) {
        return { rows: [{ id: PAPER_ID, file_path: "uploads/test.pdf", file_size_bytes: 100 }] };
      }
      if (text.includes("SELECT id, status, created_at FROM paper_summary_jobs")) return { rows: [] };
      if (text.includes("INSERT INTO paper_summary_jobs")) return { rows: [] };
      return { rows: [] };
    },
  };
  const app = buildApp({
    db,
    enqueue: async (job) => enqueued.push(job),
    fileReader: async (file) => {
      assert.equal(file, "/workspace/uploads/test.pdf");
      return Buffer.from("%PDF-1.4 fake test bytes");
    },
    projectRoot: "/workspace",
    modelName: "gemini-3.8-flash",
    authorizePaperAccess: async () => true,
  });
  const response = await request(app)
    .post(`/api/summaries/papers/${PAPER_ID}/generate`)
    .set("Authorization", `Bearer ${tokenFor()}`)
    .send({});

  assert.equal(response.status, 202);
  assert.equal(response.body.job.status, "queued");
  assert.match(response.body.job.sourceSha256, /^[0-9a-f]{64}$/);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].paperId, PAPER_ID);
  assert.equal(enqueued[0].sourceSha256, response.body.job.sourceSha256);
  assert.ok(queries.some((sql) => sql.includes("INSERT INTO paper_summary_jobs")));
});
