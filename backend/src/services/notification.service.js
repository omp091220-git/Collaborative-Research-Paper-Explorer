/**
 * Notification Service
 * Orchestrates event-driven notifications for mentions, paper tag changes,
 * and paper metadata updates, and provides querying/mutation for user notifications.
 */

import pool from '../config/database.js';
import * as notificationRepo from '../repositories/notification.repository.js';
import * as paperStarRepo from '../repositories/paperStar.repository.js';
import {
  extractMentions,
  computeMentionDiff,
  resolveMentionedUsers,
  formatSnippet,
} from '../utils/mentionHelper.js';

export class NotificationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'NotificationError';
    this.statusCode = statusCode;
  }
}

/**
 * Handles user mentions when content (annotations, comments) is created or updated.
 *
 * @param {object} params
 * @param {string} params.text - Current content text containing mentions.
 * @param {string|null} [params.oldText=null] - Previous content text (for edit scenarios).
 * @param {{ id: string, full_name?: string, email?: string }} params.actorUser - User creating/editing.
 * @param {string} params.paperId - UUID of the associated paper.
 * @param {string} params.sourceType - 'annotation' | 'comment'.
 * @param {string} params.sourceId - UUID of the annotation or comment.
 * @param {number|null} [params.pageNumber=null] - Page number (for annotations).
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>} Created notification rows.
 */
export const notifyMentions = async (
  {
    text,
    oldText = null,
    actorUser,
    paperId,
    sourceType,
    sourceId,
    pageNumber = null,
  },
  client = pool
) => {
  // 1. Determine target usernames
  const usernames = oldText
    ? computeMentionDiff(oldText, text)
    : extractMentions(text);

  if (!usernames || usernames.length === 0) return [];

  // 2. Resolve usernames to registered users
  const resolvedUsers = await resolveMentionedUsers(client, usernames);
  if (!resolvedUsers || resolvedUsers.length === 0) return [];

  // 3. Filter out actor self-mention and deduplicate
  const eligibleUsers = resolvedUsers.filter(
    (user) => user.id !== actorUser.id
  );
  if (eligibleUsers.length === 0) return [];

  // 4. Fetch paper title for rich message
  let paperTitle = 'a paper';
  try {
    const paperRes = await client.query(
      'SELECT title FROM papers WHERE id = $1',
      [paperId]
    );
    if (paperRes.rows[0]?.title) {
      paperTitle = paperRes.rows[0].title;
    }
  } catch {
    // Graceful fallback
  }

  const snippet = formatSnippet(text);
  const actorName = actorUser.full_name || actorUser.email || 'A user';
  const sourceLabel = sourceType === 'comment' ? 'comment' : 'annotation';

  const notifications = eligibleUsers.map((recipient) => ({
    recipientId: recipient.id,
    actorId: actorUser.id,
    type: 'MENTION',
    title: `${actorName} mentioned you in an academic ${sourceLabel}`,
    message: `${actorName} mentioned you${
      pageNumber ? ` on page ${pageNumber}` : ''
    } of "${paperTitle}": "${snippet}"`,
    paperId,
    sourceType,
    sourceId,
    data: {
      source_type: sourceType,
      page_number: pageNumber,
      snippet,
    },
    link: `/dashboard?paperId=${paperId}`,
  }));

  return notificationRepo.createNotificationsBatch(notifications, client);
};

/**
 * Notifies all starrers of a paper when a topic tag is added or removed.
 *
 * @param {object} params
 * @param {string} params.paperId
 * @param {{ id: string, full_name?: string }} params.actorUser
 * @param {'ADDED'|'REMOVED'|'BULK_UPDATE'} params.action
 * @param {string|null} [params.tagName=null]
 * @param {string[]} [params.addedTags=[]]
 * @param {string[]} [params.removedTags=[]]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>} Created notifications.
 */
export const notifyStarrersPaperTagChange = async (
  {
    paperId,
    actorUser,
    action,
    tagName = null,
    addedTags = [],
    removedTags = [],
  },
  client = pool
) => {
  // If bulk update with no net changes, do not send notifications
  if (
    action === 'BULK_UPDATE' &&
    addedTags.length === 0 &&
    removedTags.length === 0
  ) {
    return [];
  }

  // 1. Get all starrers excluding actor
  const starrers = await paperStarRepo.getStarrersByPaper(
    paperId,
    actorUser?.id || null,
    client
  );
  if (!starrers || starrers.length === 0) return [];

  // 2. Fetch paper title
  let paperTitle = 'a paper';
  try {
    const paperRes = await client.query(
      'SELECT title FROM papers WHERE id = $1',
      [paperId]
    );
    if (paperRes.rows[0]?.title) {
      paperTitle = paperRes.rows[0].title;
    }
  } catch {
    // Graceful fallback
  }

  let title = '';
  let message = '';

  if (action === 'ADDED') {
    title = `Tag added to "${paperTitle}"`;
    message = `Tag "${tagName}" was added to paper "${paperTitle}".`;
  } else if (action === 'REMOVED') {
    title = `Tag removed from "${paperTitle}"`;
    message = `Tag "${tagName}" was removed from paper "${paperTitle}".`;
  } else {
    // BULK_UPDATE
    title = `Tags updated on "${paperTitle}"`;
    const parts = [];
    if (addedTags.length > 0) parts.push(`Added: [${addedTags.join(', ')}]`);
    if (removedTags.length > 0) parts.push(`Removed: [${removedTags.join(', ')}]`);
    message = `Tags updated on "${paperTitle}": ${parts.join('; ')}.`;
  }

  const notifications = starrers.map((recipientId) => ({
    recipientId,
    actorId: actorUser?.id || null,
    type: 'PAPER_TAG_CHANGE',
    title,
    message,
    paperId,
    sourceType: 'paper_tag',
    sourceId: null,
    data: {
      action,
      tag_name: tagName,
      added_tags: addedTags,
      removed_tags: removedTags,
    },
    link: `/dashboard?paperId=${paperId}`,
  }));

  return notificationRepo.createNotificationsBatch(notifications, client);
};

