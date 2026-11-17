import pool from "../config/database.js";

/**
 * ============================================================================
 * User Account Repository
 * Feature: FR-25 - Account Type Management
 * ============================================================================
 * Encapsulates all database queries related to user account types, privacy
 * settings, and account level visibility boundaries.
 */

/**
 * Retrieves the account type and basic profile info for a specific user.
 *
 * @param {string} userId - UUID of the user.
 * @returns {Promise<{ id: string, full_name: string, email: string, role: string, account_type: string } | null>}
 */
export const getUserAccountType = async (userId) => {
  const query = `
    SELECT 
      id,
      full_name,
      email,
      role,
      account_type,
      created_at
    FROM users
    WHERE id = $1
    LIMIT 1;
  `;

  const { rows } = await pool.query(query, [userId]);
  return rows[0] || null;
};

/**
 * Updates a user's account type ('PUBLIC' or 'PRIVATE').
 *
 * @param {string} userId - UUID of the user.
 * @param {'PUBLIC' | 'PRIVATE'} accountType - Target account type.
 * @returns {Promise<{ id: string, email: string, account_type: string, updated_at?: Date } | null>}
 */
export const updateUserAccountType = async (userId, accountType) => {
  const query = `
    UPDATE users
    SET account_type = $2
    WHERE id = $1
    RETURNING id, full_name, email, role, account_type;
  `;

  const { rows } = await pool.query(query, [userId, accountType]);
  return rows[0] || null;
};

/**
 * Checks whether an account exists and is strictly PRIVATE.
 *
 * @param {string} userId - UUID of the user.
 * @returns {Promise<boolean>} - True if user has account_type === 'PRIVATE'.
 */
export const isUserAccountPrivate = async (userId) => {
  const query = `
    SELECT account_type
    FROM users
    WHERE id = $1
    LIMIT 1;
  `;

  const { rows } = await pool.query(query, [userId]);
  if (!rows[0]) {
    return false;
  }
  return rows[0].account_type === "PRIVATE";
};
