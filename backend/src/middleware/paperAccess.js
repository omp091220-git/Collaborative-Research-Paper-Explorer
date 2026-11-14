import pool from "../config/database.js";
import { ROLES, normalizeRole } from "../utils/roles.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUUID = (val) => typeof val === "string" && UUID_REGEX.test(val);

/**
 * Resolves paper access permissions for the current user.
 */
export async function resolvePaperPermission(paperId, user) {
  if (!isValidUUID(paperId)) {
    return { status: 400, error: "Invalid paper ID format. Must be a valid UUID." };
  }

  const paperRes = await pool.query(
  `SELECT id, title, abstract, authors, arxiv_id, uploader_id,
          uploaded_at AS created_at, updated_at
   FROM papers
   WHERE id = $1`,
  [paperId]
);

  if (paperRes.rows.length === 0) {
    return { status: 404, error: "Paper not found." };
  }

  const paper = paperRes.rows[0];
  const userRole = normalizeRole(user?.role);
  const isSysAdmin = userRole === ROLES.SYSTEM_ADMIN;
  const isOwner = isSysAdmin || (user && paper.uploader_id === user.id);

  if (isOwner) {
    return {
      status: 200,
      paper,
      role: "OWNER",
      permissions: {
        canView: true,
        canComment: true,
        canEdit: true,
        canManage: true,
      },
    };
  }

  if (!user || !user.id) {
    return {
      status: 403,
      paper,
      role: null,
      error: "Authentication required to access paper collaboration.",
    };
  }

  const collabRes = await pool.query(
    `SELECT role FROM paper_collaborators WHERE paper_id = $1 AND user_id = $2`,
    [paperId, user.id]
  );

  if (collabRes.rows.length === 0) {
    return {
      status: 403,
      paper,
      role: null,
      error: "You do not have permission to access discussions or collaborator settings for this paper.",
    };
  }

  const role = collabRes.rows[0].role; // 'VIEW', 'COMMENT', or 'EDIT'
  return {
    status: 200,
    paper,
    role,
    permissions: {
      canView: true,
      canComment: role === "COMMENT" || role === "EDIT",
      canEdit: role === "EDIT",
      canManage: false,
    },
  };
}

/**
 * Express middleware to resolve paper access and attach permissions to req.
 */
export const paperAccessResolver = async (req, res, next) => {
  const paperId =
    req.params.paperId || req.params.id || req.body.paper_id || req.query.paper_id;

  if (!paperId) {
    return res.status(400).json({ error: "Paper ID is required." });
  }

  try {
    const result = await resolvePaperPermission(paperId, req.user);
    if (result.error && result.status !== 200) {
      return res.status(result.status).json({ error: result.error });
    }

    req.paper = result.paper;
    req.paperRole = result.role;
    req.paperPermissions = result.permissions;
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Middleware: Requires VIEW permission or higher
 */
export const requirePaperView = [
  paperAccessResolver,
  (req, res, next) => {
    if (!req.paperPermissions?.canView) {
      return res.status(403).json({
        error: "You do not have permission to view discussions on this paper.",
      });
    }
    next();
  },
];

/**
 * Middleware: Requires COMMENT permission or higher
 */
export const requirePaperComment = [
  paperAccessResolver,
  (req, res, next) => {
    if (!req.paperPermissions?.canComment) {
      return res.status(403).json({
        error: "You have view-only access and cannot comment or create discussions on this paper.",
      });
    }
    next();
  },
];

/**
 * Middleware: Requires EDIT permission or higher
 */
export const requirePaperEdit = [
  paperAccessResolver,
  (req, res, next) => {
    if (!req.paperPermissions?.canEdit) {
      return res.status(403).json({
        error: "You do not have edit permissions on this paper.",
      });
    }
    next();
  },
];

/**
 * Middleware: Requires OWNER (or SYSTEM_ADMIN) permission
 */
export const requirePaperOwner = [
  paperAccessResolver,
  (req, res, next) => {
    if (!req.paperPermissions?.canManage) {
      return res.status(403).json({
        error: "Only the paper owner or an administrator can manage collaborators.",
      });
    }
    next();
  },
];
