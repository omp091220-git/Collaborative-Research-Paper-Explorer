import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";

import app from "../app.js";
import pool from "../config/database.js";

const PAPER_ID = "a1111111-1111-4111-8111-111111111111";
const OWNER_ID = "a2222222-2222-4222-8222-222222222222";
const VIEWER_ID = "a3333333-3333-4333-8333-333333333333";
const ASSET_ID = "a4444444-4444-4444-8444-444444444444";
const JOB_ID = "a5555555-5555-4555-8555-555555555555";
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const assetsRoot = path.join(projectRoot, "uploads", "assets");

function tokenFor(id, role = "RESEARCHER") {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "10m" });
}

class InProcessResponse extends Writable {
  constructor(req) {
    super();
    this.req = req;
    this.locals = {};
    this.statusCode = 200;
    this.headers = new Map();
    this.chunks = [];
    // Express replaces the response prototype in app.handle(); keep the
    // minimal in-process transport methods as own properties.
    this._write = (chunk, encoding, callback) => {
      this.chunks.push(Buffer.from(chunk));
      callback();
    };
    this._destroy = (error, callback) => callback(error);
    this.write = Writable.prototype.write.bind(this);
    this.end = Writable.prototype.end.bind(this);
    this.on = Writable.prototype.on.bind(this);
    this.once = Writable.prototype.once.bind(this);
    this.emit = Writable.prototype.emit.bind(this);
    this.destroy = Writable.prototype.destroy.bind(this);
    this.setHeader = (name, value) => { this.headers.set(name.toLowerCase(), value); return this; };
    this.getHeader = (name) => this.headers.get(name.toLowerCase());
    this.hasHeader = (name) => this.headers.has(name.toLowerCase());
    this.removeHeader = (name) => this.headers.delete(name.toLowerCase());
  }
}
Object.setPrototypeOf(InProcessResponse.prototype, app.response);

function dispatch(url, authorization) {
  const req = new Readable({ read() { this.push(null); } });
  req.method = "GET";
  req.url = url;
  req.originalUrl = url;
  req.headers = { host: "localhost", ...(authorization ? { authorization } : {}) };
  req.rawHeaders = [];
  req.httpVersion = "1.1";
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.complete = true;
  req.socket = { remoteAddress: "127.0.0.1" };
  req.connection = req.socket;

  const res = new InProcessResponse(req);
  req.res = res;
  return new Promise((resolve, reject) => {
    res.once("finish", () => {
      const body = Buffer.concat(res.chunks);
      const contentType = String(res.getHeader("content-type") || "");
      let parsedBody = body;
      if (contentType.includes("application/json") && body.length) {
        try { parsedBody = JSON.parse(body.toString("utf8")); } catch {}
      }
      resolve({ status: res.statusCode, headers: Object.fromEntries(res.headers), body: parsedBody });
    });
    res.once("error", reject);
    app.handle(req, res, reject);
  });
}

function installPoolQueryMock(t, {
  paperExists = true,
  ownerId = OWNER_ID,
  collaboratorRole = null,
  getJob = () => null,
  getAssets = () => [],
  getAsset = () => null,
} = {}) {
  return t.mock.method(pool, "query", async (query, values = []) => {
    const sql = typeof query === "string" ? query : query.text;
    if (/FROM papers\s+WHERE id\s*=\s*\$1/i.test(sql)) {
      return { rows: paperExists ? [{ id: PAPER_ID, uploader_id: ownerId }] : [], rowCount: paperExists ? 1 : 0 };
    }
    if (/FROM paper_collaborators/i.test(sql)) {
      return { rows: collaboratorRole ? [{ role: collaboratorRole }] : [], rowCount: collaboratorRole ? 1 : 0 };
    }
    if (/FROM paper_assets/i.test(sql) && /WHERE id\s*=\s*\$1\s+AND paper_id\s*=\s*\$2/i.test(sql)) {
      const asset = getAsset(values[0], values[1]);
      return { rows: asset ? [asset] : [], rowCount: asset ? 1 : 0 };
    }
    if (/FROM paper_assets/i.test(sql)) {
      const assets = getAssets();
      return { rows: assets, rowCount: assets.length };
    }
    if (/FROM paper_extraction_jobs/i.test(sql)) {
      const job = getJob();
      return { rows: job ? [job] : [], rowCount: job ? 1 : 0 };
    }
    throw new Error(`Unexpected mocked query in mounted FR-09 route test: ${sql}`);
  });
}

