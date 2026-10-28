import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../services/notification.service.js";

const router = express.Router();

router.use(authenticateToken);

// GET /api/notifications
router.get("/", async (req, res, next) => {
  try {
    const data = await getUserNotifications(req.user.id);
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/notifications/read-all
router.patch("/read-all", async (req, res, next) => {
  try {
    const updatedCount = await markAllNotificationsAsRead(req.user.id);
    return res.status(200).json({
      message: "All notifications marked as read.",
      count: updatedCount,
    });
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req, res, next) => {
  try {
    const notif = await markNotificationAsRead(req.params.id, req.user.id);
    if (!notif) {
      return res.status(404).json({ error: "Notification not found." });
    }
    return res.status(200).json({
      message: "Notification marked as read.",
      notification: notif,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
