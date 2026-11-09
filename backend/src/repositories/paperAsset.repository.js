/**
 * paperAsset.repository.js
 *
 * Database access layer for the paper_assets table.
 * Adheres strictly to project repository conventions:
 * - Pure data access; no HTTP or business logic.
 * - Supports optional client for transactions.
 */

import pool from "../config/database.js";

const ASSET_SELECT_COLS = `
  id, paper_id, job_id, asset_type, page_number, asset_order,
  file_path, file_size_bytes, mime_type, width, height,
  caption, extraction_metadata, created_at, updated_at
`;

/**
 * Inserts an array of asset records for a specific paper and job.
 * Executes within the provided transaction client.
 *
 * @param {object} client - Dedicated PostgreSQL transaction client
 * @param {object} params
 * @param {string} params.paperId
 * @param {string} params.jobId
 * @param {Array<object>} params.assets
 * @returns {Promise<Array<object>>} Inserted asset rows
 */
export async function insertAssetsBatch(client, { paperId, jobId, assets }) {
  if (!assets || assets.length === 0) return [];
  const db = client || pool;

  const inserted = [];
  for (const asset of assets) {
    const result = await db.query(
      `INSERT INTO paper_assets
         (paper_id, job_id, asset_type, page_number, asset_order,
          file_path, file_size_bytes, mime_type, width, height,
          caption, extraction_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${ASSET_SELECT_COLS}`,
      [
        paperId,
        jobId,
        asset.assetType,
        asset.pageNumber,
        asset.assetOrder ?? 0,
        asset.filePath,
        asset.fileSizeBytes,
        asset.mimeType,
        asset.width ?? null,
        asset.height ?? null,
        asset.caption ?? null,
        JSON.stringify(asset.extractionMetadata ?? {}),
      ]
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

/**
 * Retrieves the currently active asset set for a paper.
 * Active assets are defined as those belonging to the most recently completed extraction job.
 * Previous assets remain visible while a newer job is pending or processing.
 *
 * @param {string} paperId
 * @param {object} [options]
 * @param {string} [options.assetType] - Optional filter ('figure', 'chart', 'table')
 * @param {object} [client]
 * @returns {Promise<Array<object>>}
 */
export async function findActiveAssetsByPaperId(paperId, { assetType } = {}, client) {
  const db = client || pool;
  const values = [paperId];
  let typeFilter = "";

  if (assetType) {
    values.push(assetType);
    typeFilter = `AND a.asset_type = $${values.length}`;
  }

  const query = `
    SELECT ${ASSET_SELECT_COLS.split(",").map((c) => `a.${c.trim()}`).join(", ")}
    FROM paper_assets a
    WHERE a.paper_id = $1
      AND a.job_id = (
        SELECT id
        FROM paper_extraction_jobs
        WHERE paper_id = $1 AND status = 'completed'
        ORDER BY completed_at DESC, created_at DESC
        LIMIT 1
      )
      ${typeFilter}
    ORDER BY a.page_number ASC, a.asset_order ASC
  `;

  const result = await db.query(query, values);
  return result.rows;
}

/**
 * Retrieves a single asset by its UUID and paperId.
 *
 * @param {string} paperId
 * @param {string} assetId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
export async function findAssetById(paperId, assetId, client) {
  const db = client || pool;
  const result = await db.query(
    `SELECT ${ASSET_SELECT_COLS}
     FROM paper_assets
     WHERE id = $1 AND paper_id = $2`,
    [assetId, paperId]
  );
  return result.rows[0] ?? null;
}

/**
 * Finds all assets belonging to older, superseded extraction jobs for a paper.
 *
 * @param {object} client
 * @param {object} params
 * @param {string} params.paperId
 * @param {string} params.currentJobId
 * @returns {Promise<Array<object>>} List of superseded asset rows (including file_path)
 */
export async function findSupersededAssets(client, { paperId, currentJobId }) {
  const db = client || pool;
  const result = await db.query(
    `SELECT id, file_path
     FROM paper_assets
     WHERE paper_id = $1 AND job_id != $2`,
    [paperId, currentJobId]
  );
  return result.rows;
}

/**
 * Deletes asset rows belonging to older, superseded extraction jobs for a paper.
 *
 * @param {object} client
 * @param {object} params
 * @param {string} params.paperId
 * @param {string} params.currentJobId
 * @returns {Promise<number>} Number of deleted rows
 */
export async function deleteSupersededAssets(client, { paperId, currentJobId }) {
  const db = client || pool;
  const result = await db.query(
    `DELETE FROM paper_assets
     WHERE paper_id = $1 AND job_id != $2`,
    [paperId, currentJobId]
  );
  return result.rowCount;
}

