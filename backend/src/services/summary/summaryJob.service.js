import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import pool from "../../config/database.js";
import { env } from "../../config/env.js";
import { extractPdfPassages, sha256Hex, PdfExtractionError } from "./pdfExtraction.service.js";
import { summarizeExtraction, GeminiServiceError } from "./gemini.service.js";
import { SUMMARY_SCHEMA_VERSION } from "./summarySections.js";
import { getCachedSummary, persistSummary, SUMMARY_TYPE } from "./summaryPersistence.service.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && VALID_UUID.test(value);
}

export function resolvePaperFilePath(relativePath, projectRoot = PROJECT_ROOT) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw Object.assign(new Error("Paper file path is missing."), { code: "FILE_NOT_FOUND", retryable: false });
  }
  const absolutePath = path.resolve(projectRoot, relativePath);
  const storageRoot = path.resolve(projectRoot, "uploads");
  const relative = path.relative(storageRoot, absolutePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw Object.assign(new Error("Paper path is outside the project uploads directory."), { code: "INVALID_FILE_PATH", retryable: false });
  }
  return absolutePath;
}

function publicError(error) {
  if (error instanceof PdfExtractionError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  if (error instanceof GeminiServiceError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error?.code === "ENOENT") {
    return { code: "FILE_NOT_FOUND", message: "The original paper PDF could not be found. The uploaded paper record was preserved.", retryable: false };
  }
  return { code: "PROCESSING_ERROR", message: "Summary processing failed due to a temporary server error. Your uploaded paper was preserved.", retryable: true };
}

async function markJobProcessing(db, job) {
  await db.query(
    `UPDATE paper_summary_jobs
        SET status = 'processing', attempts_made = $2, error_code = NULL,
            error_message = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status <> 'completed'`,
    [job.id, Number(job.attemptsMade || 0) + 1]
  );
}


export async function processSummaryJob(job, {
  db = pool,
  summarize = summarizeExtraction,
  fileReader = readFile,
  extract = extractPdfPassages,
  getCached = getCachedSummary,
  persist = persistSummary,
} = {}) {
  const jobId = job.data?.jobId || job.id;
  const attemptNumber = Number(job.attemptsMade || 0) + 1;
  let advisoryClient;
  let advisoryLockAcquired = false;
  let advisoryLockKey;

  try {
    await markJobProcessing(db, { id: jobId, attemptsMade: job.attemptsMade });

    const paperResult = await db.query(
      "SELECT id, file_path, file_size_bytes FROM papers WHERE id = $1",
      [job.data.paperId]
    );
    const paper = paperResult.rows[0];
    if (!paper) throw Object.assign(new Error("Paper not found."), { code: "PAPER_NOT_FOUND", retryable: false });

    const absolutePath = resolvePaperFilePath(paper.file_path);
    const bytes = await fileReader(absolutePath);
    const sha = sha256Hex(bytes);
    if (job.data.sourceSha256 && sha !== job.data.sourceSha256) {
      throw Object.assign(new Error("The stored PDF changed after the summary job was queued."), { code: "SOURCE_CHANGED", retryable: false });
    }

    const modelName = job.data.modelName || env.gemini.model;
    // Serialize cache-miss generation for the same content/model/schema key.
    // The session-level lock is released even if extraction, Gemini, or DB writes fail;
    // PostgreSQL also releases it automatically if this worker process disconnects.
    advisoryLockKey = `fr08:${sha}:${modelName}:v${SUMMARY_SCHEMA_VERSION}:${SUMMARY_TYPE}`;
    advisoryClient = await db.connect();
    await advisoryClient.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [advisoryLockKey]);
    advisoryLockAcquired = true;

    try {
      const cacheRow = await getCached({ db, sourceSha256: sha, modelName, schemaVersion: SUMMARY_SCHEMA_VERSION });
      if (cacheRow) {
        const cachedSummary = await persist({
          db,
          paperId: paper.id,
          generatedBy: job.data.requestedBy,
          modelName,
          sourceSha256: sha,
          pageCount: cacheRow.source_page_count,
          sections: cacheRow.structured_sections,
          schemaVersion: SUMMARY_SCHEMA_VERSION,
        });
        await db.query(
          `UPDATE paper_summary_jobs SET status = 'completed', summary_id = $2,
            source_sha256 = $3, attempts_made = $4, error_code = NULL, error_message = NULL,
            updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [jobId, cachedSummary.id, sha, attemptNumber]
        );
        return { summaryId: cachedSummary.id, cached: true };
      }

      const extraction = await extract(bytes);
      const generated = await summarize(extraction, { modelName });
      const saved = await persist({
        db,
        paperId: paper.id,
        generatedBy: job.data.requestedBy,
        modelName,
        sourceSha256: extraction.sha256,
        pageCount: extraction.pageCount,
        sections: generated.sections,
        schemaVersion: generated.schemaVersion || SUMMARY_SCHEMA_VERSION,
      });

      await db.query(
        `UPDATE paper_summary_jobs SET status = 'completed', summary_id = $2,
          source_sha256 = $3, attempts_made = $4, error_code = NULL, error_message = NULL,
          updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [jobId, saved.id, extraction.sha256, attemptNumber]
      );
      return { summaryId: saved.id, cached: false };
    } finally {
      if (advisoryClient) {
        if (advisoryLockAcquired) {
          await advisoryClient.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [advisoryLockKey]).catch(() => {});
        }
        advisoryClient.release();
      }
      advisoryClient = undefined;
      advisoryLockAcquired = false;
    }
  } catch (error) {
    // A connection error while obtaining the advisory lock can happen before the
    // inner finally block exists, so release any allocated client here too.
    if (advisoryClient) {
      if (advisoryLockAcquired) {
        await advisoryClient.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [advisoryLockKey]).catch(() => {});
      }
      advisoryClient.release();
      advisoryClient = undefined;
    }

    const safe = publicError(error);
    const attemptsAllowed = Number(job.opts?.attempts || 3);
    const finalFailure = safe.retryable === false || attemptNumber >= attemptsAllowed;
    await db.query(
      `UPDATE paper_summary_jobs SET status = $2, attempts_made = $3,
        error_code = $4, error_message = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status <> 'completed'`,
      [jobId, finalFailure ? "failed" : "queued", attemptNumber, safe.code, safe.message]
    ).catch(() => {});

    if (finalFailure || safe.retryable === false) {
      error.retryable = false;
      error.publicMessage = safe.message;
    } else {
      error.retryable = true;
    }
    throw error;
  }
}

export { SUMMARY_TYPE };
