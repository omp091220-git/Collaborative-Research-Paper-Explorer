import pool from "../config/database.js";

/**
 * Creates a single persistent notification.
 */
export async function createNotification({
  userId,
  type,
  title,
  message,
  link = null,
  data = {},
}) {
  if (!userId || !type || !title || !message) {
    return null;
  }

  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, type, title, message, link, data)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, type, title, message, link, JSON.stringify(data)]
    );
    return result.rows[0];
  } catch (error) {
    console.error("Failed to create notification:", error.message);
    return null;
  }
}

/**
 * Creates multiple persistent notifications (e.g., for multiple mentions).
 */
export async function createNotifications(items) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const created = [];
  for (const item of items) {
    const res = await createNotification(item);
    if (res) created.push(res);
  }
  return created;
}

/**
 * Retrieves notifications for a given user, newest first.
 */
export async function getUserNotifications(userId, limit = 50) {
  const result = await pool.query(
    `SELECT id, user_id, type, title, message, link, data, is_read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) AS unread_count
     FROM notifications
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId]
  );

  return {
    notifications: result.rows,
    unread_count: parseInt(countResult.rows[0]?.unread_count || "0", 10),
  };
}

/**
 * Marks a notification as read.
 */
export async function markNotificationAsRead(notificationId, userId) {
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [notificationId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Marks all unread notifications for a user as read.
 */
export async function markAllNotificationsAsRead(userId) {
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = $1 AND is_read = FALSE
     RETURNING id`,
    [userId]
  );
  return result.rowCount;
}
