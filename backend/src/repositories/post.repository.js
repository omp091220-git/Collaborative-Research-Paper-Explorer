import pool from "../config/database.js";
import publicFeedRepository from "./publicFeed.repository.js";

/**
 * ============================================================================
 * Post Repository
 * Feature: FR-25 - Post Creation & Visibility Enforcement
 * ============================================================================
 * Handles persistent storage, retrieval, filtering, and authorization lookups
 * for community research posts.
 */

/**
 * Inserts a new post record into the database.
 *
 * @param {Object} postData
 * @param {string} postData.authorId - UUID of the creating author.
 * @param {string} postData.title - Post title.
 * @param {string} postData.content - Post body content.
 * @param {string|null} [postData.paperId] - Optional linked research paper UUID.
 * @param {'PUBLIC' | 'PRIVATE'} [postData.visibility='PUBLIC'] - Post visibility.
 * @param {string[]} [postData.tags=[]] - Topic tags array.
 * @returns {Promise<Object>} Created post record.
 */
export const insertPost = async ({
  authorId,
  title,
  content,
  paperId = null,
  visibility = "PUBLIC",
  tags = [],
}) => {
  const query = `
    INSERT INTO posts (
      author_id,
      title,
      content,
      paper_id,
      visibility,
      tags
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING 
      id,
      author_id,
      paper_id,
      title,
      content,
      visibility,
      tags,
      like_count,
      comment_count,
      created_at,
      updated_at;
  `;

  const values = [
    authorId,
    title,
    content,
    paperId || null,
    visibility,
    Array.isArray(tags) ? tags : [],
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
};

/**
 * Retrieves a single post by ID including author and linked paper metadata.
 *
 * @param {string} postId - UUID of the post.
 * @returns {Promise<Object|null>} Post record with author info.
 */
export const findPostById = async (postId) => {
  const query = `
    SELECT 
      p.id,
      p.author_id,
      p.paper_id,
      p.title,
      p.content,
      p.visibility,
      p.tags,
      p.like_count,
      p.comment_count,
      p.created_at,
      p.updated_at,
      u.full_name AS author_name,
      u.email AS author_email,
      u.role AS author_role,
      u.account_type AS author_account_type,
      pap.title AS paper_title
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    LEFT JOIN papers pap ON p.paper_id = pap.id
    WHERE p.id = $1
    LIMIT 1;
  `;

  const { rows } = await pool.query(query, [postId]);
  return rows[0] || null;
};

/**
 * Retrieves public feed posts (FR-26 prelude).
 * Excludes all private posts strictly at the database query level.
 *
 * @param {Object} options
 * @param {number} [options.limit=20]
 * @param {number} [options.offset=0]
 * @param {string} [options.tag]
 * @param {string} [options.paperId]
 * @returns {Promise<{ posts: Object[], total: number }>}
 */
export const findPublicPosts = options => publicFeedRepository.list(options);

/**
 * Retrieves posts created by a specific author.
 * If viewer is the author or an admin, both public and private posts are returned.
 * If viewer is another user, only PUBLIC posts are returned.
 *
 * @param {Object} options
 * @param {string} options.authorId - UUID of the author.
 * @param {string|null} [options.viewerId] - UUID of the viewing user.
 * @param {boolean} [options.canViewPrivate=false] - Whether viewer is author or admin.
 * @param {number} [options.limit=20]
 * @param {number} [options.offset=0]
 * @returns {Promise<{ posts: Object[], total: number }>}
 */
export const findPostsByAuthor = async ({
  authorId,
  canViewPrivate = false,
  limit = 20,
  offset = 0,
}) => {
  const conditions = [`p.author_id = $1`];
  const values = [authorId];

  if (!canViewPrivate) {
    conditions.push(`p.visibility = 'PUBLIC' AND u.account_type = 'PUBLIC'`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;

  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  const query = `
    SELECT 
      p.id,
      p.author_id,
      p.paper_id,
      p.title,
      p.content,
      p.visibility,
      p.tags,
      p.like_count,
      p.comment_count,
      p.created_at,
      p.updated_at,
      u.full_name AS author_name,
      u.email AS author_email,
      u.role AS author_role,
      pap.title AS paper_title
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    LEFT JOIN papers pap ON p.paper_id = pap.id
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder};
  `;

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM posts p
    INNER JOIN users u ON p.author_id = u.id
    ${whereClause};
  `;

  const [postsRes, countRes] = await Promise.all([
    pool.query(query, values),
    pool.query(countQuery, values.slice(0, values.length - 2)),
  ]);

  return {
    posts: postsRes.rows,
    total: parseInt(countRes.rows[0]?.total || 0, 10),
  };
};

/**
 * Updates an existing post record.
 *
 * @param {string} postId - UUID of the post to update.
 * @param {Object} updateFields - Fields to update.
 * @returns {Promise<Object|null>} Updated post record.
 */
export const updatePostRecord = async (postId, updateFields) => {
  const allowedFields = ["title", "content", "visibility", "tags", "paper_id"];
  const setClauses = [];
  const values = [];

  for (const [key, val] of Object.entries(updateFields)) {
    if (allowedFields.includes(key) && val !== undefined) {
      values.push(val);
      setClauses.push(`${key} = $${values.length}`);
    }
  }

  if (setClauses.length === 0) {
    return findPostById(postId);
  }

  values.push(new Date());
  setClauses.push(`updated_at = $${values.length}`);

  values.push(postId);
  const postIdPlaceholder = `$${values.length}`;

  const query = `
    UPDATE posts
    SET ${setClauses.join(", ")}
    WHERE id = ${postIdPlaceholder}
    RETURNING 
      id,
      author_id,
      paper_id,
      title,
      content,
      visibility,
      tags,
      like_count,
      comment_count,
      created_at,
      updated_at;
  `;

  const { rows } = await pool.query(query, values);
  return rows[0] || null;
};

/**
 * Deletes a post record.
 *
 * @param {string} postId - UUID of the post to delete.
 * @returns {Promise<boolean>} True if a record was deleted.
 */
export const deletePostRecord = async (postId) => {
  const query = `
    DELETE FROM posts
    WHERE id = $1
    RETURNING id;
  `;

  const { rowCount } = await pool.query(query, [postId]);
  return (rowCount || 0) > 0;
};

/**
 * Checks if a specific user has explicit permission on a private post (FR-30 foundation).
 *
 * @param {string} postId - UUID of the post.
 * @param {string} userId - UUID of the user.
 * @param {'READ' | 'WRITE'} [requiredLevel='READ']
 * @returns {Promise<boolean>}
 */
export const checkPostPermission = async (postId, userId, requiredLevel = "READ") => {
  const query = `
    SELECT permission_level
    FROM post_permissions
    WHERE post_id = $1 AND user_id = $2
    LIMIT 1;
  `;

  const { rows } = await pool.query(query, [postId, userId]);
  if (!rows[0]) return false;

  if (requiredLevel === "READ") {
    return rows[0].permission_level === "READ" || rows[0].permission_level === "WRITE";
  }

  return rows[0].permission_level === "WRITE";
};
