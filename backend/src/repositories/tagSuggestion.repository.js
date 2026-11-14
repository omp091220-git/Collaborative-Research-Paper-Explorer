import pool from '../config/database.js';

/**
 * Insert a new tag suggestion.
 */
export const createSuggestion = async ({
  paperId,
  suggestedName,
  suggestedSlug,
  suggestedParentId = null,
  visibilityPreference = 'PRIVATE',
  confidence = 0.5,
  reasoning = null,
}, client = pool) => {
  const result = await client.query(
    `INSERT INTO paper_tag_suggestions (
       paper_id, suggested_name, suggested_slug, suggested_parent_id,
       visibility_preference, confidence, reasoning
     ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      paperId,
      suggestedName,
      suggestedSlug,
      suggestedParentId,
      visibilityPreference,
      confidence,
      reasoning,
    ]
  );
  return result.rows[0];
};

/**
 * Find a suggestion by its id.
 */
export const findSuggestionById = async (id, client = pool) => {
  const result = await client.query(
    `SELECT * FROM paper_tag_suggestions WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * List suggestions for a paper, optionally filtering by status.
 */
export const listSuggestions = async (paperId, status = null, client = pool) => {
  let query = `SELECT * FROM paper_tag_suggestions WHERE paper_id = $1`;
  const params = [paperId];
  if (status) {
    query += ` AND status = $2`;
    params.push(status);
  }
  const result = await client.query(query, params);
  return result.rows;
};

/**
 * Update a suggestion (e.g., accept/reject, add description).
 */
export const updateSuggestion = async (id, updates, client = pool) => {
  const fields = [];
  const params = [];
  let idx = 1;
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = $${idx}`);
    params.push(value);
    idx++;
  }
  params.push(id);
  const query = `UPDATE paper_tag_suggestions SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx} RETURNING *`;
  const result = await client.query(query, params);
  return result.rows[0] || null;
};
