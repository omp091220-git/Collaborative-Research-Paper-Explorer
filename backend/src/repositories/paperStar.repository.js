/**
 * Paper Star Repository
 * Data access layer for managing paper stars / favorites and querying starrers.
 */

import pool from '../config/database.js';

/**
 * Stars a paper for a user. Idempotent via ON CONFLICT DO NOTHING.
 *
 * @param {string} userId
 * @param {string} paperId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<boolean>} True if newly starred, false if already starred.
 */
export const starPaper = async (userId, paperId, client = pool) => {
  const result = await client.query(
    `INSERT INTO paper_stars (user_id, paper_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, paper_id) DO NOTHING
     RETURNING *`,
    [userId, paperId]
  );
  return (result.rowCount || 0) > 0;
};

/**
 * Unstars a paper for a user.
 *
 * @param {string} userId
 * @param {string} paperId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<boolean>} True if removed, false if not found.
 */
export const unstarPaper = async (userId, paperId, client = pool) => {
  const result = await client.query(
    `DELETE FROM paper_stars
     WHERE user_id = $1 AND paper_id = $2
     RETURNING *`,
    [userId, paperId]
  );
  return (result.rowCount || 0) > 0;
};

/**
 * Checks whether a paper is starred by a user.
 *
 * @param {string} userId
 * @param {string} paperId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<boolean>}
 */
export const isPaperStarred = async (userId, paperId, client = pool) => {
  if (!userId || !paperId) return false;
  const result = await client.query(
    `SELECT 1 FROM paper_stars WHERE user_id = $1 AND paper_id = $2`,
    [userId, paperId]
  );
  return result.rows.length > 0;
};

/**
 * Gets the total star count for a paper.
 *
 * @param {string} paperId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<number>}
 */
export const getPaperStarCount = async (paperId, client = pool) => {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM paper_stars WHERE paper_id = $1`,
    [paperId]
  );
  return result.rows[0]?.count || 0;
};

/**
 * Gets all user IDs who have starred a paper, optionally excluding a specific user (e.g. the actor).
 *
 * @param {string} paperId
 * @param {string|null} [excludeUserId=null]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<string[]>} Array of user IDs.
 */
export const getStarrersByPaper = async (
  paperId,
  excludeUserId = null,
  client = pool
) => {
  let query = `SELECT user_id FROM paper_stars WHERE paper_id = $1`;
  const values = [paperId];

  if (excludeUserId) {
    query += ` AND user_id != $2`;
    values.push(excludeUserId);
  }

  const result = await client.query(query, values);
  return (result.rows || []).map((r) => r.user_id);
};

/**
 * Gets list of paper IDs starred by a specific user.
 *
 * @param {string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<string[]>}
 */
export const getUserStarredPaperIds = async (userId, client = pool) => {
  const result = await client.query(
    `SELECT paper_id FROM paper_stars WHERE user_id = $1`,
    [userId]
  );
  return (result.rows || []).map((r) => r.paper_id);
};
