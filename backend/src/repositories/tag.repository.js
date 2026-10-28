import pool from '../config/database.js';

/**
 * Repository layer for Hierarchical Topic Tags (FR-10).
 * All queries are strictly parameterized to prevent SQL injection.
 */

/**
 * Creates a new topic tag (root or child).
 */
export const createTag = async ({
  name,
  slug,
  parentId = null,
  description = null,
  createdBy = null,
  client = pool,
}) => {
  const result = await client.query(
    `INSERT INTO topic_tags (name, slug, parent_id, description, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, slug, parent_id, description, created_by, created_at, updated_at`,
    [name, slug, parentId, description, createdBy]
  );
  return result.rows[0];
};

/**
 * Retrieves a tag by ID along with its immediate parent details and canonical path.
 */
export const findTagById = async (id, client = pool) => {
  const result = await client.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, slug, name, 0 AS level
       FROM topic_tags
       WHERE id = $1
       UNION ALL
       SELECT t.id, t.parent_id, t.slug, t.name, a.level + 1
       FROM topic_tags t
       JOIN ancestors a ON t.id = a.parent_id
     )
     SELECT 
       t.id,
       t.name,
       t.slug,
       t.parent_id,
       t.description,
       t.created_by,
       t.created_at,
       t.updated_at,
       p.name AS parent_name,
       p.slug AS parent_slug,
       (
         SELECT array_to_string(array_agg(slug ORDER BY level DESC), '::')
         FROM ancestors
       ) AS canonical_path,
       (
         SELECT COALESCE(
           json_agg(
             json_build_object('id', id, 'name', name, 'slug', slug)
             ORDER BY level DESC
           ),
           '[]'::json
         )
         FROM ancestors
         WHERE id <> t.id
       ) AS ancestors
     FROM topic_tags t
     LEFT JOIN topic_tags p ON t.parent_id = p.id
     WHERE t.id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

/**
 * Finds a tag by slug and parent_id (or null for root tags).
 */
export const findTagBySlugAndParent = async (slug, parentId = null, client = pool) => {
  const query = parentId === null
    ? `SELECT id, name, slug, parent_id, description, created_at, updated_at
       FROM topic_tags
       WHERE slug = $1 AND parent_id IS NULL`
    : `SELECT id, name, slug, parent_id, description, created_at, updated_at
       FROM topic_tags
       WHERE slug = $1 AND parent_id = $2`;

  const params = parentId === null ? [slug] : [slug, parentId];
  const result = await client.query(query, params);
  return result.rows[0] || null;
};

/**
 * Checks if a candidate target node is a descendant of the source node.
 * Used for cycle prevention during reparenting.
 */
export const isDescendant = async (ancestorId, targetId, client = pool) => {
  if (ancestorId === targetId) return true;

  const result = await client.query(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM topic_tags WHERE parent_id = $1
       UNION ALL
       SELECT t.id FROM topic_tags t JOIN subtree s ON t.parent_id = s.id
     )
     SELECT EXISTS (SELECT 1 FROM subtree WHERE id = $2) AS is_descendant;`,
    [ancestorId, targetId]
  );

  return Boolean(result.rows[0]?.is_descendant);
};

/**
 * Checks if a tag has any children.
 */
export const countChildren = async (parentId, client = pool) => {
  const result = await client.query(
    'SELECT COUNT(*)::int AS count FROM topic_tags WHERE parent_id = $1',
    [parentId]
  );
  return result.rows[0]?.count || 0;
};

/**
 * Retrieves the immediate children of a tag.
 */
export const getChildren = async (parentId = null, client = pool) => {
  const query = parentId === null
    ? `SELECT id, name, slug, parent_id, description, created_at, updated_at
       FROM topic_tags
       WHERE parent_id IS NULL
       ORDER BY name ASC`
    : `SELECT id, name, slug, parent_id, description, created_at, updated_at
       FROM topic_tags
       WHERE parent_id = $1
       ORDER BY name ASC`;

  const params = parentId === null ? [] : [parentId];
  const result = await client.query(query, params);
  return result.rows;
};

/**
 * Retrieves all ancestors of a given tag, ordered from root to parent.
 */
export const getAncestors = async (id, client = pool) => {
  const result = await client.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, slug, name, description, 0 AS level
       FROM topic_tags
       WHERE id = (SELECT parent_id FROM topic_tags WHERE id = $1)
       UNION ALL
       SELECT t.id, t.parent_id, t.slug, t.name, t.description, a.level + 1
       FROM topic_tags t
       JOIN ancestors a ON t.id = a.parent_id
     )
     SELECT id, name, slug, parent_id, description
     FROM ancestors
     ORDER BY level DESC`,
    [id]
  );
  return result.rows;
};

/**
 * Retrieves full subtree rooted at given tag ID, or entire forest if id is null.
 * Returns flattened rows with level/depth and path.
 */
