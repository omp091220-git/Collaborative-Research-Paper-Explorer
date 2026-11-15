/**
 * orphanRecoveryManager.js
 *
 * FR-09 Phase 3.3.3: Crash-Orphan Staging & Permanent Asset Recovery Manager.
 *
 * Scavenges and purges abandoned staging directories and uncommitted permanent
 * attempt files left behind after hard crashes (SIGKILL, OOM, node exit).
 *
 * Strictly adheres to safety constraints:
 * 1. NEVER deletes files referenced by committed paper_assets records.
 * 2. NEVER deletes files belonging to an active, valid lease.
 * 3. NEVER deletes files modified within a conservative grace period.
 * 4. Idempotent and safe against concurrent execution.
 */

import fs from "node:fs";
import path from "node:path";
import pool from "../config/database.js";
import { DEFAULT_STAGING_BASE_DIR } from "../utils/assetStagingManager.js";
import { DEFAULT_CANONICAL_BASE_DIR } from "./atomicPersistence.js";

export const DEFAULT_ORPHAN_GRACE_PERIOD_MS = 3600000; // 1 hour conservative grace period

/**
 * Checks if a directory is older than the configured grace period.
 *
 * @param {string} dirPath
 * @param {number} gracePeriodMs
 * @returns {Promise<boolean>}
 */
async function isOlderThanGracePeriod(dirPath, gracePeriodMs) {
  try {
    const stat = await fs.promises.stat(dirPath);
    return (Date.now() - stat.mtimeMs) >= gracePeriodMs;
  } catch {
    return false;
  }
}

/**
 * Purges abandoned staging directories under uploads/assets/.staging/<jobId>/<attemptId>/
 *
 * @param {object} params
 * @param {object} [params.dbPool]
 * @param {string} [params.stagingBaseDir]
 * @param {number} [params.gracePeriodMs=3600000]
 * @returns {Promise<{ cleanedAttempts: number }>}
 */
