import express from "express";
import { authenticateToken } from "../middleware/authenticate.js";
import {
  getMyInvitations,
  acceptInvitation,
  declineInvitation,
} from "../controllers/collaborator.controller.js";

const router = express.Router();

router.use(authenticateToken);

// GET /api/invitations/my-invitations
router.get("/my-invitations", getMyInvitations);

// POST /api/invitations/:invitationId/accept
router.post("/:invitationId/accept", acceptInvitation);

// POST /api/invitations/:invitationId/decline
router.post("/:invitationId/decline", declineInvitation);

export default router;
