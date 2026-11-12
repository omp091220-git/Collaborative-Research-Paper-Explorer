/**
 * atomicPersistence.js
 *
 * FR-09 Phase 3.3.1: Atomic Database Persistence & Filesystem Promotion.
 *
 * Ensures all visual assets and extraction job completion are committed
 * atomically within a single PostgreSQL transaction with lease fencing.
 * Provides compensating filesystem rollback if the transaction fails or aborts.
 */

import fs from "node:fs";
import path from "node:path";
import { insertAssetsBatch } from "../repositories/paperAsset.repository.js";
import { cleanStagingDirectory } from "../utils/assetStagingManager.js";

/**
 * Default canonical base directory for permanent assets.
 */
export const DEFAULT_CANONICAL_BASE_DIR = path.resolve(process.cwd(), "uploads/assets");

/**
 * Promotes a staged asset file to its permanent canonical storage path.
 *
 * @param {string} stagedPath - Absolute path to temporary staged file
 * @param {string} canonicalPath - Absolute path to permanent destination
 * @returns {Promise<string>} Promoted canonical path
 */
export async function promoteStagedAsset(stagedPath, canonicalPath) {
  if (!fs.existsSync(stagedPath)) {
    const err = new Error(`Staged asset does not exist: ${stagedPath}`);
    err.code = "STAGED_ASSET_NOT_FOUND";
    throw err;
  }

  const destDir = path.dirname(canonicalPath);
  await fs.promises.mkdir(destDir, { recursive: true });
  await fs.promises.copyFile(stagedPath, canonicalPath);
  return canonicalPath;
}

/**
 * Rollback helper: unlinks an array of promoted files.
 *
 * @param {Array<string>} filePaths
 * @returns {Promise<void>}
 */
export async function rollbackPromotedFiles(filePaths) {
  if (!Array.isArray(filePaths)) return;
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // Continue removing remaining files even if one unlink fails
    }
  }
}

/**
 * Atomically promotes assets to canonical filesystem and commits database records.
 *
 * Steps:
 * 1. Promotes staged files to canonical paths (`uploads/assets/<paperId>/<jobId>/<filename>`).
 * 2. Begins PostgreSQL transaction on provided dedicated client.
 * 3. Enforces lease fencing check (`FOR UPDATE`).
 * 4. Inserts assets into `paper_assets` via `insertAssetsBatch`.
 * 5. Updates `paper_extraction_jobs` status to 'completed', clears lease, sets assets_count.
 * 6. Commits transaction.
 * 7. On success, cleans attempt staging directory.
 * 8. On failure, rolls back transaction and removes promoted files via compensating rollback.
 *
 * @param {object} params
 * @param {object} params.client - Dedicated PostgreSQL transaction client
 * @param {string} params.paperId - UUID
 * @param {string} params.jobId - UUID
 * @param {string} params.leaseToken - UUID
 * @param {Array<object>} params.assets - Array of extracted asset descriptors
 * @param {string} [params.attemptId] - Staging attempt identifier
 * @param {string} [params.stagingBaseDir] - Staging directory root
 * @param {string} [params.canonicalBaseDir] - Canonical assets root
 * @returns {Promise<{ jobId: string, paperId: string, assetsCount: number, assets: Array<object> }>}
 */
export async function commitExtractionJobTransaction({
  client,
  paperId,
  jobId,
  leaseToken,
  assets = [],
  attemptId,
  stagingBaseDir,
  canonicalBaseDir = DEFAULT_CANONICAL_BASE_DIR,
}) {
  if (!client || typeof client.query !== "function") {
    throw new Error("commitExtractionJobTransaction: A valid PostgreSQL client is required.");
  }
  if (!paperId || !jobId || !leaseToken) {
    throw new Error("commitExtractionJobTransaction: Missing required paperId, jobId, or leaseToken.");
  }

  const promotedFiles = [];
  const preparedAssets = [];

  try {
    // 1. Begin PostgreSQL Transaction first to establish row-level lock
    await client.query("BEGIN");

    // 2. Lease Fencing Check with exclusive row-level lock (FOR UPDATE)
    const fenceCheck = await client.query(
      `SELECT id FROM paper_extraction_jobs
       WHERE id = $1
         AND lease_token = $2
         AND status = 'processing'
         AND lease_expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [jobId, leaseToken]
    );

    if (fenceCheck.rowCount === 0) {
      const err = new Error(
        `Lease fencing check failed for job ${jobId}: lease expired or acquired by another worker.`
      );
      err.code = "LEASE_FENCING_FAILED";
      throw err;
    }

    // 3. Promote staged assets to attempt-isolated canonical storage
    // Layout: uploads/assets/<paperId>/<jobId>/<attemptId>/<filename>
    const safeAttemptId = attemptId || "att-1";
    for (const asset of assets) {
      const canonicalRelPath = `uploads/assets/${paperId}/${jobId}/${safeAttemptId}/${asset.filename}`;
      const canonicalAbsPath = path.resolve(canonicalBaseDir, paperId, jobId, safeAttemptId, asset.filename);

      if (asset.stagedFilePath) {
        await promoteStagedAsset(asset.stagedFilePath, canonicalAbsPath);
        promotedFiles.push(canonicalAbsPath);
      }

      preparedAssets.push({
        ...asset,
        filePath: canonicalRelPath,
      });
    }

    // 4. Batch Insert Assets
    let insertedAssets = [];
    if (preparedAssets.length > 0) {
      insertedAssets = await insertAssetsBatch(client, {
        paperId,
        jobId,
        assets: preparedAssets,
      });
    }

    // 5. Complete Job Record
    const completeRes = await client.query(
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
       RETURNING id`,
      [jobId, leaseToken, insertedAssets.length]
    );

    if (completeRes.rowCount === 0) {
      const err = new Error(
        `Job completion update failed for job ${jobId}: lease lost during completion.`
      );
      err.code = "LEASE_LOST_ON_COMPLETION";
      throw err;
    }

    // 6. Commit Transaction
    await client.query("COMMIT");

    // 7. Cleanup attempt staging directory after successful commit
    if (attemptId) {
      await cleanStagingDirectory(jobId, attemptId, stagingBaseDir).catch(() => {});
    }

    return {
      jobId,
      paperId,
      assetsCount: insertedAssets.length,
      assets: insertedAssets,
    };
  } catch (err) {
    // Database Rollback
    await client.query("ROLLBACK").catch(() => {});

    // Compensating Filesystem Rollback
    await rollbackPromotedFiles(promotedFiles);

    throw err;
  }
}

