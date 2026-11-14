import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import {
  requirePaperView,
  requirePaperComment,
  paperAccessResolver,
} from "../middleware/paperAccess.js";
import {
  getPaperDiscussions,
  createDiscussionThread,
  getDiscussionThread,
  postDiscussionReply,
  updateDiscussionThread,
  deleteDiscussionMessage,
  deleteDiscussionThread,
} from "../controllers/discussion.controller.js";

const router = express.Router({ mergeParams: true });

router.use(authenticateToken);

// GET /api/papers/:paperId/discussions - List discussion threads
router.get("/", requirePaperView, getPaperDiscussions);

// POST /api/papers/:paperId/discussions - Create a new thread (requires COMMENT or higher)
router.post("/", requirePaperComment, createDiscussionThread);

// GET /api/papers/:paperId/discussions/:threadId - Get thread details & full reply history
router.get("/:threadId", requirePaperView, getDiscussionThread);

// POST /api/papers/:paperId/discussions/:threadId/messages - Post reply (requires COMMENT or higher)
router.post("/:threadId/messages", requirePaperComment, postDiscussionReply);

// PATCH /api/papers/:paperId/discussions/:threadId - Update status (e.g. resolve) or title
router.patch("/:threadId", paperAccessResolver, updateDiscussionThread);

// DELETE /api/papers/:paperId/discussions/:threadId/messages/:messageId - Delete message
router.delete("/:threadId/messages/:messageId", paperAccessResolver, deleteDiscussionMessage);

// DELETE /api/papers/:paperId/discussions/:threadId - Delete entire thread
router.delete("/:threadId", paperAccessResolver, deleteDiscussionThread);

export default router;
