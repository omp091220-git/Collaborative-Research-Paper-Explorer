/**
 * Notification Service
 * Orchestrates event-driven notifications for mentions (FR-17), paper tag changes (FR-11),
 * paper notes (annotations), and paper metadata updates.
 * Provides real-time SSE push delivery and REST query/mutation for notifications (FR-19).
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
import { eventBus, EVENT_TYPES } from '../utils/eventBus.js';

export class NotificationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'NotificationError';
    this.statusCode = statusCode;
  }
}

// -----------------------------------------------------------------------------
// Real-Time SSE Connection Management
// -----------------------------------------------------------------------------
const activeUserStreams = new Map(); // userId -> Set<Response>

/**
 * Registers an active Server-Sent Events (SSE) connection for a user.
 *
 * @param {string} userId - Authenticated user UUID
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const subscribeUserStream = (userId, req, res) => {
  res.setHeader?.('Content-Type', 'text/event-stream');
  res.setHeader?.('Cache-Control', 'no-cache, no-transform');
  res.setHeader?.('Connection', 'keep-alive');
  res.setHeader?.('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (!activeUserStreams.has(userId)) {
    activeUserStreams.set(userId, new Set());
  }
  activeUserStreams.get(userId).add(res);

  // Send initial handshake
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      userId,
      connectedAt: new Date().toISOString(),
    })}\n\n`
  );

  // Periodic heartbeat every 25 seconds
  const heartbeatTimer = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeatTimer);
    }
  }, 25000);
  heartbeatTimer.unref();

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    const userSet = activeUserStreams.get(userId);
    if (userSet) {
      userSet.delete(res);
      if (userSet.size === 0) {
        activeUserStreams.delete(userId);
      }
    }
  });
};

/**
 * Broadcasts a notification payload in real-time to active SSE streams for a recipient.
 *
 * @param {string} userId - Recipient user UUID
 * @param {object} notification - Persisted notification object
 * @returns {number} Count of active connections delivered to
 */
export const broadcastToUser = (userId, notification) => {
  const userSet = activeUserStreams.get(userId);
  if (!userSet || userSet.size === 0) return 0;

  const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
  let sentCount = 0;
  for (const clientRes of userSet) {
    try {
      clientRes.write(payload);
      sentCount++;
    } catch {
      userSet.delete(clientRes);
    }
  }
  return sentCount;
};

/**
 * Checks count of active SSE streams for a user (useful in tests/diagnostics).
 *
 * @param {string} userId
 * @returns {number}
 */
export const getActiveConnectionCount = (userId) => {
  return activeUserStreams.get(userId)?.size || 0;
};

// -----------------------------------------------------------------------------
// Idempotency & Deduplication Cache
// -----------------------------------------------------------------------------
const processedEventIds = new Set();
const MAX_PROCESSED_EVENTS = 5000;

const markEventProcessed = (eventId) => {
  if (!eventId) return;
  if (processedEventIds.size >= MAX_PROCESSED_EVENTS) {
    const firstItem = processedEventIds.values().next().value;
    processedEventIds.delete(firstItem);
  }
  processedEventIds.add(eventId);
};

// -----------------------------------------------------------------------------
// A. Mention Notifications (FR-17 -> FR-19)
// -----------------------------------------------------------------------------
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
 * @param {object|null} [params.anchor=null] - Contextual anchor info (FR-17).
 * @param {string|null} [params.eventId=null] - Optional event UUID for deduplication.
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
    anchor = null,
    eventId = null,
  },
  client = pool
) => {
  // Check idempotency if eventId is supplied
  if (eventId && processedEventIds.has(eventId)) {
    return [];
  }

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
      anchor: anchor || null,
      event_id: eventId || null,
    },
    link: `/dashboard?paperId=${paperId}`,
  }));

  const createdRows = await notificationRepo.createNotificationsBatch(
    notifications,
    client
  );

  // Deliver real-time update via SSE
  for (const row of createdRows) {
    broadcastToUser(row.recipient_id, row);
  }

  if (eventId) {
    markEventProcessed(eventId);
  }

  return createdRows;
};

// -----------------------------------------------------------------------------
// B. Paper Tags and Stars Notifications (FR-11 -> FR-19)
// -----------------------------------------------------------------------------
/**
 * Notifies all starrers of a paper when a topic tag is added or removed.
 *
 * @param {object} params
 * @param {string} params.paperId
 * @param {{ id: string, full_name?: string }} params.actorUser
 * @param {'ADDED'|'REMOVED'|'BULK_UPDATE'} params.action
 * @param {string|null} [params.tagName=null]
 * @param {string|null} [params.tagId=null]
 * @param {string|null} [params.canonicalPath=null]
 * @param {string|null} [params.annotationId=null]
 * @param {object|null} [params.annotation=null]
 * @param {string[]} [params.addedTags=[]]
 * @param {string[]} [params.removedTags=[]]
 * @param {string|null} [params.eventId=null]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>} Created notifications.
 */
