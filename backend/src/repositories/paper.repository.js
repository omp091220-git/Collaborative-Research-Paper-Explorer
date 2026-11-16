/**
 * paper.repository.js
 *
 * All database operations for the papers table.
 * Follows the same pattern as auth.repository.js:
 *   - Named exports for each DB operation.
 *   - No business logic; pure data access.
 *   - pool imported from config/database.js.
 *
 * FR-06 columns: id, title, abstract, authors, arxiv_id,
 *                file_path, file_size_bytes, mime_type,
 *                uploader_id, uploaded_at, updated_at
 * FR-07 columns: doi, publication_year
 */

import pool from "../config/database.js";

// Columns returned to API consumers (excludes internal file_path for safety).
const PAPER_SELECT_COLS = `
  id, title, abstract, authors, arxiv_id,
  doi, publication_year,
  file_size_bytes, mime_type,
  uploader_id, uploaded_at, updated_at
`;

/**
 * Insert a new paper record.
 *
 * @param {object} paper
 * @param {string}   paper.title
 * @param {string[]} paper.authors
 * @param {string|null} paper.abstract
 * @param {string|null} paper.doi
 * @param {number|null} paper.publicationYear
 * @param {string|null} paper.arxivId
 * @param {string}   paper.filePath        - Relative path stored in DB
 * @param {number}   paper.fileSizeBytes
 * @param {string}   paper.mimeType
 * @param {string}   paper.uploaderId      - UUID of the uploading user
 * @returns {Promise<object>} The created paper row
 */
export async function insertPaper({
  title,
  authors,
  abstract,
  doi,
  publicationYear,
  arxivId,
  filePath,
  fileSizeBytes,
  mimeType,
  uploaderId,
}) {
  const result = await pool.query(
    `INSERT INTO papers
       (title, abstract, authors, doi, publication_year,
        arxiv_id, file_path, file_size_bytes, mime_type, uploader_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${PAPER_SELECT_COLS}`,
    [
      title,
      abstract ?? null,
      authors,
      doi ?? null,
      publicationYear ?? null,
      arxivId ?? null,
      filePath,
      fileSizeBytes,
      mimeType,
      uploaderId,
    ]
  );
  return result.rows[0];
}

/**
 * Inserts a new paper record and its initial extraction job atomically.
 * MUST be called with a dedicated transaction client owned by the caller.
 * Never uses pool.query() or acquires an independent connection.
 *
 * @param {object} params
 * @param {object} params.client - The PostgreSQL transaction client
 * @param {object} params.paperData - Metadata and file properties for the paper
 * @param {object} [params.jobData] - Optional overrides for the initial extraction job
 * @returns {Promise<{ paper: object, job: object }>}
 */
export async function insertPaperWithJob({ client, paperData, jobData = {} }) {
  if (!client || typeof client.query !== "function") {
    throw new Error("insertPaperWithJob requires a transaction client with query method.");
  }

  const {
    title,
    authors,
    abstract,
    doi,
    publicationYear,
    arxivId,
    filePath,
    fileSizeBytes,
    mimeType,
    uploaderId,
  } = paperData;

  const paperResult = await client.query(
    `INSERT INTO papers
       (title, abstract, authors, doi, publication_year,
        arxiv_id, file_path, file_size_bytes, mime_type, uploader_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${PAPER_SELECT_COLS}`,
    [
      title,
      abstract ?? null,
      authors,
      doi ?? null,
      publicationYear ?? null,
      arxivId ?? null,
      filePath,
      fileSizeBytes,
      mimeType,
      uploaderId,
    ]
  );

  const paper = paperResult.rows[0];
  const maxAttempts = jobData.maxAttempts ?? 3;

  const jobResult = await client.query(
    `INSERT INTO paper_extraction_jobs
       (paper_id, status, attempts, max_attempts)
     VALUES ($1, 'pending', 0, $2)
     RETURNING id, paper_id, status, attempts, max_attempts, assets_count, created_at`,
    [paper.id, maxAttempts]
  );

  const job = jobResult.rows[0];
  return { paper, job };
}

/**
 * Return all papers ordered newest-first.
 * @returns {Promise<object[]>}
 */
export async function findAllPapers() {
  const result = await pool.query(
    `SELECT ${PAPER_SELECT_COLS}
     FROM papers
     ORDER BY uploaded_at DESC`
  );
  return result.rows;
}

/**
 * Return a single paper by its UUID.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function findPaperById(id) {
  const result = await pool.query(
    `SELECT ${PAPER_SELECT_COLS}
     FROM papers
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Return a paper by arXiv ID (for duplicate detection before import).
 * @param {string} arxivId
 * @returns {Promise<object|null>}
 */
export async function findPaperByArxivId(arxivId) {
  const result = await pool.query(
    `SELECT id, title FROM papers WHERE arxiv_id = $1`,
    [arxivId]
  );
  return result.rows[0] ?? null;
}

/**
 * Return a paper by DOI (for duplicate detection before import/upload).
 * @param {string} doi
 * @returns {Promise<object|null>}
 */
export async function findPaperByDoi(doi) {
  const result = await pool.query(
    `SELECT id, title, doi FROM papers WHERE doi = $1`,
    [doi]
  );
  return result.rows[0] ?? null;
}