import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import {
  notificationStream,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "../controllers/notification.controller.js";

const router = express.Router();

router.use(authenticateToken);

// GET /api/notifications/stream - Real-time SSE stream (FR-19)
router.get("/stream", notificationStream);

// GET /api/notifications - List notifications
router.get("/", getNotifications);

// GET /api/notifications/unread-count - Unread counter
router.get("/unread-count", getUnreadCount);

// PATCH /api/notifications/read-all - Mark all as read
router.patch("/read-all", markAllAsRead);

// PATCH /api/notifications/:id/read - Mark single as read
router.patch("/:id/read", markAsRead);

// DELETE /api/notifications/:id - Delete notification
router.delete("/:id", deleteNotification);

export default router;
