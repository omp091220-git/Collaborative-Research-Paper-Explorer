/**
 * extractionJob.repository.js
 *
 * Database access layer for paper_extraction_jobs table.
 * Adheres strictly to project repository conventions:
 * - Pure data access; no HTTP or high-level business logic.
 * - Accepts an optional transaction client where transactions are orchestrated.
 * - Enforces lease fencing and atomicity.
 */

import pool from "../config/database.js";
import crypto from "node:crypto";

const JOB_SELECT_COLS = `
  id, paper_id, status, attempts, max_attempts, assets_count,
  error_message, locked_by, lease_token, lease_expires_at,
  started_at, completed_at, created_at, updated_at
`;

/**
 * Inserts a new extraction job for a paper.
 * Typically called within an atomic transaction alongside paper insertion or re-extraction.
 *
 * @param {object} client - PostgreSQL client (transaction-scoped)
 * @param {object} params
 * @param {string} params.paperId
 * @param {number} [params.maxAttempts=3]
 * @returns {Promise<object>} The created job row
 */
export async function createExtractionJob(client, { paperId, maxAttempts = 3 }) {
  const db = client || pool;
  const result = await db.query(
    `INSERT INTO paper_extraction_jobs
       (paper_id, status, attempts, max_attempts)
     VALUES ($1, 'pending', 0, $2)
     RETURNING ${JOB_SELECT_COLS}`,
    [paperId, maxAttempts]
  );
  return result.rows[0];
}

/**
 * Returns a job by its UUID.
 *
 * @param {string} jobId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findJobById(jobId, client) {
  const db = client || pool;
  const result = await db.query(
    `SELECT ${JOB_SELECT_COLS}
     FROM paper_extraction_jobs
     WHERE id = $1`,
    [jobId]
  );
  return result.rows[0] ?? null;
}

/**
 * Returns the most recent extraction job for a paper.
 *
 * @param {string} paperId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findLatestJobByPaperId(paperId, client) {
  const db = client || pool;
  const result = await db.query(
    `SELECT ${JOB_SELECT_COLS}
     FROM paper_extraction_jobs
     WHERE paper_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [paperId]
  );
  return result.rows[0] ?? null;
}

/**
 * Returns an active (pending or processing) job for a paper, if any.
 *
 * @param {string} paperId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findActiveJobByPaperId(paperId, client) {
  const db = client || pool;
  const result = await db.query(
    `SELECT ${JOB_SELECT_COLS}
     FROM paper_extraction_jobs
     WHERE paper_id = $1
       AND status IN ('pending', 'processing')
     LIMIT 1`,
    [paperId]
  );
  return result.rows[0] ?? null;
}

/**
 * Claims the next eligible job atomically using FOR UPDATE SKIP LOCKED.
 * Eligible jobs:
 * 1. status = 'pending' and attempts < max_attempts
 * 2. status = 'processing' and lease_expires_at < NOW() and attempts < max_attempts (expired lease)
 *
 * Generates a new unique lease_token and sets lease_expires_at.
 *
 * @param {object} client - Dedicated PostgreSQL transaction client
 * @param {object} params
 * @param {string} params.workerId
 * @param {number} [params.leaseDurationSeconds=45]
 * @returns {Promise<object|null>} The claimed job row, or null if none available
 */
export async function claimNextJob(client, { workerId, leaseDurationSeconds = 45 }) {
  const db = client || pool;
  const newLeaseToken = crypto.randomUUID();

  const query = `
    WITH candidate AS (
      SELECT id AS candidate_id
      FROM paper_extraction_jobs
      WHERE (status = 'pending' AND attempts < max_attempts)
         OR (status = 'processing' AND lease_expires_at < NOW() AND attempts < max_attempts)
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    ),
    updated AS (
      UPDATE paper_extraction_jobs
      SET status = 'processing',
          attempts = attempts + 1,
          lease_token = $1,
          locked_by = $2,
          lease_expires_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::interval,
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      FROM candidate
      WHERE paper_extraction_jobs.id = candidate.candidate_id
      RETURNING ${JOB_SELECT_COLS}
    )
    SELECT u.*, p.file_path AS paper_file_path
    FROM updated u
    JOIN papers p ON p.id = u.paper_id
  `;

  const result = await db.query(query, [newLeaseToken, workerId, leaseDurationSeconds]);
  return result.rows[0] ?? null;
}

/**
 * Retrieves the relative file_path for a paper from the papers table.
 *
 * @param {string} paperId
 * @param {object} [client]
 * @returns {Promise<string|null>} The stored file_path or null
 */
