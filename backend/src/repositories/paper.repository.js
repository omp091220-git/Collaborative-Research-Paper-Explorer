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
  uploader_id, visibility, is_archived,
  uploaded_at, updated_at
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
  visibility = 'PUBLIC',
}) {
  const result = await pool.query(
    `INSERT INTO papers
       (title, abstract, authors, doi, publication_year,
        arxiv_id, file_path, file_size_bytes, mime_type, uploader_id, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
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
    visibility = 'PUBLIC',
  } = paperData;

  const paperResult = await client.query(
    `INSERT INTO papers
       (title, abstract, authors, doi, publication_year,
        arxiv_id, file_path, file_size_bytes, mime_type, uploader_id, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      visibility === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC',
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
  // Generation is asynchronous; uploads queue a comprehensive summary when configured.
  // This insert shares the upload transaction so a rolled-back paper cannot leave a job.
  if (process.env.GEMINI_API_KEY) {
    await client.query(
      `INSERT INTO structured_summary_jobs(paper_id, model_name)
       VALUES ($1, $2) ON CONFLICT(paper_id, summary_type, model_name) DO NOTHING`,
      [paper.id, process.env.GEMINI_SUMMARY_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite']
    );
  }
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

/**
 * Return papers owned by user with statistics, counts, and filters.
 */
export async function findMyPapers({
  uploaderId,
  search = "",
  visibility = null,
  sort = "newest",
  page = 1,
  limit = 20,
}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const conditions = ["p.uploader_id = $1"];
  const values = [uploaderId];

  if (visibility && (visibility === "PUBLIC" || visibility === "PRIVATE")) {
    values.push(visibility);
    conditions.push(`p.visibility = $${values.length}`);
  }

  if (search && search.trim()) {
    values.push(`%${search.trim()}%`);
    conditions.push(`(p.title ILIKE $${values.length} OR p.abstract ILIKE $${values.length} OR p.authors::text ILIKE $${values.length})`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  let orderBy = "p.uploaded_at DESC";
  if (sort === "oldest") orderBy = "p.uploaded_at ASC";
  else if (sort === "title_asc") orderBy = "p.title ASC";
  else if (sort === "title_desc") orderBy = "p.title DESC";

  // 1. Overall stats for owner
  const statsRes = await pool.query(
    `SELECT
       COUNT(*)::int AS total_papers,
       COUNT(*) FILTER (WHERE visibility = 'PUBLIC')::int AS public_papers,
       COUNT(*) FILTER (WHERE visibility = 'PRIVATE')::int AS private_papers,
       (
         SELECT COUNT(DISTINCT c.user_id)::int
         FROM paper_collaborators c
         JOIN papers p2 ON p2.id = c.paper_id
         WHERE p2.uploader_id = $1 AND c.status <> 'REVOKED'
       ) AS total_collaborators,
       (
         SELECT COUNT(*)::int
         FROM paper_access_requests r
         WHERE r.owner_id = $1 AND r.status = 'PENDING'
       ) AS pending_requests
     FROM papers
     WHERE uploader_id = $1`,
    [uploaderId]
  );
  const stats = statsRes.rows[0] || {
    total_papers: 0,
    public_papers: 0,
    private_papers: 0,
    total_collaborators: 0,
    pending_requests: 0,
  };

  // 2. Count matching filter
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM papers p ${whereClause}`,
    values
  );
  const total = countRes.rows[0]?.count || 0;

  // 3. Data query with counts
  const dataSql = `
    SELECT p.id, p.title, p.abstract, p.authors, p.arxiv_id, p.doi,
           p.publication_year, p.visibility, p.is_archived,
           p.file_size_bytes, p.mime_type, p.uploader_id,
           p.uploaded_at, p.updated_at,
           u.full_name AS owner_name, u.email AS owner_email, u.affiliation AS owner_affiliation,
           COALESCE(c_count.count, 0)::int AS collaborator_count,
           COALESCE(a_count.count, 0)::int AS annotation_count,
           COALESCE(t_count.count, 0)::int AS tag_count,
           COALESCE(req_count.count, 0)::int AS pending_requests_count
    FROM papers p
    JOIN users u ON u.id = p.uploader_id
    LEFT JOIN (
      SELECT paper_id, COUNT(*)::int AS count
      FROM paper_collaborators
      WHERE status <> 'REVOKED'
      GROUP BY paper_id
    ) c_count ON c_count.paper_id = p.id
    LEFT JOIN (
      SELECT paper_id, COUNT(*)::int AS count
      FROM annotations
      GROUP BY paper_id
    ) a_count ON a_count.paper_id = p.id
    LEFT JOIN (
      SELECT paper_id, COUNT(DISTINCT tag_id)::int AS count
      FROM paper_tag_assignments
      GROUP BY paper_id
    ) t_count ON t_count.paper_id = p.id
    LEFT JOIN (
      SELECT paper_id, COUNT(*)::int AS count
      FROM paper_access_requests
      WHERE status = 'PENDING'
      GROUP BY paper_id
    ) req_count ON req_count.paper_id = p.id
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}
  `;

  const dataRes = await pool.query(dataSql, [...values, limitNum, offset]);

  return {
    papers: dataRes.rows,
    stats,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

/**
 * Update paper visibility.
 */
export async function updatePaperVisibility(paperId, visibility) {
  const result = await pool.query(
    `UPDATE papers
     SET visibility = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING ${PAPER_SELECT_COLS}`,
    [visibility, paperId]
  );
  return result.rows[0] || null;
}

/**
 * Update paper archive status.
 */
export async function setPaperArchived(paperId, isArchived) {
  const result = await pool.query(
    `UPDATE papers
     SET is_archived = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING ${PAPER_SELECT_COLS}`,
    [isArchived, paperId]
  );
  return result.rows[0] || null;
}

/**
 * Delete a paper by ID.
 */
export async function deletePaperById(paperId) {
  const result = await pool.query(
    `DELETE FROM papers WHERE id = $1 RETURNING id`,
    [paperId]
  );
  return result.rows[0] || null;
}
