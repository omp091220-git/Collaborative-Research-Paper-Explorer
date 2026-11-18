import pool from '../config/database.js';

/**
 * Saves or updates external publications for a given user.
 */
export const upsertExternalPublications = async (userId, publications = [], client = pool) => {
  if (!userId || !Array.isArray(publications) || publications.length === 0) {
    return [];
  }

  const saved = [];
  for (const pub of publications) {
    const {
      title,
      authors = [],
      publicationYear = null,
      source = 'external',
      externalId,
      doi = null,
      venue = null,
      abstract = null,
      sourceUrl = null,
      isVerified = false,
    } = pub;

    if (!externalId) continue;

    const query = `
      INSERT INTO external_publications (
        user_id, title, authors, publication_year, source, external_id,
        doi, venue, abstract, source_url, is_verified, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, source, external_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        authors = EXCLUDED.authors,
        publication_year = COALESCE(EXCLUDED.publication_year, external_publications.publication_year),
        doi = COALESCE(EXCLUDED.doi, external_publications.doi),
        venue = COALESCE(EXCLUDED.venue, external_publications.venue),
        abstract = COALESCE(EXCLUDED.abstract, external_publications.abstract),
        source_url = COALESCE(EXCLUDED.source_url, external_publications.source_url),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const res = await client.query(query, [
      userId,
      title,
      authors,
      publicationYear,
      source,
      externalId,
      doi,
      venue,
      abstract,
      sourceUrl,
      isVerified,
    ]);

    if (res.rows[0]) {
      saved.push(res.rows[0]);
    }
  }

  return saved;
};

/**
 * Retrieves all stored external publications for a user.
 */
export const findExternalPublicationsByUserId = async (userId, client = pool) => {
  const query = `
    SELECT 
      id, user_id, title, authors, publication_year, source, external_id,
      doi, venue, abstract, source_url, is_verified, discovered_at, updated_at
    FROM external_publications
    WHERE user_id = $1
    ORDER BY publication_year DESC NULLS LAST, discovered_at DESC;
  `;
  const result = await client.query(query, [userId]);
  return result.rows;
};

/**
 * Retrieves internal platform papers uploaded by user.
 */
export const findPlatformPapersByUserId = async (userId, client = pool) => {
  const query = `
    SELECT 
      id, title, authors, 
      EXTRACT(YEAR FROM uploaded_at)::int AS publication_year,
      'platform' AS source,
      id::text AS external_id,
      NULL AS doi,
      'Collaborative Research Platform' AS venue,
      abstract,
      file_path AS source_url,
      TRUE AS is_verified,
      uploaded_at AS discovered_at
    FROM papers
    WHERE uploader_id = $1
    ORDER BY uploaded_at DESC;
  `;
  const result = await client.query(query, [userId]);
  return result.rows;
};

/**
 * Finds user by ID to get profile name for query.
 */
export const findUserProfileForDiscovery = async (userId, client = pool) => {
  const result = await client.query(
    `SELECT id, full_name, email, affiliation, research_interests FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
};
