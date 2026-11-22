import crypto from "node:crypto";
import pool from "../config/database.js";

/**
 * ============================================================================
 * Post Share Repository
 * Feature: FR-29 - Share Posts & References
 * ============================================================================
 */

export const createPostShareRepository = (db = pool) => {
  return {
    /**
     * Finds a post by its UUID with author and optional linked paper details.
     */
    async findPostById(postId, client = db) {
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
          COALESCE(p.share_count, 0) AS share_count,
          p.share_token,
          p.shared_post_id,
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
      const { rows } = await client.query(query, [postId]);
      return rows[0] || null;
    },

    /**
     * Finds a post by its unique share_token.
     */
    async findPostByShareToken(token, client = db) {
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
          COALESCE(p.share_count, 0) AS share_count,
          p.share_token,
          p.shared_post_id,
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
        WHERE p.share_token = $1
        LIMIT 1;
      `;
      const { rows } = await client.query(query, [token]);
      return rows[0] || null;
    },

    /**
     * Ensures a post has a unique share_token, generating one if not present.
     */
    async ensureShareToken(postId, client = db) {
      // First check existing token
      const existingRes = await client.query(
        "SELECT share_token FROM posts WHERE id = $1",
        [postId]
      );
      if (existingRes.rows[0]?.share_token) {
        return existingRes.rows[0].share_token;
      }

      // Generate a clean, unguessable, URL-safe 24-character token
      const token = "s_" + crypto.randomBytes(12).toString("hex");
      const updateRes = await client.query(
        `UPDATE posts 
         SET share_token = $1 
         WHERE id = $2 
         RETURNING share_token`,
        [token, postId]
      );
      return updateRes.rows[0]?.share_token || token;
    },

    /**
     * Atomically increments the share count on a post.
     */
    async incrementShareCount(postId, client = db) {
      const query = `
        UPDATE posts 
        SET share_count = COALESCE(share_count, 0) + 1 
        WHERE id = $1 
        RETURNING share_count;
      `;
      const { rows } = await client.query(query, [postId]);
      return rows[0]?.share_count || 0;
    },

    /**
     * Records an audit event for sharing (link copy or in-platform share).
     */
    async recordShare({ postId, userId = null, shareType = "LINK", commentary = null }, client = db) {
      const query = `
        INSERT INTO post_shares (
          post_id,
          user_id,
          share_type,
          commentary
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id, post_id, user_id, share_type, commentary, created_at;
      `;
      const values = [postId, userId, shareType, commentary];
      const { rows } = await client.query(query, values);
      return rows[0];
    },

    /** Atomically updates the counter and writes its matching audit event. */
    async recordShareAndIncrement(
      { postId, userId = null, shareType = "LINK", commentary = null },
      client = db
    ) {
      const query = `
        WITH updated AS (
          UPDATE posts
          SET share_count = COALESCE(share_count, 0) + 1
          WHERE id = $1
          RETURNING share_count
        ), recorded AS (
          INSERT INTO post_shares (post_id, user_id, share_type, commentary)
          SELECT $1, $2, $3, $4
          FROM updated
          RETURNING id
        )
        SELECT updated.share_count
        FROM updated
        CROSS JOIN recorded;
      `;
      const { rows } = await client.query(query, [postId, userId, shareType, commentary]);
      if (!rows[0]) {
        throw new Error("Could not record share for a post that no longer exists.");
      }
      return rows[0].share_count;
    },

    /**
     * Creates an in-platform share post by reference.
     * The new post stores the sharer's commentary in content and sets shared_post_id.
     * Does NOT copy private or original content into the new post.
     */
    async createInPlatformSharePost({
      authorId,
      sharedPostId,
      title = null,
      content,
      visibility = "PUBLIC",
      tags = [],
      paperId = null,
    }, client = db) {
      const query = `
        INSERT INTO posts (
          author_id,
          shared_post_id,
          title,
          content,
          visibility,
          tags,
          paper_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING 
          id,
          author_id,
          shared_post_id,
          paper_id,
          title,
          content,
          visibility,
          tags,
          like_count,
          comment_count,
          COALESCE(share_count, 0) AS share_count,
          share_token,
          created_at,
          updated_at;
      `;
      const values = [
        authorId,
        sharedPostId,
        title || "Shared Post",
        content,
        visibility,
        tags,
        paperId,
      ];
      const { rows } = await client.query(query, values);
      return rows[0];
    },

    /**
     * Checks if a user has explicit permissions on a post (FR-30 compatibility).
     */
    async checkUserPermission(postId, userId, client = db) {
      const query = `
        SELECT permission_level 
        FROM post_permissions 
        WHERE post_id = $1 AND user_id = $2
        LIMIT 1;
      `;
      const { rows } = await client.query(query, [postId, userId]);
      return rows[0]?.permission_level || null;
    },

    /**
     * Retrieves share count and recent shares for a post.
     */
    async getShareMetrics(postId, client = db) {
      const query = `
        SELECT 
          COUNT(*)::int AS total_shares,
          COUNT(*) FILTER (WHERE share_type = 'LINK')::int AS link_shares,
          COUNT(*) FILTER (WHERE share_type = 'PLATFORM')::int AS platform_shares
        FROM post_shares
        WHERE post_id = $1;
      `;
      const { rows } = await client.query(query, [postId]);
      return rows[0] || { total_shares: 0, link_shares: 0, platform_shares: 0 };
    },
  };
};

export default createPostShareRepository();
