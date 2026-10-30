import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pool from "../config/database.js";
import { env } from "../config/env.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { authorizeRoles, requirePermission } from "../middleware/authorize.js";
import { ROLES, PERMISSIONS } from "../utils/roles.js";
import { sha256Hex } from "../services/summary/pdfExtraction.service.js";
import { enqueueSummaryJob } from "../queues/summaryQueue.js";
import { isUuid, resolvePaperFilePath } from "../services/summary/summaryJob.service.js";
import { SUMMARY_TYPE } from "../services/summary/summaryPersistence.service.js";
import { canAccessPaper } from "../services/summary/summaryAccess.service.js";

const ALL_ROLES = [ROLES.SYSTEM_ADMIN, ROLES.RESEARCHER, ROLES.STUDENT];
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const MODEL_NAME_MAX_LENGTH = 100;

function validModelName(modelName) {
  return typeof modelName === "string" && modelName.trim().length > 0 && modelName.trim().length <= MODEL_NAME_MAX_LENGTH;
}

export function createSummaryRouter({
  db = pool,
  enqueue = enqueueSummaryJob,
  fileReader = readFile,
  projectRoot = PROJECT_ROOT,
  modelName = env.gemini.model,
  authorizePaperAccess = canAccessPaper,
} = {}) {
  const api = express.Router();
  const auth = [authenticateToken, authorizeRoles(...ALL_ROLES), requirePermission(PERMISSIONS.SUMMARIES_GENERATE)];

  // POST /api/summaries/papers/:paperId/generate -> queue structured summary job.
  api.post("/papers/:paperId/generate", ...auth, async (req, res, next) => {
    try {
      const { paperId } = req.params;
      if (!isUuid(paperId)) return res.status(400).json({ error: "paperId must be a valid UUID." });
      if (!validModelName(modelName)) return res.status(503).json({ error: "Summary model is not configured correctly." });

      const paperResult = await db.query(
        "SELECT id, file_path, file_size_bytes FROM papers WHERE id = $1",
        [paperId]
      );
      const paper = paperResult.rows[0];
      if (!paper) return res.status(404).json({ error: "Paper not found." });
      if (!(await authorizePaperAccess({ db, paperId, user: req.user }))) {
        return res.status(404).json({ error: "Paper not found." });
      }
      if (!paper.file_path) return res.status(422).json({ error: "This paper has no stored PDF to summarize." });

      let bytes;
      let sourceSha256;
      try {
        const absolutePath = resolvePaperFilePath(paper.file_path, projectRoot);
        bytes = await fileReader(absolutePath);
        if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
          return res.status(500).json({ error: "Could not read the stored paper PDF." });
        }
        if (bytes.byteLength < 5 || Buffer.from(bytes).subarray(0, 5).toString("ascii") !== "%PDF-") {
          return res.status(422).json({ error: "The stored paper is not a valid PDF." });
        }
        sourceSha256 = sha256Hex(bytes);
      } catch (error) {
        if (["ENOENT", "FILE_NOT_FOUND"].includes(error.code)) {
          return res.status(404).json({ error: "The original paper PDF could not be found. The uploaded paper record was preserved." });
        }
        if (error.code === "INVALID_FILE_PATH") return res.status(422).json({ error: error.message });
        return next(error);
      }

      const active = await db.query(
        `SELECT id, status, created_at FROM paper_summary_jobs
          WHERE paper_id = $1 AND source_sha256 = $2 AND model_name = $3
            AND summary_type = $4 AND status IN ('queued', 'processing')
          ORDER BY created_at DESC LIMIT 1`,
        [paperId, sourceSha256, modelName, SUMMARY_TYPE]
      );
      if (active.rows[0]) {
        return res.status(202).json({
          message: "A summary job is already in progress for this paper.",
          job: { id: active.rows[0].id, status: active.rows[0].status, createdAt: active.rows[0].created_at },
        });
      }

      const jobId = randomUUID();
      try {
        await db.query(
          `INSERT INTO paper_summary_jobs
             (id, paper_id, requested_by, source_sha256, model_name, summary_type, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'queued')`,
          [jobId, paperId, req.user.id, sourceSha256, modelName, SUMMARY_TYPE]
        );
      } catch (error) {
        // Concurrent requests can race; the partial unique index elects one job.
        if (error.code === "23505") {
          const existing = await db.query(
            `SELECT id, status, created_at FROM paper_summary_jobs
              WHERE paper_id = $1 AND source_sha256 = $2 AND model_name = $3
                AND summary_type = $4 AND status IN ('queued', 'processing')
              ORDER BY created_at DESC LIMIT 1`,
            [paperId, sourceSha256, modelName, SUMMARY_TYPE]
          );
          if (existing.rows[0]) return res.status(202).json({ message: "A summary job is already in progress for this paper.", job: { id: existing.rows[0].id, status: existing.rows[0].status, createdAt: existing.rows[0].created_at } });
        }
        throw error;
      }

      try {
        await enqueue({
          jobId,
          paperId,
          requestedBy: req.user.id,
          sourceSha256,
          modelName,
          summaryType: SUMMARY_TYPE,
        });
      } catch (error) {
        await db.query(
          `UPDATE paper_summary_jobs SET status = 'failed', error_code = 'QUEUE_UNAVAILABLE',
             error_message = 'Background queue is unavailable. Please try again later.',
             updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [jobId]
        ).catch(() => {});
        return res.status(503).json({
          error: "The background summary queue is unavailable. Your uploaded paper was preserved; please try again later.",
          code: "QUEUE_UNAVAILABLE",
          jobId,
        });
      }

      return res.status(202).json({
        message: "Summary job accepted.",
        job: { id: jobId, status: "queued", paperId, sourceSha256 },
        statusUrl: `/api/summaries/jobs/${jobId}`,
      });
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/summaries/jobs/:jobId -> persistent progress and completed result.
  api.get("/jobs/:jobId", ...auth, async (req, res, next) => {
    try {
      if (!isUuid(req.params.jobId)) return res.status(400).json({ error: "jobId must be a valid UUID." });
      const result = await db.query(
        `SELECT j.id, j.paper_id, p.uploader_id, j.status, j.attempts_made, j.error_code,
                j.error_message, j.created_at, j.updated_at,
                s.id AS summary_id, s.model_name, s.summary_type, s.summary_text,
                s.key_findings, s.structured_sections, s.source_sha256,
                s.source_page_count, s.schema_version, s.created_at AS summary_created_at
           FROM paper_summary_jobs j
           JOIN papers p ON p.id = j.paper_id
           LEFT JOIN paper_summaries s ON s.id = j.summary_id
          WHERE j.id = $1`,
        [req.params.jobId]
      );
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: "Summary job not found." });
      if (!(await authorizePaperAccess({ db, paperId: row.paper_id, user: req.user }))) {
        return res.status(404).json({ error: "Summary job not found." });
      }
      return res.status(200).json({
        job: {
          id: row.id, paperId: row.paper_id, status: row.status,
          attemptsMade: row.attempts_made, errorCode: row.error_code,
          error: row.status === "failed" ? row.error_message : null,
          createdAt: row.created_at, updatedAt: row.updated_at,
        },
        summary: row.summary_id ? {
          id: row.summary_id, paperId: row.paper_id, modelName: row.model_name,
          summaryType: row.summary_type, summaryText: row.summary_text,
          keyFindings: row.key_findings || [], sections: row.structured_sections,
          sourceSha256: row.source_sha256, pageCount: row.source_page_count,
          schemaVersion: row.schema_version, createdAt: row.summary_created_at,
        } : null,
      });
    } catch (error) {
      return next(error);
    }
  });

  // GET /api/summaries/papers/:paperId -> latest structured summary, if any.
  api.get("/papers/:paperId", ...auth, async (req, res, next) => {
    try {
      const { paperId } = req.params;
      if (!isUuid(paperId)) return res.status(400).json({ error: "paperId must be a valid UUID." });
      const paper = await db.query("SELECT id FROM papers WHERE id = $1", [paperId]);
      if (!paper.rows[0]) return res.status(404).json({ error: "Paper not found." });
      if (!(await authorizePaperAccess({ db, paperId, user: req.user }))) {
        return res.status(404).json({ error: "Paper not found." });
      }
      const result = await db.query(
        `SELECT id, paper_id, model_name, summary_type, summary_text, key_findings,
                structured_sections, source_sha256, source_page_count, schema_version, created_at
           FROM paper_summaries
          WHERE paper_id = $1 AND structured_sections IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`,
        [paperId]
      );
      const row = result.rows[0];
      return res.status(200).json({ summary: row ? {
        id: row.id, paperId: row.paper_id, modelName: row.model_name,
        summaryType: row.summary_type, summaryText: row.summary_text,
        keyFindings: row.key_findings || [], sections: row.structured_sections,
        sourceSha256: row.source_sha256, pageCount: row.source_page_count,
        schemaVersion: row.schema_version, createdAt: row.created_at,
      } : null });
    } catch (error) {
      return next(error);
    }
  });

  return api;
}

export default createSummaryRouter();