describe("FR-09 mounted paper asset routes", () => {
  it("rejects missing and invalid authentication on status and assets routes", async (t) => {
    const db = installPoolQueryMock(t);
    for (const endpoint of ["extraction-status", "assets"]) {
      assert.equal((await dispatch(`/api/papers/${PAPER_ID}/${endpoint}`)).status, 401);
      assert.equal((await dispatch(`/api/papers/${PAPER_ID}/${endpoint}`, "Bearer invalid")).status, 401);
    }
    assert.equal(db.mock.callCount(), 0, "authentication should reject before paper lookup");
  });

  it("allows the paper owner to read status and returns the frontend status contract without lease secrets", async (t) => {
    const job = {
      id: JOB_ID, paper_id: PAPER_ID, status: "pending", attempts: 0, max_attempts: 3, assets_count: 0,
      lease_token: "private-token", locked_by: "private-worker", lease_expires_at: new Date(), error_message: "private-error",
    };
    installPoolQueryMock(t, { getJob: () => job });
    const response = await dispatch(`/api/papers/${PAPER_ID}/extraction-status`, `Bearer ${tokenFor(OWNER_ID)}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "queued");
    assert.equal(response.body.job.id, JOB_ID);
    assert.equal(response.body.job.status, "queued");
    for (const secret of ["lease_token", "locked_by", "lease_expires_at", "error_message"]) {
      assert.equal(secret in response.body.job, false);
    }
  });

  it("allows viewer and editor collaborators through the mounted asset route", async (t) => {
    for (const role of ["VIEW", "EDIT"]) {
      installPoolQueryMock(t, { collaboratorRole: role });
      const response = await dispatch(`/api/papers/${PAPER_ID}/assets`, `Bearer ${tokenFor(VIEWER_ID)}`);
      assert.equal(response.status, 200, `${role} should have paper view access`);
      assert.deepEqual(response.body, { assets: [], count: 0 });
      t.mock.restoreAll();
    }
  });

  it("denies a user without paper access and returns 404 for a nonexistent paper", async (t) => {
    installPoolQueryMock(t);
    const denied = await dispatch(`/api/papers/${PAPER_ID}/assets`, `Bearer ${tokenFor(VIEWER_ID)}`);
    assert.equal(denied.status, 403);

    t.mock.restoreAll();
    installPoolQueryMock(t, { paperExists: false });
    const missing = await dispatch(`/api/papers/${PAPER_ID}/extraction-status`, `Bearer ${tokenFor(VIEWER_ID)}`);
    assert.equal(missing.status, 404);
  });

  it("rejects malformed paper IDs and safely reports an absent extraction job", async (t) => {
    installPoolQueryMock(t);
    const auth = `Bearer ${tokenFor(OWNER_ID)}`;
    const invalid = await dispatch("/api/papers/not-a-uuid/assets", auth);
    assert.equal(invalid.status, 400);

    const absent = await dispatch(`/api/papers/${PAPER_ID}/extraction-status`, auth);
    assert.equal(absent.status, 200);
    assert.deepEqual(absent.body, {
      status: "not_extracted",
      message: "No extraction has been initiated for this paper.",
      job: null,
    });
  });

  it("returns processing, completed, and failed statuses unchanged", async (t) => {
    let status = "processing";
    installPoolQueryMock(t, { getJob: () => ({ id: JOB_ID, paper_id: PAPER_ID, status, attempts: 1, max_attempts: 3 }) });
    const auth = `Bearer ${tokenFor(OWNER_ID)}`;
    for (const expected of ["processing", "completed", "failed"]) {
      status = expected;
      const response = await dispatch(`/api/papers/${PAPER_ID}/extraction-status`, auth);
      assert.equal(response.status, 200);
      assert.equal(response.body.status, expected);
      assert.equal(response.body.job.status, expected);
    }
  });

  it("returns asset metadata without internal paths and an empty collection with count zero", async (t) => {
    const asset = {
      id: ASSET_ID, paper_id: PAPER_ID, job_id: JOB_ID, asset_type: "figure", page_number: 2,
      asset_order: 1, file_path: "uploads/assets/private/path.png", file_size_bytes: 123,
      mime_type: "image/png", width: 640, height: 480, caption: "Figure caption", extraction_metadata: {},
    };
    let rows = [asset];
    installPoolQueryMock(t, { getAssets: () => rows });
    const auth = `Bearer ${tokenFor(OWNER_ID)}`;
    const populated = await dispatch(`/api/papers/${PAPER_ID}/assets`, auth);
    assert.equal(populated.status, 200);
    assert.equal(populated.body.count, 1);
    assert.equal(populated.body.assets[0].caption, asset.caption);
    assert.equal(populated.body.assets[0].file_size_bytes, asset.file_size_bytes);
    assert.equal("file_path" in populated.body.assets[0], false);
    assert.equal(JSON.stringify(populated.body).includes("uploads/assets"), false);

    rows = [];
    const empty = await dispatch(`/api/papers/${PAPER_ID}/assets`, auth);
    assert.deepEqual(empty.body, { assets: [], count: 0 });
  });

  it("streams the asset binary through the mounted route and returns 404 for missing rows/files", async (t) => {
    let fixtureDir;
    try {
      fixtureDir = fs.mkdtempSync(path.join(assetsRoot, ".fr09-mounted-route-"));
      const filename = `${crypto.randomUUID()}.png`;
      const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
      const filePath = path.join(fixtureDir, filename);
      fs.writeFileSync(filePath, bytes);
      const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, "/");
      let asset = {
        id: ASSET_ID, paper_id: PAPER_ID, job_id: JOB_ID, asset_type: "figure", page_number: 2,
        asset_order: 1, file_path: relativePath, file_size_bytes: bytes.length, mime_type: "image/png",
        width: 1, height: 1, caption: null, extraction_metadata: {},
      };
      installPoolQueryMock(t, { getAsset: () => asset });
      const auth = `Bearer ${tokenFor(OWNER_ID)}`;
      const streamed = await dispatch(`/api/papers/${PAPER_ID}/assets/${ASSET_ID}`, auth);
      assert.equal(streamed.status, 200);
      assert.equal(streamed.headers["content-type"], "image/png");
      assert.equal(streamed.headers["cache-control"], "private, no-store");
      assert.deepEqual(streamed.body, bytes);

      asset = null;
      const missingAsset = await dispatch(`/api/papers/${PAPER_ID}/assets/${ASSET_ID}`, auth);
      assert.equal(missingAsset.status, 404);

      asset = { id: ASSET_ID, paper_id: PAPER_ID, file_path: "uploads/assets/.fr09-no-such-file/asset.png", mime_type: "image/png" };
      const missingFile = await dispatch(`/api/papers/${PAPER_ID}/assets/${ASSET_ID}`, auth);
      assert.equal(missingFile.status, 404);
    } finally {
      if (fixtureDir && fs.existsSync(fixtureDir)) fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
