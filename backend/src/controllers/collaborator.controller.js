import crypto from "node:crypto";
import pool from "../config/database.js";
import { isValidUUID } from "../middleware/paperAccess.js";
import { createNotification } from "../services/notification.service.js";

const VALID_ROLES = ["VIEW", "COMMENT", "EDIT"];

const EMAIL_REGEX = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

/**
 * GET /api/papers/:paperId/collaborators
 */
export async function getPaperCollaborators(req, res, next) {
  try {
    const paper = req.paper;
    const canManage = req.paperPermissions?.canManage;

    // Fetch paper owner info
    const ownerRes = await pool.query(
      `SELECT id, email, full_name, role FROM users WHERE id = $1`,
      [paper.uploader_id]
    );
    const owner = ownerRes.rows[0] || null;

    // Fetch existing active collaborators
    const collabRes = await pool.query(
      `SELECT c.id, c.paper_id, c.user_id, c.role, c.created_at, c.updated_at,
              u.email, u.full_name, u.role as global_role,
              inv.full_name as invited_by_name
       FROM paper_collaborators c
       JOIN users u ON c.user_id = u.id
       LEFT JOIN users inv ON c.invited_by = inv.id
       WHERE c.paper_id = $1
       ORDER BY c.created_at ASC`,
      [paper.id]
    );

    // If caller has manage rights, also return pending invitations
    let pendingInvitations = [];
    if (canManage) {
      const invRes = await pool.query(
        `SELECT id, paper_id, invited_email, role, status, expires_at, created_at
         FROM paper_invitations
         WHERE paper_id = $1 AND status = 'PENDING'
         ORDER BY created_at DESC`,
        [paper.id]
      );
      pendingInvitations = invRes.rows;
    }

    return res.status(200).json({
      paper_id: paper.id,
      my_role: req.paperRole,
      permissions: req.paperPermissions,
      owner,
      collaborators: collabRes.rows,
      pending_invitations: pendingInvitations,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/papers/:paperId/collaborators/invite
 */
export async function inviteCollaborator(req, res, next) {
  try {
    const paper = req.paper;
    const { email, role: rawRole } = req.body;

    if (!email || typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        error: "A valid email address is required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const role = typeof rawRole === "string" ? rawRole.trim().toUpperCase() : "";

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role "${rawRole}". Role must be one of: ${VALID_ROLES.join(", ")}.`,
      });
    }

    // Check if inviter is inviting themselves
    if (req.user && req.user.email && req.user.email.toLowerCase() === normalizedEmail) {
      return res.status(400).json({
        error: "You cannot invite yourself as a collaborator.",
      });
    }

    // Check if email belongs to paper owner
    const ownerRes = await pool.query(`SELECT email FROM users WHERE id = $1`, [paper.uploader_id]);
    if (
      ownerRes.rows.length > 0 &&
      ownerRes.rows[0].email.toLowerCase() === normalizedEmail
    ) {
      return res.status(400).json({
        error: "User is already the owner of this paper.",
      });
    }

    // Look up if user already exists
    const userRes = await pool.query(
      `SELECT id, email, full_name FROM users WHERE LOWER(email) = LOWER($1)`,
      [normalizedEmail]
    );
    const existingUser = userRes.rows[0] || null;

    // Check if user is already a collaborator
    if (existingUser) {
      const existingCollab = await pool.query(
        `SELECT id, role FROM paper_collaborators WHERE paper_id = $1 AND user_id = $2`,
        [paper.id, existingUser.id]
      );
      if (existingCollab.rows.length > 0) {
        return res.status(409).json({
          error: `User "${normalizedEmail}" is already a collaborator on this paper with role ${existingCollab.rows[0].role}.`,
        });
      }
    }

    // Check if an active pending invitation exists
    const existingPending = await pool.query(
      `SELECT id, role, expires_at
       FROM paper_invitations
       WHERE paper_id = $1 AND LOWER(invited_email) = LOWER($2) AND status = 'PENDING'
         AND expires_at > CURRENT_TIMESTAMP`,
      [paper.id, normalizedEmail]
    );

    if (existingPending.rows.length > 0) {
      return res.status(409).json({
        error: `A pending invitation already exists for "${normalizedEmail}".`,
        invitation_id: existingPending.rows[0].id,
      });
    }

    const token = crypto.randomBytes(32).toString("hex");

    const insertRes = await pool.query(
      `INSERT INTO paper_invitations (paper_id, invited_email, invited_by, role, status, token)
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       RETURNING id, paper_id, invited_email, invited_by, role, status, expires_at, created_at`,
      [paper.id, normalizedEmail, req.user.id, role, token]
    );

    const invitation = insertRes.rows[0];

    // If user is already registered, create an in-app notification
    if (existingUser) {
      await createNotification({
        userId: existingUser.id,
        type: "COLLABORATION_INVITE",
        title: "Collaboration Invitation",
        message: `${req.user.full_name || req.user.email} invited you to collaborate on "${paper.title}" as ${role}.`,
        link: "/dashboard",
        data: {
          paper_id: paper.id,
          invitation_id: invitation.id,
          role,
        },
      });
    }

    return res.status(201).json({
      message: `Invitation sent to ${normalizedEmail} successfully.`,
      invitation,
      registered: Boolean(existingUser),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * PATCH /api/papers/:paperId/collaborators/:userId
 */
export async function updateCollaboratorRole(req, res, next) {
  try {
    const { paperId, userId } = req.params;
    const { role: rawRole } = req.body;

    if (!isValidUUID(userId)) {
      return res.status(400).json({ error: "Invalid user ID format." });
    }

    const role = typeof rawRole === "string" ? rawRole.trim().toUpperCase() : "";
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role "${rawRole}". Role must be one of: ${VALID_ROLES.join(", ")}.`,
      });
    }

    // Owner role cannot be altered via collaborator endpoint
    if (req.paper.uploader_id === userId) {
      return res.status(400).json({
        error: "Cannot change the permissions of the paper owner.",
      });
    }

    const updateRes = await pool.query(
      `UPDATE paper_collaborators
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE paper_id = $2 AND user_id = $3
       RETURNING id, paper_id, user_id, role, updated_at`,
      [role, paperId, userId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        error: "Collaborator not found on this paper.",
      });
    }

    // Notify the updated user
    await createNotification({
      userId,
      type: "ROLE_UPDATED",
      title: "Permissions Updated",
      message: `Your permission on paper "${req.paper.title}" was updated to ${role}.`,
      link: `/papers/${paperId}`,
      data: { paper_id: paperId, role },
    });

    return res.status(200).json({
      message: "Collaborator role updated successfully.",
      collaborator: updateRes.rows[0],
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /api/papers/:paperId/collaborators/:userId
 */
export async function removeCollaborator(req, res, next) {
  try {
    const { paperId, userId } = req.params;

    if (!isValidUUID(userId)) {
      return res.status(400).json({ error: "Invalid user ID format." });
    }

    // Owner cannot be removed
    if (req.paper.uploader_id === userId) {
      return res.status(400).json({
        error: "The paper owner cannot be removed as a collaborator.",
      });
    }

    // Caller must either have manage rights OR be removing themselves
    const isSelf = req.user && req.user.id === userId;
    const canManage = req.paperPermissions?.canManage;

    if (!canManage && !isSelf) {
      return res.status(403).json({
        error: "You do not have permission to remove this collaborator.",
      });
    }

    const deleteRes = await pool.query(
      `DELETE FROM paper_collaborators WHERE paper_id = $1 AND user_id = $2 RETURNING id`,
      [paperId, userId]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({
        error: "Collaborator not found on this paper.",
      });
    }

    return res.status(200).json({
      message: isSelf
        ? "You have left the collaboration successfully."
        : "Collaborator removed successfully.",
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /api/papers/:paperId/collaborators/invitations/:invitationId
 */
export async function revokeInvitation(req, res, next) {
  try {
    const { paperId, invitationId } = req.params;

    if (!isValidUUID(invitationId)) {
      return res.status(400).json({ error: "Invalid invitation ID format." });
    }

    const updateRes = await pool.query(
      `UPDATE paper_invitations
       SET status = 'REVOKED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND paper_id = $2 AND status = 'PENDING'
       RETURNING id, invited_email, status`,
      [invitationId, paperId]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({
        error: "Pending invitation not found or already processed.",
      });
    }

    return res.status(200).json({
      message: `Invitation to "${updateRes.rows[0].invited_email}" revoked.`,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * GET /api/invitations/my-invitations
 */
export async function getMyInvitations(req, res, next) {
  try {
    const userEmail = req.user?.email;
    if (!userEmail) {
      return res.status(400).json({ error: "User email not found in token." });
    }

    const result = await pool.query(
      `SELECT i.id, i.paper_id, i.role, i.status, i.expires_at, i.created_at,
              p.title as paper_title, p.arxiv_id,
              u.full_name as inviter_name, u.email as inviter_email
       FROM paper_invitations i
       JOIN papers p ON i.paper_id = p.id
       JOIN users u ON i.invited_by = u.id
       WHERE LOWER(i.invited_email) = LOWER($1)
         AND i.status = 'PENDING'
         AND i.expires_at > CURRENT_TIMESTAMP
       ORDER BY i.created_at DESC`,
      [userEmail]
    );

    return res.status(200).json({
      invitations: result.rows,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/invitations/:invitationId/accept
 */
export async function acceptInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;

    if (!isValidUUID(invitationId)) {
      return res.status(400).json({ error: "Invalid invitation ID format." });
    }

    const invRes = await pool.query(
      `SELECT i.*, p.title as paper_title
       FROM paper_invitations i
       JOIN papers p ON i.paper_id = p.id
       WHERE i.id = $1`,
      [invitationId]
    );

    if (invRes.rows.length === 0) {
      return res.status(404).json({ error: "Invitation not found." });
    }

    const invitation = invRes.rows[0];

    // Must match the current user's email
    if (invitation.invited_email.toLowerCase() !== req.user.email?.toLowerCase()) {
      return res.status(403).json({
        error: "This invitation was sent to a different email address.",
      });
    }

    if (invitation.status !== "PENDING") {
      return res.status(400).json({
        error: `Invitation cannot be accepted because it is ${invitation.status.toLowerCase()}.`,
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({
        error: "This invitation has expired.",
      });
    }

    // Insert or update collaborator record
    await pool.query(
      `INSERT INTO paper_collaborators (paper_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (paper_id, user_id)
       DO UPDATE SET role = EXCLUDED.role, updated_at = CURRENT_TIMESTAMP`,
      [invitation.paper_id, req.user.id, invitation.role, invitation.invited_by]
    );

    // Update invitation status
    await pool.query(
      `UPDATE paper_invitations
       SET status = 'ACCEPTED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [invitationId]
    );

    // Notify the inviter
    await createNotification({
      userId: invitation.invited_by,
      type: "INVITATION_ACCEPTED",
      title: "Invitation Accepted",
      message: `${req.user.full_name || req.user.email} accepted your invitation to collaborate on "${invitation.paper_title}".`,
      link: `/papers/${invitation.paper_id}`,
      data: {
        paper_id: invitation.paper_id,
        collaborator_id: req.user.id,
        role: invitation.role,
      },
    });

    return res.status(200).json({
      message: "Invitation accepted successfully.",
      paper_id: invitation.paper_id,
      role: invitation.role,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * POST /api/invitations/:invitationId/decline
 */
export async function declineInvitation(req, res, next) {
  try {
    const { invitationId } = req.params;

    if (!isValidUUID(invitationId)) {
      return res.status(400).json({ error: "Invalid invitation ID format." });
    }

    const invRes = await pool.query(
      `SELECT * FROM paper_invitations WHERE id = $1`,
      [invitationId]
    );

    if (invRes.rows.length === 0) {
      return res.status(404).json({ error: "Invitation not found." });
    }

    const invitation = invRes.rows[0];

    if (invitation.invited_email.toLowerCase() !== req.user.email?.toLowerCase()) {
      return res.status(403).json({
        error: "This invitation was sent to a different email address.",
      });
    }

    if (invitation.status !== "PENDING") {
      return res.status(400).json({
        error: `Invitation is already ${invitation.status.toLowerCase()}.`,
      });
    }

    await pool.query(
      `UPDATE paper_invitations
       SET status = 'DECLINED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [invitationId]
    );

    return res.status(200).json({
      message: "Invitation declined successfully.",
    });
  } catch (error) {
    return next(error);
  }
}
