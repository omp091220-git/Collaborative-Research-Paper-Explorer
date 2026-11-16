import pool from '../config/database.js';

/**
 * Search users by name (case-insensitive ILIKE).
 * NEVER returns email or password_hash — privacy rule (FR-38).
 */
export const searchUsersByName = async (query, limit = 20) => {
  const result = await pool.query(
    `SELECT id, full_name, role, affiliation, research_interests
     FROM users
     WHERE full_name ILIKE $1
     ORDER BY full_name ASC
     LIMIT $2`,
    [`%${query}%`, limit]
  );
  return result.rows;
};

/**
 * Get a single user's public profile by UUID.
 * NEVER returns email or password_hash.
 */
export const findPublicProfileById = async (userId) => {
  const result = await pool.query(
    `SELECT id, full_name, role, affiliation, research_interests
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
};

/**
 * Get publication summary counts for a user.
 * Returns: { platform_count, external_count, verified_external_count }
 */
export const findPublicationCountsByUserId = async (userId) => {
  const [platformRes, externalRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS platform_count
       FROM papers
       WHERE uploader_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT
         COUNT(*)::int AS external_count,
         COUNT(*) FILTER (WHERE is_verified = TRUE)::int AS verified_external_count
       FROM external_publications
       WHERE user_id = $1`,
      [userId]
    ),
  ]);

  return {
    platform_count: platformRes.rows[0]?.platform_count ?? 0,
    external_count: externalRes.rows[0]?.external_count ?? 0,
    verified_external_count: externalRes.rows[0]?.verified_external_count ?? 0,
  };
};

/**
 * Get recent publications for a researcher's public profile page.
 * Combines platform papers + stored external publications.
 */
export const findRecentPublicationsByUserId = async (userId, limit = 50) => {
  const result = await pool.query(
    `(
       SELECT
         id::text,
         title,
         authors,
         EXTRACT(YEAR FROM uploaded_at)::int AS publication_year,
         'platform' AS source,
         NULL AS doi,
         'Collaborative Research Platform' AS venue,
         abstract,
         NULL AS source_url,
         TRUE AS is_verified,
         uploaded_at AS discovered_at
       FROM papers
       WHERE uploader_id = $1
     )
     UNION ALL
     (
       SELECT
         id::text,
         title,
         authors,
         publication_year,
         source,
         doi,
         venue,
         abstract,
         source_url,
         is_verified,
         discovered_at
       FROM external_publications
       WHERE user_id = $1
     )
     ORDER BY discovered_at DESC NULLS LAST
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};
