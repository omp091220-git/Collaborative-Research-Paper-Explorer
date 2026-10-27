/**
 * Notification Controller
 * Handles HTTP requests and responses for user notifications.
 */

import * as service from '../services/notification.service.js';
import { NotificationError } from '../services/notification.service.js';

const isValidUUID = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

const handleError = (error, res, next) => {
  if (error instanceof NotificationError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  return next(error);
};

/**
 * GET /api/notifications
 * Retrieves notifications for the currently authenticated user.
 */
export const getNotifications = async (req, res, next) => {
  try {
    const { page, limit, unread_only } = req.query;
    const result = await service.getUserNotifications({
      userId: req.user.id,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      unreadOnly: unread_only === 'true',
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
};

/**
 * GET /api/notifications/unread-count
 * Returns the unread notification count for the authenticated user.
 */
export const getUnreadCount = async (req, res, next) => {
  try {
    const unreadCount = await service.getUnreadCount(req.user.id);
    return res.status(200).json({ unread_count: unreadCount });
  } catch (error) {
    return handleError(error, res, next);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 */
export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Notification ID must be a valid UUID.' });
    }

    const notification = await service.markAsRead({
      notificationId: id,
      userId: req.user.id,
    });

    return res.status(200).json({
      message: 'Notification marked as read.',
      notification,
    });
  } catch (error) {
    return handleError(error, res, next);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marks all unread notifications as read.
 */
export const markAllAsRead = async (req, res, next) => {
  try {
    const result = await service.markAllAsRead(req.user.id);
    return res.status(200).json({
      message: 'All notifications marked as read.',
      updated_count: result.updated_count,
    });
  } catch (error) {
    return handleError(error, res, next);
  }
};

/**
 * DELETE /api/notifications/:id
 * Deletes a notification belonging to the current user.
 */
export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Notification ID must be a valid UUID.' });
    }

    await service.deleteNotification({
      notificationId: id,
      userId: req.user.id,
    });

    return res.status(200).json({
      message: 'Notification deleted successfully.',
    });
  } catch (error) {
    return handleError(error, res, next);
  }
};