export const notifyStarrersPaperTagChange = async (
  {
    paperId,
    actorUser,
    action,
    tagName = null,
    tagId = null,
    canonicalPath = null,
    annotationId = null,
    annotation = null,
    addedTags = [],
    removedTags = [],
    eventId = null,
  },
  client = pool
) => {
  // Check idempotency
  if (eventId && processedEventIds.has(eventId)) {
    return [];
  }

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
  const isSectionTag = Boolean(annotationId || annotation);
  const pageNumber = annotation?.page_number || null;

  if (action === 'ADDED') {
    if (isSectionTag) {
      title = `Tag assigned to section in "${paperTitle}"`;
      message = `Tag "${tagName}" was assigned to section${
        pageNumber ? ` (page ${pageNumber})` : ''
      } of "${paperTitle}".`;
    } else {
      title = `Tag added to "${paperTitle}"`;
      message = `Tag "${tagName}" was added to paper "${paperTitle}".`;
    }
  } else if (action === 'REMOVED') {
    if (isSectionTag) {
      title = `Tag removed from section in "${paperTitle}"`;
      message = `Tag "${tagName}" was removed from section of "${paperTitle}".`;
    } else {
      title = `Tag removed from "${paperTitle}"`;
      message = `Tag "${tagName}" was removed from paper "${paperTitle}".`;
    }
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
    sourceId: annotationId || null,
    data: {
      action,
      tag_id: tagId || null,
      tag_name: tagName,
      canonical_path: canonicalPath || null,
      annotation_id: annotationId || null,
      page_number: pageNumber,
      coordinates: annotation
        ? {
            position_x: annotation.position_x,
            position_y: annotation.position_y,
            region_width: annotation.region_width,
            region_height: annotation.region_height,
          }
        : null,
      added_tags: addedTags,
      removed_tags: removedTags,
      event_id: eventId || null,
    },
    link: `/dashboard?paperId=${paperId}`,
  }));

  const createdRows = await notificationRepo.createNotificationsBatch(
    notifications,
    client
  );

  // Deliver real-time update via SSE
  for (const row of createdRows) {
    broadcastToUser(row.recipient_id, row);
  }

  if (eventId) {
    markEventProcessed(eventId);
  }

  return createdRows;
};

// -----------------------------------------------------------------------------
// C. Paper Note / Annotation Notifications
// -----------------------------------------------------------------------------
/**
 * Notifies starrers of a paper when a new note or annotation is added.
 * Excludes the actor and any user already mentioned in the note to avoid duplicates.
 *
 * @param {object} params
 * @param {string} params.paperId
 * @param {{ id: string, full_name?: string, email?: string }} params.actorUser
 * @param {object} params.annotation
 * @param {string|null} [params.eventId=null]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>} Created notifications
 */
export const notifyStarrersPaperNoteAdded = async (
  { paperId, actorUser, annotation, eventId = null },
  client = pool
) => {
  if (eventId && processedEventIds.has(eventId)) {
    return [];
  }

  // 1. Get starrers excluding actor
  const starrers = await paperStarRepo.getStarrersByPaper(
    paperId,
    actorUser?.id || null,
    client
  );
  if (!starrers || starrers.length === 0) return [];

  // 2. Identify mentioned users to prevent duplicate notifications
  const mentionedUsernames = extractMentions(annotation?.content || '');
  let mentionedUserIds = new Set();
  if (mentionedUsernames.length > 0) {
    const resolved = await resolveMentionedUsers(client, mentionedUsernames);
    mentionedUserIds = new Set(resolved.map((u) => u.id));
  }

  // 3. Filter out users who already receive a mention notification
  const eligibleStarrers = starrers.filter(
    (userId) => !mentionedUserIds.has(userId)
  );
  if (eligibleStarrers.length === 0) return [];

  // 4. Fetch paper title
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

  const actorName = actorUser.full_name || actorUser.email || 'A researcher';
  const snippet = formatSnippet(annotation.content || '');
  const pageNumber = annotation.page_number || null;

  const notifications = eligibleStarrers.map((recipientId) => ({
    recipientId,
    actorId: actorUser?.id || null,
    type: 'PAPER_NOTE_ADDED',
    title: `New note on "${paperTitle}"`,
    message: `${actorName} added a note${
      pageNumber ? ` on page ${pageNumber}` : ''
    } of "${paperTitle}": "${snippet}"`,
    paperId,
    sourceType: 'annotation',
    sourceId: annotation.id,
    data: {
      page_number: pageNumber,
      snippet,
      coordinates: {
        position_x: annotation.position_x,
        position_y: annotation.position_y,
        region_width: annotation.region_width,
        region_height: annotation.region_height,
      },
      event_id: eventId || null,
    },
    link: `/dashboard?paperId=${paperId}`,
  }));

  const createdRows = await notificationRepo.createNotificationsBatch(
    notifications,
    client
  );

  for (const row of createdRows) {
    broadcastToUser(row.recipient_id, row);
  }

  if (eventId) {
    markEventProcessed(eventId);
  }

  return createdRows;
};

