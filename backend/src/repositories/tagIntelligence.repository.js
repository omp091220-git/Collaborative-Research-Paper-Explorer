import pool from '../config/database.js';

/**
 * Repository for Tag Intelligence, AI Deduplication & Hierarchical Paper Search (FR-12 & FR-13).
 */

/**
 * Retrieves candidate tags for similarity matching.
 * Optionally prioritizes siblings if parentId is provided.
 */
export const findCandidateTags = async ({ parentId = null, limit = 200, client = pool } = {}) => {
  const query = `
    WITH RECURSIVE tag_paths AS (
      SELECT id, parent_id, slug, name, description, slug AS path, 0 AS level
      FROM topic_tags
      WHERE parent_id IS NULL
      UNION ALL
      SELECT c.id, c.parent_id, c.slug, c.name, c.description, tp.path || '::' || c.slug, tp.level + 1
      FROM topic_tags c
      JOIN tag_paths tp ON c.parent_id = tp.id
    )
    SELECT id, parent_id, slug, name, description, path AS canonical_path,
           CASE WHEN parent_id IS NOT DISTINCT FROM $1 THEN 1 ELSE 0 END AS is_same_branch
    FROM tag_paths
    ORDER BY is_same_branch DESC, name ASC
    LIMIT $2;
  `;
  const result = await client.query(query, [parentId, limit]);
  return result.rows;
};

/**
 * Fetches cached deduplication result by SHA-256 hash (NFR-10).
 */
export const getCachedDeduplicationResult = async (queryHash, client = pool) => {
  const result = await client.query(
    `SELECT result, created_at FROM tag_deduplication_cache WHERE query_hash = $1`,
    [queryHash]
  );
  return result.rows[0]?.result || null;
};

/**
 * Caches deduplication result to eliminate duplicate GenAI API calls (NFR-10).
 */
export const cacheDeduplicationResult = async ({
  queryHash,
  queryText,
  parentId = null,
  result,
  client = pool,
}) => {
  await client.query(
    `INSERT INTO tag_deduplication_cache (query_hash, query_text, parent_id, result)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (query_hash) 
     DO UPDATE SET result = $4, created_at = CURRENT_TIMESTAMP`,
    [queryHash, queryText, parentId, JSON.stringify(result)]
  );
};

/**
 * Assigns a hierarchical topic tag to a paper with optional section coordinates (FR-11 integration).
 */
export const assignTagToPaper = async ({
  paperId,
  tagId,
  assignedBy = null,
  confidenceScore = 1.0,
  sectionName = 'General',
  pageNumber = null,
  boundingBox = null,
  client = pool,
}) => {
  const result = await client.query(
    `INSERT INTO paper_tags (
       paper_id, tag_id, assigned_by, confidence_score, section_name, page_number, bounding_box
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (paper_id, tag_id, section_name, page_number)
     DO UPDATE SET 
       confidence_score = EXCLUDED.confidence_score,
       bounding_box = EXCLUDED.bounding_box
     RETURNING *`,
    [
      paperId,
      tagId,
      assignedBy,
      confidenceScore,
      sectionName,
      pageNumber,
      boundingBox ? JSON.stringify(boundingBox) : null,
    ]
  );
  return result.rows[0];
};

/**
 * FR-13: Hierarchical Tag Paper Search & Filtering (NFR-04: sub-300ms query).
 * Uses recursive CTE to match papers assigned to target tag OR ANY DESCENDANT TAG.
 */