/**
 * Notifies all starrers when meaningful paper metadata (title, abstract, authors) is modified.
 *
 * @param {object} params
 * @param {string} params.paperId
 * @param {{ id: string, full_name?: string }} params.actorUser
 * @param {string[]} params.changedFields - List of fields that actually changed (e.g. ['title', 'abstract'])
 * @param {object} params.oldPaper
 * @param {object} params.newPaper
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>} Created notifications.
 */
export const notifyStarrersMetadataChange = async (
  { paperId, actorUser, changedFields, oldPaper, newPaper },
  client = pool
) => {
  if (!changedFields || changedFields.length === 0) return [];

  // 1. Get all starrers excluding actor
  const starrers = await paperStarRepo.getStarrersByPaper(
    paperId,
    actorUser?.id || null,
    client
  );
  if (!starrers || starrers.length === 0) return [];

  const displayTitle = newPaper.title || oldPaper.title || 'a paper';
  const fieldList = changedFields.join(', ');

  const title = `Paper details updated: "${displayTitle}"`;
  const message = `The paper "${displayTitle}" was updated. Modified fields: ${fieldList}.`;

  const notifications = starrers.map((recipientId) => ({
    recipientId,
    actorId: actorUser?.id || null,
    type: 'PAPER_METADATA_UPDATE',
    title,
    message,
    paperId,
    sourceType: 'paper_metadata',
    sourceId: paperId,
    data: {
      changed_fields: changedFields,
    },
    link: `/dashboard?paperId=${paperId}`,
  }));

  return notificationRepo.createNotificationsBatch(notifications, client);
};

/**
 * Retrieves paginated notifications and unread summary for an authenticated user.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} [params.page=1]
 * @param {number} [params.limit=50]
 * @param {boolean} [params.unreadOnly=false]
 * @returns {Promise<object>}
 */
export const getUserNotifications = async ({
  userId,
  page = 1,
  limit = 50,
  unreadOnly = false,
}) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [notifications, total, unreadCount] = await Promise.all([
    notificationRepo.findNotificationsByUser({
      userId,
      unreadOnly,
      limit: safeLimit,
      offset,
    }),
    notificationRepo.countNotificationsByUser({ userId, unreadOnly }),
    notificationRepo.getUnreadCount(userId),
  ]);

  return {
    notifications,
    total,
    unread_count: unreadCount,
    page: safePage,
    limit: safeLimit,
    total_pages: Math.ceil(total / safeLimit) || 1,
  };
};

/**
 * Gets the total unread notifications count for a user.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export const getUnreadCount = async (userId) => {
  return notificationRepo.getUnreadCount(userId);
};

/**
 * Marks an individual notification as read.
 *
 * @param {object} params
 * @param {string} params.notificationId
 * @param {string} params.userId
 * @returns {Promise<object>}
 * @throws {NotificationError}
 */
export const markAsRead = async ({ notificationId, userId }) => {
  const updated = await notificationRepo.markAsRead(notificationId, userId);
  if (!updated) {
    throw new NotificationError('Notification not found or access denied.', 404);
  }
  return updated;
};

/**
 * Marks all unread notifications for a user as read.
 *
 * @param {string} userId
 * @returns {Promise<{ updated_count: number }>}
 */
export const markAllAsRead = async (userId) => {
  const count = await notificationRepo.markAllAsRead(userId);
  return { updated_count: count };
};

/**
 * Deletes a notification belonging to a user.
 *
 * @param {object} params
 * @param {string} params.notificationId
 * @param {string} params.userId
 * @returns {Promise<object>}
 * @throws {NotificationError}
 */
export const deleteNotification = async ({ notificationId, userId }) => {
  const deleted = await notificationRepo.deleteNotification(
    notificationId,
    userId
  );
  if (!deleted) {
    throw new NotificationError('Notification not found or access denied.', 404);
  }
  return deleted;
};