export const getSubtreeRows = async (rootId = null, client = pool) => {
  const query = rootId === null
    ? `WITH RECURSIVE tree AS (
         SELECT 
           id, parent_id, name, slug, description, created_at, updated_at,
           1 AS depth,
           ARRAY[slug]::text[] AS slug_hierarchy
         FROM topic_tags
         WHERE parent_id IS NULL
         UNION ALL
         SELECT 
           c.id, c.parent_id, c.name, c.slug, c.description, c.created_at, c.updated_at,
           p.depth + 1,
           p.slug_hierarchy || c.slug
         FROM topic_tags c
         JOIN tree p ON c.parent_id = p.id
       )
       SELECT 
         id, parent_id, name, slug, description, depth,
         array_to_string(slug_hierarchy, '::') AS canonical_path,
         created_at, updated_at
       FROM tree
       ORDER BY slug_hierarchy ASC`
    : `WITH RECURSIVE tree AS (
         SELECT 
           id, parent_id, name, slug, description, created_at, updated_at,
           1 AS depth,
           ARRAY[slug]::text[] AS slug_hierarchy
         FROM topic_tags
         WHERE id = $1
         UNION ALL
         SELECT 
           c.id, c.parent_id, c.name, c.slug, c.description, c.created_at, c.updated_at,
           p.depth + 1,
           p.slug_hierarchy || c.slug
         FROM topic_tags c
         JOIN tree p ON c.parent_id = p.id
       )
       SELECT 
         id, parent_id, name, slug, description, depth,
         array_to_string(slug_hierarchy, '::') AS canonical_path,
         created_at, updated_at
       FROM tree
       ORDER BY slug_hierarchy ASC`;

  const params = rootId === null ? [] : [rootId];
  const result = await client.query(query, params);
  return result.rows;
};

/**
 * Lists tags with optional parent filtering, search query, pagination, and canonical path.
 */
export const listTags = async ({
  parentId = undefined,
  search = null,
  limit = 50,
  offset = 0,
  client = pool,
} = {}) => {
  const conditions = [];
  const params = [];

  if (parentId !== undefined) {
    if (parentId === null || parentId === 'root') {
      conditions.push('t.parent_id IS NULL');
    } else {
      params.push(parentId);
      conditions.push(`t.parent_id = $${params.length}`);
    }
  }

  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    conditions.push(
      `(LOWER(t.name) LIKE $${params.length} OR LOWER(t.slug) LIKE $${params.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  params.push(offset);
  const offsetPlaceholder = `$${params.length}`;

  const query = `
    WITH RECURSIVE ancestors AS (
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
      t.id,
      t.name,
      t.slug,
      t.parent_id,
      t.description,
      t.created_by,
      t.created_at,
      t.updated_at,
      p.canonical_path,
      (SELECT COUNT(*)::int FROM topic_tags c WHERE c.parent_id = t.id) AS children_count
    FROM topic_tags t
    JOIN paths p ON t.id = p.origin_id
    ${whereClause}
    ORDER BY p.canonical_path ASC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
  `;

  const result = await client.query(query, params);
  return result.rows;
};

/**
 * Counts total tags matching filter.
 */
export const countTags = async ({
  parentId = undefined,
  search = null,
  client = pool,
} = {}) => {
  const conditions = [];
  const params = [];

  if (parentId !== undefined) {
    if (parentId === null || parentId === 'root') {
      conditions.push('parent_id IS NULL');
    } else {
      params.push(parentId);
      conditions.push(`parent_id = $${params.length}`);
    }
  }

  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    conditions.push(
      `(LOWER(name) LIKE $${params.length} OR LOWER(slug) LIKE $${params.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM topic_tags ${whereClause}`,
    params
  );
  return result.rows[0]?.count || 0;
};

/**
 * Updates a tag by ID.
 */
export const updateTag = async (id, fields, client = pool) => {
  const assignments = [];
  const params = [];

  const allowedFields = ['name', 'slug', 'parent_id', 'description'];

  for (const field of allowedFields) {
    if (fields[field] !== undefined) {
      params.push(fields[field]);
      assignments.push(`${field} = $${params.length}`);
    }
  }

  if (assignments.length === 0) {
    return findTagById(id, client);
  }

  params.push(id);
  const query = `
    UPDATE topic_tags
    SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${params.length}
    RETURNING id
  `;

  const updateResult = await client.query(query, params);
  if (updateResult.rows.length === 0) return null;

  return findTagById(id, client);
};

/**
 * Deletes a tag by ID.
 */
export const deleteTag = async (id, client = pool) => {
  const result = await client.query(
    'DELETE FROM topic_tags WHERE id = $1 RETURNING id, name, slug',
    [id]
  );
  return result.rows[0] || null;
};
