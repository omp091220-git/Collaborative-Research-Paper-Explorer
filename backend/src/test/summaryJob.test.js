import test from "node:test";
import assert from "node:assert/strict";
import { processSummaryJob } from "../services/summary/summaryJob.service.js";
import { sha256Hex, PdfExtractionError } from "../services/summary/pdfExtraction.service.js";
import { GeminiServiceError } from "../services/summary/gemini.service.js";

const PAPER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const JOB_ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const MODEL_NAME = "gemini-3.8-flash";
const PDF_BYTES = Buffer.from("%PDF-1.4 test bytes");
const SOURCE_SHA = sha256Hex(PDF_BYTES);
const SECTIONS = [
  { key: "background", title: "Background", text: "Why the work matters.", status: "supported", sources: [{ passageId: "p1", pageNumber: 1, text: "context", boundingBox: null }], pageNumbers: [1] },
  { key: "methodology", title: "Methodology", text: "", status: "insufficient_information", sources: [], pageNumbers: [] },
  { key: "results", title: "Results", text: "Measured outcome.", status: "supported", sources: [{ passageId: "p2", pageNumber: 2, text: "result", boundingBox: null }], pageNumbers: [2] },
  { key: "limitations", title: "Limitations", text: "", status: "insufficient_information", sources: [], pageNumbers: [] },
];

function createDb({ paperExists = true } = {}) {
  const queries = [];
  const lockQueries = [];
  let releaseCount = 0;
  const db = {
    queries,
    lockQueries,
    get releaseCount() { return releaseCount; },
    async query(sql, params) {
      const text = String(sql);
      queries.push({ text, params });
      if (text.includes("SELECT id, file_path, file_size_bytes FROM papers")) {
        return { rows: paperExists ? [{ id: PAPER_ID, file_path: "uploads/test.pdf", file_size_bytes: PDF_BYTES.length }] : [] };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, params) { lockQueries.push({ text: String(sql), params }); return { rows: [] }; },
        release() { releaseCount += 1; },
      };
    },
  };
  return db;
}

function job({ attemptsMade = 0, attempts = 3 } = {}) {
  return {
    id: JOB_ID,
    data: { jobId: JOB_ID, paperId: PAPER_ID, requestedBy: USER_ID, sourceSha256: SOURCE_SHA, modelName: MODEL_NAME, summaryType: "comprehensive" },
    attemptsMade,
    opts: { attempts },
  };
}

const extraction = { sha256: SOURCE_SHA, pageCount: 2, pages: [], passages: [] };

 test("processSummaryJob generates and persists a cache miss, then marks the job completed", async () => {
  const db = createDb();
  let summarizeCalls = 0;
  let persisted;
  const result = await processSummaryJob(job(), {
    db,
    fileReader: async (filename) => { assert.match(filename, /uploads[\\/]test\.pdf$/); return PDF_BYTES; },
    getCached: async () => null,
    extract: async (bytes) => { assert.deepEqual(bytes, PDF_BYTES); return extraction; },
    summarize: async () => { summarizeCalls += 1; return { schemaVersion: 1, sections: SECTIONS }; },
    persist: async (args) => { persisted = args; return { id: "summary-id" }; },
  });

  assert.deepEqual(result, { summaryId: "summary-id", cached: false });
  assert.equal(summarizeCalls, 1);
  assert.equal(persisted.paperId, PAPER_ID);
  assert.equal(persisted.sourceSha256, SOURCE_SHA);
  assert.ok(db.queries.some((q) => q.text.includes("SET status = 'completed'")));
  assert.equal(db.lockQueries.length, 2, "advisory lock is acquired and released");
  assert.equal(db.releaseCount, 1);
});

test("processSummaryJob reuses cached sections without extraction or a Gemini call", async () => {
  const db = createDb();
  let persistArgs;
  const result = await processSummaryJob(job(), {
    db,
    fileReader: async () => PDF_BYTES,
    getCached: async () => ({ structured_sections: SECTIONS, source_page_count: 2 }),
    extract: async () => { assert.fail("cache hit must skip PDF extraction"); },
    summarize: async () => { assert.fail("cache hit must skip Gemini"); },
    persist: async (args) => { persistArgs = args; return { id: "cached-summary-id" }; },
  });

  assert.deepEqual(result, { summaryId: "cached-summary-id", cached: true });
  assert.deepEqual(persistArgs.sections, SECTIONS);
  assert.ok(db.queries.some((q) => q.text.includes("SET status = 'completed'")));
  assert.equal(db.releaseCount, 1);
});

test("retryable Gemini errors return the persisted job to queued state", async () => {
  const db = createDb();
  await assert.rejects(processSummaryJob(job({ attemptsMade: 0 }), {
    db,
    fileReader: async () => PDF_BYTES,
    getCached: async () => null,
    extract: async () => extraction,
    summarize: async () => { throw new GeminiServiceError("temporary failure", "API_ERROR", { retryable: true }); },
    persist: async () => assert.fail("failed generation must not persist a summary"),
  }), (error) => error instanceof GeminiServiceError && error.retryable);

  const queuedUpdate = db.queries.find((q) => q.text.includes("SET status = $2"));
  assert.equal(queuedUpdate.params[1], "queued");
  assert.equal(queuedUpdate.params[4], "temporary failure");
  assert.equal(db.releaseCount, 1);
});

test("non-retryable extraction errors mark the job failed and preserve its PDF", async () => {
  const db = createDb();
  await assert.rejects(processSummaryJob(job(), {
    db,
    fileReader: async () => PDF_BYTES,
    getCached: async () => null,
    extract: async () => { throw new PdfExtractionError("No text layer", "NO_TEXT_LAYER"); },
    summarize: async () => assert.fail("Gemini must not be called for extraction failure"),
    persist: async () => assert.fail("failed extraction must not persist a summary"),
  }), (error) => error instanceof PdfExtractionError && error.retryable === false);

  const failedUpdate = db.queries.find((q) => q.text.includes("SET status = $2"));
  assert.equal(failedUpdate.params[1], "failed");
  assert.equal(failedUpdate.params[3], "NO_TEXT_LAYER");
  assert.equal(db.releaseCount, 1);
});

test("a deleted or missing paper cannot be summarized", async () => {
  const db = createDb({ paperExists: false });
  await assert.rejects(processSummaryJob(job(), { db }), (error) => error.code === "PAPER_NOT_FOUND" && error.retryable === false);
  assert.equal(db.releaseCount, 0, "no advisory lock is taken when the paper is missing");
});
