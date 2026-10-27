/**
 * Repository layer for FR-11 Paper Tag Assignments.
 * All SQL queries are strictly parameterized to prevent SQL injection.
 */

import pool from '../config/database.js';

/**
 * Creates a new paper tag assignment.
 *
 * @param {{ paperId: string, tagId: string, annotationId?: string|null, assignedBy?: string|null, client?: object }} params
 * @returns {Promise<object>} The newly created assignment row.
 */
export const createAssignment = async ({
  paperId,
  tagId,
  annotationId = null,
  assignedBy = null,
  client = pool,
}) => {
  const result = await client.query(
    `INSERT INTO paper_tag_assignments (paper_id, annotation_id, tag_id, assigned_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, paper_id, annotation_id, tag_id, assigned_by, created_at`,
    [paperId, annotationId, tagId, assignedBy]
  );
  return result.rows[0];
};

/**
 * Finds a single assignment by its primary key.
 *
 * @param {string} id
 * @param {object} [client=pool]
 * @returns {Promise<object|null>}
 */
export const findAssignmentById = async (id, client = pool) => {
  const result = await client.query(
    `SELECT
       pta.id,
       pta.paper_id,
       pta.annotation_id,
       pta.tag_id,
       pta.assigned_by,
       pta.created_at,
       tt.name        AS tag_name,
       tt.slug        AS tag_slug,
       tt.parent_id   AS tag_parent_id
     FROM paper_tag_assignments pta
     JOIN topic_tags tt ON tt.id = pta.tag_id
     WHERE pta.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Finds an existing assignment by the natural key
 * (paper_id, annotation_id, tag_id) to detect duplicates before INSERT.
 *
 * @param {{ paperId: string, tagId: string, annotationId?: string|null }} params
 * @param {object} [client=pool]
 * @returns {Promise<object|null>}
 */
export const findDuplicateAssignment = async (
  { paperId, tagId, annotationId = null },
  client = pool
) => {
  const query =
    annotationId === null
      ? `SELECT id FROM paper_tag_assignments
         WHERE paper_id = $1 AND tag_id = $2 AND annotation_id IS NULL`
      : `SELECT id FROM paper_tag_assignments
         WHERE paper_id = $1 AND tag_id = $2 AND annotation_id = $3`;

  const params =
    annotationId === null ? [paperId, tagId] : [paperId, tagId, annotationId];

  const result = await client.query(query, params);
  return result.rows[0] || null;
};

/**
 * Lists all tag assignments for a given paper, optionally filtered by annotation.
 * Returns enriched rows including tag name, slug, and canonical path.
 *
 * @param {{ paperId: string, annotationId?: string|null, limit?: number, offset?: number }} params
 * @param {object} [client=pool]
 * @returns {Promise<object[]>}
 */
export const listAssignmentsForPaper = async (
  { paperId, annotationId = undefined, limit = 50, offset = 0 },
  client = pool
) => {
  const conditions = ['pta.paper_id = $1'];
  const params = [paperId];

  if (annotationId !== undefined) {
    if (annotationId === null) {
      conditions.push('pta.annotation_id IS NULL');
    } else {
      params.push(annotationId);
      conditions.push(`pta.annotation_id = $${params.length}`);
    }
  }

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  params.push(offset);
  const offsetPlaceholder = `$${params.length}`;

  const result = await client.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, slug, id AS origin_id, 0 AS level
       FROM topic_tags
       UNION ALL
       SELECT p.id, p.parent_id, p.slug, a.origin_id, a.level + 1
       FROM topic_tags p
       JOIN ancestors a ON p.id = a.parent_id
     ),
     paths AS (
       SELECT origin_id,
              array_to_string(array_agg(slug ORDER BY level DESC), '::') AS canonical_path
       FROM ancestors
       GROUP BY origin_id
     )
     SELECT
       pta.id,
       pta.paper_id,
       pta.annotation_id,
       pta.tag_id,
       pta.assigned_by,
       pta.created_at,
       tt.name        AS tag_name,
       tt.slug        AS tag_slug,
       tt.parent_id   AS tag_parent_id,
       paths.canonical_path
     FROM paper_tag_assignments pta
     JOIN topic_tags tt   ON tt.id = pta.tag_id
     JOIN paths           ON paths.origin_id = pta.tag_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY paths.canonical_path ASC, pta.created_at ASC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    params
  );
  return result.rows;
};

/**
 * Counts total assignments matching the filter (for pagination).
 *
 * @param {{ paperId: string, annotationId?: string|null }} params
 * @param {object} [client=pool]
 * @returns {Promise<number>}
 */
export const countAssignmentsForPaper = async (
  { paperId, annotationId = undefined },
  client = pool
) => {
  const conditions = ['paper_id = $1'];
  const params = [paperId];

  if (annotationId !== undefined) {
    if (annotationId === null) {
      conditions.push('annotation_id IS NULL');
    } else {
      params.push(annotationId);
      conditions.push(`annotation_id = $${params.length}`);
    }
  }

  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM paper_tag_assignments
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows[0]?.count || 0;
};

/**
 * Lists all papers assigned a given tag (optionally filtered to paper-level only).
 *
 * @param {{ tagId: string, limit?: number, offset?: number }} params
 * @param {object} [client=pool]
 * @returns {Promise<object[]>}
 */
export const listPapersForTag = async (
  { tagId, limit = 50, offset = 0 },
  client = pool
) => {
  const result = await client.query(
    `SELECT DISTINCT ON (pta.paper_id)
       pta.id          AS assignment_id,
       pta.paper_id,
       pta.annotation_id,
       pta.assigned_by,
       pta.created_at,
       p.title         AS paper_title
     FROM paper_tag_assignments pta
     JOIN papers p ON p.id = pta.paper_id
     WHERE pta.tag_id = $1
     ORDER BY pta.paper_id, pta.created_at ASC
     LIMIT $2 OFFSET $3`,
    [tagId, limit, offset]
  );
  return result.rows;
};

/**
 * Deletes an assignment by primary key.
 *
 * @param {string} id
 * @param {object} [client=pool]
 * @returns {Promise<object|null>} The deleted row, or null if not found.
 */
export const deleteAssignment = async (id, client = pool) => {
  const result = await client.query(
    `DELETE FROM paper_tag_assignments WHERE id = $1
     RETURNING id, paper_id, annotation_id, tag_id, assigned_by`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Verifies that a paper record exists.
 *
 * @param {string} paperId
 * @param {object} [client=pool]
 * @returns {Promise<boolean>}
 */
export const paperExists = async (paperId, client = pool) => {
  const result = await client.query(
    'SELECT 1 FROM papers WHERE id = $1',
    [paperId]
  );
  return result.rows.length > 0;
};

/**
 * Finds an annotation record by ID.
 *
 * @param {string} annotationId
 * @param {object} [client=pool]
 * @returns {Promise<object|null>}
 */
export const findAnnotationById = async (annotationId, client = pool) => {
  const result = await client.query(
    'SELECT id, paper_id, page_number, content FROM annotations WHERE id = $1',
    [annotationId]
  );
  return result.rows[0] || null;
};

/**
 * Lists all tags assigned to a specific annotation/section.
 *
 * @param {string} annotationId
 * @param {object} [client=pool]
 * @returns {Promise<object[]>}
 */
export const listTagsForAnnotation = async (annotationId, client = pool) => {
  const result = await client.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, slug, id AS origin_id, 0 AS level
       FROM topic_tags
       UNION ALL
       SELECT p.id, p.parent_id, p.slug, a.origin_id, a.level + 1
       FROM topic_tags p
       JOIN ancestors a ON p.id = a.parent_id
     ),
     paths AS (
       SELECT origin_id,
              array_to_string(array_agg(slug ORDER BY level DESC), '::') AS canonical_path
       FROM ancestors
       GROUP BY origin_id
     )
     SELECT
       pta.id         AS assignment_id,
       pta.paper_id,
       pta.annotation_id,
       pta.assigned_by,
       pta.created_at,
       tt.id          AS tag_id,
       tt.name        AS tag_name,
       tt.slug        AS tag_slug,
       tt.parent_id   AS tag_parent_id,
       paths.canonical_path
     FROM paper_tag_assignments pta
     JOIN topic_tags tt ON tt.id = pta.tag_id
     JOIN paths ON paths.origin_id = pta.tag_id
     WHERE pta.annotation_id = $1
     ORDER BY paths.canonical_path ASC, pta.created_at ASC`,
    [annotationId]
  );
  return result.rows;
};

/**
 * Verifies that an annotation record exists and belongs to the given paper.
 *
 * @param {string} annotationId
 * @param {string} paperId
 * @param {object} [client=pool]
 * @returns {Promise<boolean>}
 */
export const annotationBelongsToPaper = async (
  annotationId,
  paperId,
  client = pool
) => {
  const result = await client.query(
    'SELECT 1 FROM annotations WHERE id = $1 AND paper_id = $2',
    [annotationId, paperId]
  );
  return result.rows.length > 0;
};

/**
 * Verifies that a topic tag record exists.
 *
 * @param {string} tagId
 * @param {object} [client=pool]
 * @returns {Promise<boolean>}
 */
export const tagExists = async (tagId, client = pool) => {
  const result = await client.query(
    'SELECT 1 FROM topic_tags WHERE id = $1',
    [tagId]
  );
  return result.rows.length > 0;
};