export async function cleanStaleStagingDirectories({
  dbPool = pool,
  stagingBaseDir = DEFAULT_STAGING_BASE_DIR,
  gracePeriodMs = DEFAULT_ORPHAN_GRACE_PERIOD_MS,
} = {}) {
  let cleanedAttempts = 0;
  if (!fs.existsSync(stagingBaseDir)) {
    return { cleanedAttempts };
  }

  const jobDirs = await fs.promises.readdir(stagingBaseDir, { withFileTypes: true });

  for (const jobDirent of jobDirs) {
    if (!jobDirent.isDirectory()) continue;
    const jobId = jobDirent.name;
    const jobPath = path.join(stagingBaseDir, jobId);

    // Check database status for this job
    let jobRow = null;
    try {
      const res = await dbPool.query(
        `SELECT id, status, lease_expires_at
         FROM paper_extraction_jobs
         WHERE id = $1`,
        [jobId]
      );
      jobRow = res.rows[0] || null;
    } catch {
      // If DB check fails, skip this folder defensively
      continue;
    }

    // If job is actively processing with a valid lease, do not touch its staging
    if (
      jobRow &&
      jobRow.status === "processing" &&
      jobRow.lease_expires_at &&
      new Date(jobRow.lease_expires_at).getTime() > Date.now()
    ) {
      continue;
    }

    // Inspect attempt directories inside jobId
    let attemptDirs = [];
    try {
      attemptDirs = await fs.promises.readdir(jobPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const attDirent of attemptDirs) {
      if (!attDirent.isDirectory()) continue;
      const attemptPath = path.join(jobPath, attDirent.name);

      const isOld = await isOlderThanGracePeriod(attemptPath, gracePeriodMs);
      if (isOld) {
        try {
          await fs.promises.rm(attemptPath, { recursive: true, force: true });
          cleanedAttempts++;
        } catch {
          // Ignore individual unlink errors
        }
      }
    }

    // If job directory is now empty, remove it
    try {
      const remaining = await fs.promises.readdir(jobPath);
      if (remaining.length === 0) {
        await fs.promises.rmdir(jobPath);
      }
    } catch {
      // Ignore directory removal errors
    }
  }

  return { cleanedAttempts };
}

/**
 * Scans uploads/assets/<paperId>/<jobId>/<attemptId>/ and removes uncommitted orphan files.
 *
 * @param {object} params
 * @param {object} [params.dbPool]
 * @param {string} [params.canonicalBaseDir]
 * @param {number} [params.gracePeriodMs=3600000]
 * @returns {Promise<{ cleanedAttempts: number }>}
 */
export async function cleanOrphanPermanentAssets({
  dbPool = pool,
  canonicalBaseDir = DEFAULT_CANONICAL_BASE_DIR,
  gracePeriodMs = DEFAULT_ORPHAN_GRACE_PERIOD_MS,
} = {}) {
  let cleanedAttempts = 0;
  if (!fs.existsSync(canonicalBaseDir)) {
    return { cleanedAttempts };
  }

  const paperDirs = await fs.promises.readdir(canonicalBaseDir, { withFileTypes: true });

  for (const paperDirent of paperDirs) {
    if (!paperDirent.isDirectory() || paperDirent.name.startsWith(".")) continue;
    const paperId = paperDirent.name;
    const paperPath = path.join(canonicalBaseDir, paperId);

    let jobDirs = [];
    try {
      jobDirs = await fs.promises.readdir(paperPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const jobDirent of jobDirs) {
      if (!jobDirent.isDirectory()) continue;
      const jobId = jobDirent.name;
      const jobPath = path.join(paperPath, jobId);

      // Check job status and active lease
      let jobRow = null;
      let committedFilePaths = new Set();

      try {
        const jobRes = await dbPool.query(
          `SELECT id, status, lease_expires_at
           FROM paper_extraction_jobs
           WHERE id = $1`,
          [jobId]
        );
        jobRow = jobRes.rows[0] || null;

        // Fetch all committed file paths for this job
        const assetRes = await dbPool.query(
          `SELECT file_path FROM paper_assets WHERE job_id = $1`,
          [jobId]
        );
        for (const r of assetRes.rows) {
          committedFilePaths.add(r.file_path);
        }
      } catch {
        continue;
      }

      // If job is actively processing with valid lease, do not touch
      if (
        jobRow &&
        jobRow.status === "processing" &&
        jobRow.lease_expires_at &&
        new Date(jobRow.lease_expires_at).getTime() > Date.now()
      ) {
        continue;
      }

      let attemptDirs = [];
      try {
        attemptDirs = await fs.promises.readdir(jobPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const attDirent of attemptDirs) {
        if (!attDirent.isDirectory()) continue;
        const attemptId = attDirent.name;
        const attemptPath = path.join(jobPath, attemptId);

        const isOld = await isOlderThanGracePeriod(attemptPath, gracePeriodMs);
        if (!isOld) continue;

        // Check if ANY committed file path belongs to this attempt
        let isCommittedAttempt = false;
        for (const committedPath of committedFilePaths) {
          if (committedPath.includes(`/${jobId}/${attemptId}/`)) {
            isCommittedAttempt = true;
            break;
          }
        }

        // If no committed record references this attempt and grace period elapsed: safe to prune!
        if (!isCommittedAttempt) {
          try {
            await fs.promises.rm(attemptPath, { recursive: true, force: true });
            cleanedAttempts++;
          } catch {
            // Ignore removal errors
          }
        }
      }

      // Clean empty job folder
      try {
        const remaining = await fs.promises.readdir(jobPath);
        if (remaining.length === 0) {
          await fs.promises.rmdir(jobPath);
        }
      } catch {}
    }

    // Clean empty paper folder
    try {
      const remaining = await fs.promises.readdir(paperPath);
      if (remaining.length === 0) {
        await fs.promises.rmdir(paperPath);
      }
    } catch {}
  }

  return { cleanedAttempts };
}

/**
 * Runs a complete orphan recovery sweep across staging and canonical storage.
 *
 * @param {object} params
 * @returns {Promise<{ stagingCleaned: number, permanentCleaned: number }>}
 */
export async function runOrphanRecoverySweep(params = {}) {
  const stagingResult = await cleanStaleStagingDirectories(params);
  const permanentResult = await cleanOrphanPermanentAssets(params);

  return {
    stagingCleaned: stagingResult.cleanedAttempts,
    permanentCleaned: permanentResult.cleanedAttempts,
  };
}

