/**
 * Notification Repository
 * Data access layer for persisting, querying, and updating in-app notifications.
 */

import pool from '../config/database.js';

/**
 * Creates a single notification record.
 *
 * @param {object} params
 * @param {string} params.recipientId
 * @param {string|null} [params.actorId]
 * @param {string} params.type
 * @param {string} params.title
 * @param {string} params.message
 * @param {string|null} [params.paperId]
 * @param {string|null} [params.sourceType]
 * @param {string|null} [params.sourceId]
 * @param {object} [params.data]
 * @param {string|null} [params.link]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object>}
 */
export const createNotification = async (
  {
    recipientId,
    actorId = null,
    type,
    title,
    message,
    paperId = null,
    sourceType = null,
    sourceId = null,
    data = {},
    link = null,
  },
  client = pool
) => {
  const query = `
    INSERT INTO notifications (
      recipient_id, actor_id, type, title, message,
      paper_id, source_type, source_id, data, link
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, recipient_id, actor_id, type, title, message,
              paper_id, source_type, source_id, data, link,
              is_read, read_at, created_at
  `;

  const values = [
    recipientId,
    actorId,
    type,
    title,
    message,
    paperId,
    sourceType,
    sourceId,
    JSON.stringify(data),
    link,
  ];

  const result = await client.query(query, values);
  return result.rows[0];
};

/**
 * Inserts multiple notifications in a single transaction/query.
 *
 * @param {Array<object>} notifications
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>}
 */
export const createNotificationsBatch = async (notifications, client = pool) => {
  if (!Array.isArray(notifications) || notifications.length === 0) return [];

  const created = [];
  for (const item of notifications) {
    const row = await createNotification(item, client);
    created.push(row);
  }
  return created;
};

/**
 * Lists notifications for a given user with pagination and optional unread filter.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {boolean} [params.unreadOnly=false]
 * @param {number} [params.limit=50]
 * @param {number} [params.offset=0]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>}
 */
export const findNotificationsByUser = async (
  { userId, unreadOnly = false, limit = 50, offset = 0 },
  client = pool
) => {
  let query = `
    SELECT n.id, n.recipient_id, n.actor_id, n.type, n.title, n.message,
           n.paper_id, n.source_type, n.source_id, n.data, n.link,
           n.is_read, n.read_at, n.created_at,
           u.full_name AS actor_name,
           u.email AS actor_email,
           p.title AS paper_title
    FROM notifications n
    LEFT JOIN users u ON u.id = n.actor_id
    LEFT JOIN papers p ON p.id = n.paper_id
    WHERE n.recipient_id = $1
  `;

  const values = [userId];

  if (unreadOnly) {
    query += ` AND n.is_read = FALSE`;
  }

  query += ` ORDER BY n.created_at DESC LIMIT $2 OFFSET $3`;
  values.push(limit, offset);

  const result = await client.query(query, values);
  return result.rows || [];
};

/**
 * Counts total notifications for a user, optionally filtering by unread status.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {boolean} [params.unreadOnly=false]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<number>}
 */
export const countNotificationsByUser = async (
  { userId, unreadOnly = false },
  client = pool
) => {
  let query = `SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_id = $1`;
  const values = [userId];

  if (unreadOnly) {
    query += ` AND is_read = FALSE`;
  }

  const result = await client.query(query, values);
  return result.rows[0]?.count || 0;
};

/**
 * Gets the count of unread notifications for a user.
 *
 * @param {string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<number>}
 */
export const getUnreadCount = async (userId, client = pool) => {
  const result = await client.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_id = $1 AND is_read = FALSE`,
    [userId]
  );
  return result.rows[0]?.count || 0;
};

/**
 * Retrieves a single notification by ID.
 *
 * @param {string} id
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
export const findNotificationById = async (id, client = pool) => {
  const result = await client.query(
    `SELECT * FROM notifications WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Marks a notification as read. Enforces recipient ownership.
 *
 * @param {string} id
 * @param {string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
export const markAsRead = async (id, userId, client = pool) => {
  const result = await client.query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND recipient_id = $2
     RETURNING *`,
    [id, userId]
  );
  return result.rows[0] || null;
};

/**
 * Marks all unread notifications for a user as read.
 *
 * @param {string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<number>} Number of marked notifications
 */
export const markAllAsRead = async (userId, client = pool) => {
  const result = await client.query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE recipient_id = $1 AND is_read = FALSE
     RETURNING id`,
    [userId]
  );
  return result.rowCount || 0;
};

/**
 * Deletes a notification belonging to a user.
 *
 * @param {string} id
 * @param {string} userId
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object|null>}
 */
export const deleteNotification = async (id, userId, client = pool) => {
  const result = await client.query(
    `DELETE FROM notifications
     WHERE id = $1 AND recipient_id = $2
     RETURNING *`,
    [id, userId]
  );
  return result.rows[0] || null;
};
