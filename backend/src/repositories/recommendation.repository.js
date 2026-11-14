import pool from '../config/database.js';

/**
 * Repository layer for FR-14: Section-Level Recommendations & Embeddings.
 * Strictly parameterized SQL queries.
 */

/**
 * Retrieves a paper along with all its sections and associated hierarchical tags.
 */
export const getPaperWithSectionsAndTags = async (paperId, client = pool) => {
  const paperRes = await client.query(
    `SELECT id, title, abstract, authors, arxiv_id, uploaded_at
     FROM papers
     WHERE id = $1`,
    [paperId]
  );

  if (paperRes.rows.length === 0) return null;
  const paper = paperRes.rows[0];

  // Fetch sections
  const sectionsRes = await client.query(
    `SELECT id, section_title, section_order, content, page_number, embedding
     FROM paper_sections
     WHERE paper_id = $1
     ORDER BY section_order ASC`,
    [paperId]
  );

  // Fetch section tags with canonical hierarchical paths
  const tagsRes = await client.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, slug, id AS origin_id, 0 AS level
       FROM topic_tags
       UNION ALL
       SELECT p.id, p.parent_id, p.slug, a.origin_id, a.level + 1
       FROM topic_tags p
       JOIN ancestors a ON p.id = a.parent_id
     ),
     paths AS (
       SELECT origin_id, array_to_string(array_agg(slug ORDER BY level DESC), '::') AS canonical_path
       FROM ancestors
       GROUP BY origin_id
     )
     SELECT 
       pst.id AS link_id,
       pst.section_id,
       pst.tag_id,
       pst.confidence,
       t.name AS tag_name,
       t.slug AS tag_slug,
       p.canonical_path
     FROM paper_section_tags pst
     JOIN topic_tags t ON pst.tag_id = t.id
     JOIN paths p ON t.id = p.origin_id
     WHERE pst.paper_id = $1`,
    [paperId]
  );

  const tagsBySection = new Map();
  const allPaperTags = [];

  for (const row of tagsRes.rows) {
    if (!tagsBySection.has(row.section_id)) {
      tagsBySection.set(row.section_id, []);
    }
    const tagInfo = {
      tagId: row.tag_id,
      name: row.tag_name,
      slug: row.tag_slug,
      canonicalPath: row.canonical_path,
      confidence: parseFloat(row.confidence),
    };
    tagsBySection.get(row.section_id).push(tagInfo);
    allPaperTags.push(tagInfo);
  }

  const sections = sectionsRes.rows.map((sec) => ({
    id: sec.id,
    title: sec.section_title,
    order: sec.section_order,
    content: sec.content,
    pageNumber: sec.page_number,
    embedding: sec.embedding,
    tags: tagsBySection.get(sec.id) || [],
  }));

  return {
    ...paper,
    sections,
    tags: allPaperTags,
  };
};

/**
 * Retrieves all candidate papers excluding the target paper,
 * including their sections, embeddings, and hierarchical tags.
 */
export const getAllCandidatePapers = async (excludePaperId = null, client = pool) => {
  const whereClause = excludePaperId ? 'WHERE p.id <> $1' : '';
  const params = excludePaperId ? [excludePaperId] : [];

  const papersRes = await client.query(
    `SELECT p.id, p.title, p.abstract, p.authors, p.arxiv_id, p.uploaded_at
     FROM papers p
     ${whereClause}
     ORDER BY p.uploaded_at DESC`,
    params
  );

  if (papersRes.rows.length === 0) return [];

  const paperIds = papersRes.rows.map((p) => p.id);

  // Fetch all sections for these candidates
  const sectionsRes = await client.query(
    `SELECT id, paper_id, section_title, section_order, content, embedding
     FROM paper_sections
     WHERE paper_id = ANY($1::uuid[])
     ORDER BY paper_id, section_order ASC`,
    [paperIds]
  );

  // Fetch all tags with canonical paths for these candidates
  const tagsRes = await client.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, slug, id AS origin_id, 0 AS level
       FROM topic_tags
       UNION ALL
       SELECT p.id, p.parent_id, p.slug, a.origin_id, a.level + 1
       FROM topic_tags p
       JOIN ancestors a ON p.id = a.parent_id
     ),
     paths AS (
       SELECT origin_id, array_to_string(array_agg(slug ORDER BY level DESC), '::') AS canonical_path
       FROM ancestors
       GROUP BY origin_id
     )
     SELECT 
       pst.paper_id,
       pst.section_id,
       pst.tag_id,
       pst.confidence,
       t.name AS tag_name,
       t.slug AS tag_slug,
       p.canonical_path
     FROM paper_section_tags pst
     JOIN topic_tags t ON pst.tag_id = t.id
     JOIN paths p ON t.id = p.origin_id
     WHERE pst.paper_id = ANY($1::uuid[])`,
    [paperIds]
  );

  // Group sections by paper
  const sectionsByPaper = new Map();
  for (const sec of sectionsRes.rows) {
    if (!sectionsByPaper.has(sec.paper_id)) {
      sectionsByPaper.set(sec.paper_id, []);
    }
    sectionsByPaper.get(sec.paper_id).push(sec);
  }

  // Group tags by paper
  const tagsByPaper = new Map();
  for (const tag of tagsRes.rows) {
    if (!tagsByPaper.has(tag.paper_id)) {
      tagsByPaper.set(tag.paper_id, []);
    }
    tagsByPaper.get(tag.paper_id).push({
      tagId: tag.tag_id,
      sectionId: tag.section_id,
      name: tag.tag_name,
      slug: tag.tag_slug,
      canonicalPath: tag.canonical_path,
      confidence: parseFloat(tag.confidence),
    });
  }

  return papersRes.rows.map((p) => ({
    ...p,
    sections: sectionsByPaper.get(p.id) || [],
    tags: tagsByPaper.get(p.id) || [],
  }));
};

/**
 * Inserts a section for a paper.
 */
export const insertPaperSection = async ({
  paperId,
  sectionTitle,
  sectionOrder = 0,
  content,
  pageNumber = null,
  embedding = null,
  client = pool,
}) => {
  const result = await client.query(
    `INSERT INTO paper_sections (paper_id, section_title, section_order, content, page_number, embedding)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, paper_id, section_title, section_order, content, page_number, embedding, created_at`,
    [paperId, sectionTitle, sectionOrder, content, pageNumber, embedding ? JSON.stringify(embedding) : null]
  );
  return result.rows[0];
};

/**
 * Binds a hierarchical topic tag to a specific paper section.
 */
export const tagSection = async ({
  sectionId,
  paperId,
  tagId,
  confidence = 1.0,
  assignedBy = null,
  client = pool,
}) => {
  const result = await client.query(
    `INSERT INTO paper_section_tags (section_id, paper_id, tag_id, confidence, assigned_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (section_id, tag_id)
     DO UPDATE SET confidence = EXCLUDED.confidence
     RETURNING id, section_id, paper_id, tag_id, confidence, created_at`,
    [sectionId, paperId, tagId, confidence, assignedBy]
  );
  return result.rows[0];
};

/**
 * Count total sections associated with a paper.
 */
export const countSectionsForPaper = async (paperId, client = pool) => {
  const result = await client.query(
    'SELECT COUNT(*)::int AS count FROM paper_sections WHERE paper_id = $1',
    [paperId]
  );
  return result.rows[0]?.count || 0;
};
