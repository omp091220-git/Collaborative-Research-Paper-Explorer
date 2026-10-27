import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import * as controller from '../controllers/notification.controller.js';

const router = express.Router();

// All notification routes require an authenticated user
router.use(authenticateToken);

// List notifications for current user with optional pagination and unread filter
router.get('/', controller.getNotifications);

// Unread count endpoint
router.get('/unread-count', controller.getUnreadCount);

// Mark all notifications as read
router.patch('/read-all', controller.markAllAsRead);
router.post('/read-all', controller.markAllAsRead);

// Mark specific notification as read
router.patch('/:id/read', controller.markAsRead);
router.put('/:id/read', controller.markAsRead);

// Delete notification
router.delete('/:id', controller.deleteNotification);

export default router;
