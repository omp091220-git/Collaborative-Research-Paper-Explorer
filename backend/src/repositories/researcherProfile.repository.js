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
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(r.status, 'uncertain') <> 'rejected')::int AS platform_count,
         COUNT(*) FILTER (WHERE r.status = 'confirmed')::int AS platform_verified_count,
         COUNT(*) FILTER (WHERE r.status IS NULL)::int AS platform_uncertain_count
       FROM papers p
       LEFT JOIN researcher_publication_reviews r
         ON r.user_id = p.uploader_id AND r.source = 'platform' AND r.publication_id = p.id::text
       WHERE p.uploader_id = $1`,
      [userId]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE COALESCE(r.status, 'uncertain') <> 'rejected')::int AS external_count,
         COUNT(*) FILTER (WHERE r.status = 'confirmed')::int AS verified_external_count,
         COUNT(*) FILTER (WHERE r.status IS NULL)::int AS uncertain_external_count
       FROM external_publications e
       LEFT JOIN researcher_publication_reviews r
         ON r.user_id = e.user_id AND r.source = e.source AND r.publication_id = e.external_id
       WHERE e.user_id = $1`,
      [userId]
    ),
  ]);

  return {
    platform_count: platformRes.rows[0]?.platform_count ?? 0,
    external_count: externalRes.rows[0]?.external_count ?? 0,
    verified_external_count: externalRes.rows[0]?.verified_external_count ?? 0,
    verified_count: (platformRes.rows[0]?.platform_verified_count ?? 0) + (externalRes.rows[0]?.verified_external_count ?? 0),
    uncertain_count: (platformRes.rows[0]?.platform_uncertain_count ?? 0) + (externalRes.rows[0]?.uncertain_external_count ?? 0),
    total_count: (platformRes.rows[0]?.platform_count ?? 0) + (externalRes.rows[0]?.external_count ?? 0),
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
         p.id::text,
         p.id::text AS publication_id,
         p.title,
         p.authors,
         EXTRACT(YEAR FROM p.uploaded_at)::int AS publication_year,
         'platform' AS source,
         NULL AS doi,
         'Collaborative Research Platform' AS venue,
         p.abstract,
         NULL AS source_url,
         (r.status = 'confirmed') AS is_verified,
         COALESCE(r.status, 'uncertain') AS review_status,
         p.uploaded_at AS discovered_at
       FROM papers p
       LEFT JOIN researcher_publication_reviews r
         ON r.user_id = p.uploader_id AND r.source = 'platform' AND r.publication_id = p.id::text
       WHERE p.uploader_id = $1 AND COALESCE(r.status, 'uncertain') <> 'rejected'
     )
     UNION ALL
     (
       SELECT
         e.id::text,
         e.external_id AS publication_id,
         e.title,
         e.authors,
         e.publication_year,
         e.source,
         e.doi,
         e.venue,
         e.abstract,
         e.source_url,
         (r.status = 'confirmed') AS is_verified,
         COALESCE(r.status, 'uncertain') AS review_status,
         e.discovered_at
       FROM external_publications e
       LEFT JOIN researcher_publication_reviews r
         ON r.user_id = e.user_id AND r.source = e.source AND r.publication_id = e.external_id
       WHERE e.user_id = $1 AND COALESCE(r.status, 'uncertain') <> 'rejected'
     )
     ORDER BY discovered_at DESC NULLS LAST
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
};
