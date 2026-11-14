import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import {
  requirePaperView,
  requirePaperOwner,
  paperAccessResolver,
} from "../middleware/paperAccess.js";
import {
  getPaperCollaborators,
  inviteCollaborator,
  updateCollaboratorRole,
  removeCollaborator,
  revokeInvitation,
} from "../controllers/collaborator.controller.js";

const router = express.Router({ mergeParams: true });

// All collaborator endpoints require authentication
router.use(authenticateToken);

// GET /api/papers/:paperId/collaborators - View collaborators & user's own role
router.get("/", requirePaperView, getPaperCollaborators);

// POST /api/papers/:paperId/collaborators/invite - Invite collaborator by email
router.post("/invite", requirePaperOwner, inviteCollaborator);

// PATCH /api/papers/:paperId/collaborators/:userId - Update collaborator permissions
router.patch("/:userId", requirePaperOwner, updateCollaboratorRole);

// DELETE /api/papers/:paperId/collaborators/:userId - Remove collaborator (or self leave)
router.delete("/:userId", paperAccessResolver, removeCollaborator);

// DELETE /api/papers/:paperId/collaborators/invitations/:invitationId - Revoke pending invitation
router.delete(
  "/invitations/:invitationId",
  requirePaperOwner,
  revokeInvitation
);

export default router;