export const searchPapersByHierarchicalTag = async ({
  tagId = null,
  tagSlug = null,
  scope = 'global',
  userId = null,
  searchQuery = null,
  page = 1,
  limit = 20,
  includeSubtree = true,
  client = pool,
}) => {
  const offset = (page - 1) * limit;

  // 1. Recursive CTE: retrieve target tag and all descendants
  const cteSql = `
    WITH RECURSIVE target_tags AS (
      SELECT id, parent_id, slug, name, 0 AS depth
      FROM topic_tags
      WHERE ($1::uuid IS NOT NULL AND id = $1)
         OR ($2::varchar IS NOT NULL AND slug = $2)
      UNION ALL
      SELECT c.id, c.parent_id, c.slug, c.name, tt.depth + 1
      FROM topic_tags c
      JOIN target_tags tt ON c.parent_id = tt.id
      WHERE $3::boolean = TRUE
    ),
    matched_papers AS (
      SELECT 
        p.id AS paper_id,
        p.title,
        p.abstract,
        p.authors,
        p.arxiv_id,
        p.file_path,
        p.file_size_bytes,
        p.mime_type,
        p.uploader_id,
        p.uploaded_at,
        p.updated_at,
        u.full_name AS uploader_name,
        u.email AS uploader_email,
        json_agg(
          json_build_object(
            'tagId', tt.id,
            'name', tt.name,
            'slug', tt.slug,
            'depth', tt.depth,
            'sectionName', pt.section_name,
            'pageNumber', pt.page_number,
            'boundingBox', pt.bounding_box,
            'confidenceScore', pt.confidence_score
          )
        ) AS matched_tag_annotations
      FROM papers p
      JOIN paper_tags pt ON pt.paper_id = p.id
      JOIN target_tags tt ON pt.tag_id = tt.id
      LEFT JOIN users u ON p.uploader_id = u.id
      WHERE 
        -- Scope Filter: personal vs global
        (
          $4::varchar = 'global'
          OR (
            $4::varchar = 'personal' AND (
              p.uploader_id = $5::uuid
              OR EXISTS (
                SELECT 1 FROM paper_collaborators pc 
                WHERE pc.paper_id = p.id AND pc.user_id = $5::uuid
              )
            )
          )
        )
        -- Optional Full-Text / Keyword Search
        AND (
          $6::text IS NULL
          OR p.title ILIKE '%' || $6 || '%'
          OR COALESCE(p.abstract, '') ILIKE '%' || $6 || '%'
        )
      GROUP BY p.id, u.full_name, u.email
    )
  `;

  // Total count query
  const countSql = `${cteSql} SELECT COUNT(*)::int AS total FROM matched_papers;`;
  const countResult = await client.query(countSql, [
    tagId,
    tagSlug,
    includeSubtree,
    scope,
    userId,
    searchQuery,
  ]);
  const total = countResult.rows[0]?.total || 0;

  // Paginated records query
  const dataSql = `
    ${cteSql}
    SELECT * FROM matched_papers
    ORDER BY uploaded_at DESC
    LIMIT $7 OFFSET $8;
  `;
  const dataResult = await client.query(dataSql, [
    tagId,
    tagSlug,
    includeSubtree,
    scope,
    userId,
    searchQuery,
    limit,
    offset,
  ]);

  return {
    papers: dataResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
};

/**
 * FR-12: Tag Consolidation / Aliasing.
 * Merges source tag usages into target tag and records canonical alias.
 */
export const consolidateTags = async ({
  sourceTagId,
  targetTagId,
  action = 'ALIAS',
  userId = null,
  client = pool,
}) => {
  const useExternalTx = client !== pool;
  const dbClient = useExternalTx ? client : await pool.connect();

  try {
    if (!useExternalTx) await dbClient.query('BEGIN');

    // 1. Fetch source and target tags
    const tagsResult = await dbClient.query(
      `SELECT id, name, slug FROM topic_tags WHERE id IN ($1, $2)`,
      [sourceTagId, targetTagId]
    );

    const sourceTag = tagsResult.rows.find((t) => t.id === sourceTagId);
    const targetTag = tagsResult.rows.find((t) => t.id === targetTagId);

    if (!sourceTag) throw new Error(`Source tag with id '${sourceTagId}' not found.`);
    if (!targetTag) throw new Error(`Target tag with id '${targetTagId}' not found.`);

    // 2. Transfer non-conflicting paper tag assignments
    await dbClient.query(
      `UPDATE paper_tags
       SET tag_id = $1
       WHERE tag_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM paper_tags pt2
           WHERE pt2.paper_id = paper_tags.paper_id
             AND pt2.tag_id = $1
             AND pt2.section_name = paper_tags.section_name
             AND pt2.page_number IS NOT DISTINCT FROM paper_tags.page_number
         )`,
      [targetTagId, sourceTagId]
    );

    // 3. Remove any remaining duplicate assignments
    await dbClient.query(`DELETE FROM paper_tags WHERE tag_id = $1`, [sourceTagId]);

    // 4. Record alias mapping in tag_aliases
    await dbClient.query(
      `INSERT INTO tag_aliases (alias_name, alias_slug, canonical_tag_id, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (alias_slug) DO UPDATE SET canonical_tag_id = $3`,
      [sourceTag.name, sourceTag.slug, targetTagId, userId]
    );

    let deleted = false;
    // 5. If MERGE_AND_DELETE: reparent child tags and delete source tag
    if (action === 'MERGE_AND_DELETE') {
      await dbClient.query(
        `UPDATE topic_tags SET parent_id = $1 WHERE parent_id = $2`,
        [targetTagId, sourceTagId]
      );
      await dbClient.query(`DELETE FROM topic_tags WHERE id = $1`, [sourceTagId]);
      deleted = true;
    }

    if (!useExternalTx) await dbClient.query('COMMIT');

    return {
      success: true,
      action,
      sourceTag: { id: sourceTag.id, name: sourceTag.name, slug: sourceTag.slug },
      targetTag: { id: targetTag.id, name: targetTag.name, slug: targetTag.slug },
      deleted,
    };
  } catch (error) {
    if (!useExternalTx) await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    if (!useExternalTx) dbClient.release();
  }
};