export async function findPaperFilePath(paperId, client) {
  const db = client || pool;
  const result = await db.query(
    `SELECT file_path FROM papers WHERE id = $1`,
    [paperId]
  );
  return result.rows[0]?.file_path ?? null;
}

/**
 * Releases a job back to 'pending' state for retry after a retryable failure.
 * Clears lease fields so any available worker can claim it.
 *
 * @param {object} client - PostgreSQL client
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.leaseToken
 * @param {string} params.errorMessage
 * @returns {Promise<boolean>} true if successfully released; false if lease was lost
 */
export async function releaseJobForRetry(client, { jobId, leaseToken, errorMessage }) {
  const db = client || pool;
  const result = await db.query(
    `UPDATE paper_extraction_jobs
     SET status = 'pending',
         error_message = $3,
         lease_expires_at = NULL,
         lease_token = NULL,
         locked_by = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND lease_token = $2
       AND status = 'processing'
       AND lease_expires_at > CURRENT_TIMESTAMP
     RETURNING id`,
    [jobId, leaseToken, errorMessage]
  );
  return result.rowCount > 0;
}

/**
 * Heartbeat: Extends lease expiration for a job currently in processing.
 * Strictly enforces fencing:
 * - Must match jobId AND leaseToken.
 * - Must currently be in 'processing' status.
 * - Must NOT have already expired (lease_expires_at > NOW()).
 *
 * @param {object} client
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.leaseToken
 * @param {number} [params.leaseDurationSeconds=45]
 * @returns {Promise<boolean>} true if lease was renewed; false if lost/expired
 */
export async function renewLease(client, { jobId, leaseToken, leaseDurationSeconds = 45 }) {
  const db = client || pool;
  const result = await db.query(
    `UPDATE paper_extraction_jobs
     SET lease_expires_at = CURRENT_TIMESTAMP + ($3 || ' seconds')::interval,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND lease_token = $2
       AND status = 'processing'
       AND lease_expires_at > CURRENT_TIMESTAMP
     RETURNING id`,
    [jobId, leaseToken, leaseDurationSeconds]
  );
  return result.rowCount > 0;
}

/**
 * Transitions a job to 'completed' with fencing check.
 * Must match jobId AND leaseToken, and lease must not be expired.
 *
 * @param {object} client - PostgreSQL client
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.leaseToken
 * @param {number} params.assetsCount
 * @returns {Promise<boolean>} true if successfully completed; false if lease was lost
 */
export async function completeJob(client, { jobId, leaseToken, assetsCount }) {
  const db = client || pool;
  const result = await db.query(
    `UPDATE paper_extraction_jobs
     SET status = 'completed',
         assets_count = $3,
         completed_at = CURRENT_TIMESTAMP,
         lease_expires_at = NULL,
         lease_token = NULL,
         locked_by = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND lease_token = $2
       AND status = 'processing'
       AND lease_expires_at > CURRENT_TIMESTAMP
     RETURNING id`,
    [jobId, leaseToken, assetsCount]
  );
  return result.rowCount > 0;
}

/**
 * Transitions a job to 'failed' with fencing check.
 *
 * @param {object} client - PostgreSQL client
 * @param {object} params
 * @param {string} params.jobId
 * @param {string} params.leaseToken
 * @param {string} params.errorMessage
 * @returns {Promise<boolean>} true if successfully marked failed; false if lease was lost
 */
export async function failJob(client, { jobId, leaseToken, errorMessage }) {
  const db = client || pool;
  const result = await db.query(
    `UPDATE paper_extraction_jobs
     SET status = 'failed',
         error_message = $3,
         lease_expires_at = NULL,
         lease_token = NULL,
         locked_by = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND lease_token = $2
       AND status = 'processing'
       AND lease_expires_at > CURRENT_TIMESTAMP
     RETURNING id`,
    [jobId, leaseToken, errorMessage]
  );
  return result.rowCount > 0;
}

/**
 * Maintenance sweep: Marks expired processing jobs whose attempts have reached max_attempts as failed.
 *
 * @param {object} [client]
 * @returns {Promise<number>} Number of jobs transitioned to failed
 */
export async function recoverExhaustedJobs(client) {
  const db = client || pool;
  const result = await db.query(
    `UPDATE paper_extraction_jobs
     SET status = 'failed',
         error_message = 'Extraction lease expired and maximum retry attempts reached.',
         locked_by = NULL,
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE status = 'processing'
       AND lease_expires_at < CURRENT_TIMESTAMP
       AND attempts >= max_attempts
     RETURNING id`
  );
  return result.rowCount;
}

