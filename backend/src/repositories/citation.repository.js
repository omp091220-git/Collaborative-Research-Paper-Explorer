import pool from '../config/database.js';

/**
 * Repository: Fetch paper details by ID.
 */
export async function findPaperById(paperId) {
  const result = await pool.query(
    `SELECT id, title, abstract, authors, arxiv_id, file_size_bytes, mime_type, uploader_id, uploaded_at, updated_at
     FROM papers
     WHERE id = $1`,
    [paperId]
  );
  return result.rows[0] || null;
}

/**
 * Repository: Fetch backward references (papers cited by this paper).
 * Directed: paperId -> cited_paper_id
 */
export async function getBackwardReferences(paperId) {
  const query = `
    SELECT 
      p.id,
      p.title,
      p.abstract,
      p.authors,
      p.arxiv_id,
      p.uploaded_at,
      c.citation_context,
      'backward' AS node_type
    FROM citations c
    JOIN papers p ON p.id = c.cited_paper_id
    WHERE c.citing_paper_id = $1
    ORDER BY p.uploaded_at DESC
  `;
  const result = await pool.query(query, [paperId]);
  return result.rows;
}

/**
 * Repository: Fetch forward citations (papers that cite this paper).
 * Directed: citing_paper_id -> paperId
 */
export async function getForwardCitations(paperId) {
  const query = `
    SELECT 
      p.id,
      p.title,
      p.abstract,
      p.authors,
      p.arxiv_id,
      p.uploaded_at,
      c.citation_context,
      'forward' AS node_type
    FROM citations c
    JOIN papers p ON p.id = c.citing_paper_id
    WHERE c.cited_paper_id = $1
    ORDER BY p.uploaded_at DESC
  `;
  const result = await pool.query(query, [paperId]);
  return result.rows;
}

/**
 * Repository: Fetch co-citations.
 * Papers that are co-cited together with paperId by a common third paper.
 */
export async function getCoCitations(paperId) {
  const query = `
    SELECT 
      p.id,
      p.title,
      p.abstract,
      p.authors,
      p.arxiv_id,
      p.uploaded_at,
      COUNT(DISTINCT c1.citing_paper_id)::int AS co_citation_strength,
      'co_citation' AS node_type
    FROM citations c1
    JOIN citations c2 
      ON c1.citing_paper_id = c2.citing_paper_id 
     AND c2.cited_paper_id <> $1
    JOIN papers p ON p.id = c2.cited_paper_id
    WHERE c1.cited_paper_id = $1
    GROUP BY p.id, p.title, p.abstract, p.authors, p.arxiv_id, p.uploaded_at
    ORDER BY co_citation_strength DESC
    LIMIT 20
  `;
  const result = await pool.query(query, [paperId]);
  return result.rows;
}

/**
 * Repository: Create a directed citation link.
 */
export async function createCitation(citingPaperId, citedPaperId, citationContext = null) {
  const query = `
    INSERT INTO citations (citing_paper_id, cited_paper_id, citation_context)
    VALUES ($1, $2, $3)
    ON CONFLICT (citing_paper_id, cited_paper_id) DO NOTHING
    RETURNING id, citing_paper_id, cited_paper_id, citation_context, created_at
  `;
  const result = await pool.query(query, [citingPaperId, citedPaperId, citationContext]);
  return result.rows[0] || null;
}