// -----------------------------------------------------------------------------
// D. Paper Metadata Change Notifications
// -----------------------------------------------------------------------------
/**
 * Notifies all starrers when meaningful paper metadata (title, abstract, authors) is modified.
 *
 * @param {object} params
 * @param {string} params.paperId
 * @param {{ id: string, full_name?: string }} params.actorUser
 * @param {string[]} params.changedFields - List of fields that actually changed
 * @param {object} params.oldPaper
 * @param {object} params.newPaper
 * @param {string|null} [params.eventId=null]
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>} Created notifications.
 */
export const notifyStarrersMetadataChange = async (
  { paperId, actorUser, changedFields, oldPaper, newPaper, eventId = null },
  client = pool
) => {
  if (eventId && processedEventIds.has(eventId)) {
    return [];
  }

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
      event_id: eventId || null,
    },
    link: `/dashboard?paperId=${paperId}`,
  }));

  const createdRows = await notificationRepo.createNotificationsBatch(
    notifications,
    client
  );

  for (const row of createdRows) {
    broadcastToUser(row.recipient_id, row);
  }

  if (eventId) {
    markEventProcessed(eventId);
  }

  return createdRows;
};

// -----------------------------------------------------------------------------
// E. Event Consumer & Standard Event Handlers
// -----------------------------------------------------------------------------
/**
 * Processes an event according to the standard event contract.
 *
 * @param {object} event
 * @param {import('pg').Pool|import('pg').PoolClient} [client]
 * @returns {Promise<object[]>}
 */
export const processEvent = async (event, client = pool) => {
  if (!event || !event.eventType) {
    throw new NotificationError('Invalid event envelope: eventType required.', 400);
  }

  const { eventId, eventType, actor, paper, payload } = event;

  switch (eventType) {
    case EVENT_TYPES.MENTION_CREATED:
      return notifyMentions(
        {
          text: payload.text,
          oldText: payload.oldText || null,
          actorUser: actor,
          paperId: paper?.id,
          sourceType: payload.sourceType,
          sourceId: payload.sourceId,
          pageNumber: payload.pageNumber || null,
          anchor: payload.anchor || null,
          eventId,
        },
        client
      );

    case EVENT_TYPES.TAG_ASSIGNED:
    case EVENT_TYPES.TAG_REMOVED:
    case EVENT_TYPES.TAG_BULK_UPDATED:
      return notifyStarrersPaperTagChange(
        {
          paperId: paper?.id,
          actorUser: actor,
          action: payload.action,
          tagName: payload.tagName,
          tagId: payload.tagId,
          canonicalPath: payload.canonicalPath,
          annotationId: payload.annotationId,
          annotation: payload.annotation,
          addedTags: payload.addedTags || [],
          removedTags: payload.removedTags || [],
          eventId,
        },
        client
      );

    case EVENT_TYPES.PAPER_NOTE_ADDED:
      return notifyStarrersPaperNoteAdded(
        {
          paperId: paper?.id,
          actorUser: actor,
          annotation: payload.annotation,
          eventId,
        },
        client
      );

    case EVENT_TYPES.PAPER_METADATA_UPDATED:
      return notifyStarrersMetadataChange(
        {
          paperId: paper?.id,
          actorUser: actor,
          changedFields: payload.changedFields,
          oldPaper: payload.oldPaper || {},
          newPaper: payload.newPaper || {},
          eventId,
        },
        client
      );

    default:
      return [];
  }
};

// Subscribe to eventBus channels
eventBus.subscribe(EVENT_TYPES.MENTION_CREATED, (event) => {
  processEvent(event).catch((err) =>
    console.error('[EventBus] Failed to process MENTION_CREATED:', err.message)
  );
});

eventBus.subscribe(EVENT_TYPES.TAG_ASSIGNED, (event) => {
  processEvent(event).catch((err) =>
    console.error('[EventBus] Failed to process TAG_ASSIGNED:', err.message)
  );
});

eventBus.subscribe(EVENT_TYPES.TAG_REMOVED, (event) => {
  processEvent(event).catch((err) =>
    console.error('[EventBus] Failed to process TAG_REMOVED:', err.message)
  );
});

eventBus.subscribe(EVENT_TYPES.TAG_BULK_UPDATED, (event) => {
  processEvent(event).catch((err) =>
    console.error('[EventBus] Failed to process TAG_BULK_UPDATED:', err.message)
  );
});

eventBus.subscribe(EVENT_TYPES.PAPER_NOTE_ADDED, (event) => {
  processEvent(event).catch((err) =>
    console.error('[EventBus] Failed to process PAPER_NOTE_ADDED:', err.message)
  );
});

eventBus.subscribe(EVENT_TYPES.PAPER_METADATA_UPDATED, (event) => {
  processEvent(event).catch((err) =>
    console.error('[EventBus] Failed to process PAPER_METADATA_UPDATED:', err.message)
  );
});

// -----------------------------------------------------------------------------
// F. Notification REST Queries & Mutations
// -----------------------------------------------------------------------------
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
