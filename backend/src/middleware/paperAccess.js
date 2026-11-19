import pool from "../config/database.js";
import { ROLES, normalizeRole } from "../utils/roles.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUUID = (val) => typeof val === "string" && UUID_REGEX.test(val);

/**
 * Resolves paper access permissions for the current user.
 *
 * Permission hierarchy:
 *   VIEW < ANNOTATE (COMMENT) < EDIT < OWNER
 *
 * For PUBLIC papers:
 *   - Any authenticated user has at least VIEW permission.
 *   - Annotate/Edit requires explicit collaborator role or ownership.
 *
 * For PRIVATE papers:
 *   - Only owner, SYSTEM_ADMIN, or active collaborators can access.
 *   - Unauthorized users receive 403 forbidden.
 */
export async function resolvePaperPermission(paperId, user) {
  if (!isValidUUID(paperId)) {
    return { status: 400, error: "Invalid paper ID format. Must be a valid UUID." };
  }

  const paperRes = await pool.query(
    `SELECT p.id, p.title, p.abstract, p.authors, p.arxiv_id, p.uploader_id,
            p.visibility, p.is_archived, p.file_path, p.file_size_bytes, p.mime_type,
            p.uploaded_at AS created_at, p.updated_at,
            u.full_name AS owner_name, u.email AS owner_email
     FROM papers p
     JOIN users u ON u.id = p.uploader_id
     WHERE p.id = $1`,
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
      permission: "OWNER",
      permissions: {
        canView: true,
        canComment: true,
        canAnnotate: true,
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
      permission: null,
      error: "Authentication required to access paper.",
    };
  }

  // Check collaborator table (ignoring revoked)
  const collabRes = await pool.query(
    `SELECT role, permission, status
     FROM paper_collaborators
     WHERE paper_id = $1 AND user_id = $2`,
    [paperId, user.id]
  );

  const collabRow = collabRes.rows[0] || null;

  if (collabRow && collabRow.status !== 'REVOKED') {
    const rawRole = (collabRow.permission || collabRow.role || '').toUpperCase();
    const isAnnotate = rawRole === 'COMMENT' || rawRole === 'ANNOTATE';
    const isEdit = rawRole === 'EDIT';

    // Students are strictly read-only and must never gain ANNOTATE, COMMENT or EDIT
    const isStudentUser = userRole === ROLES.STUDENT;

    return {
      status: 200,
      paper,
      role: isStudentUser ? 'VIEW' : rawRole,
      permission: isStudentUser ? 'VIEW' : (isAnnotate ? 'ANNOTATE' : rawRole),
      permissions: {
        canView: true,
        canComment: !isStudentUser && (isAnnotate || isEdit),
        canAnnotate: !isStudentUser && (isAnnotate || isEdit),
        canEdit: !isStudentUser && isEdit,
        canManage: false,
      },
    };
  }

  // If paper is PUBLIC, all authenticated users have VIEW access
  if (paper.visibility === 'PUBLIC') {
    return {
      status: 200,
      paper,
      role: 'VIEW',
      permission: 'VIEW',
      permissions: {
        canView: true,
        canComment: false,
        canAnnotate: false,
        canEdit: false,
        canManage: false,
      },
    };
  }

  // Private paper and user has no active collaborator status
  return {
    status: 403,
    paper: null, // do not leak private paper details to unauthorized users
    role: null,
    permission: null,
    error: "This paper is private. You do not have permission to view it.",
  };
}

/**
 * Express middleware to resolve paper access and attach permissions to req.
 */
export const paperAccessResolver = async (req, res, next) => {
  const paperId =
    req.params.paperId || req.params.id || req.body?.paper_id || req.query?.paper_id;

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
        error: "You do not have permission to view this paper.",
      });
    }
    next();
  },
];

/**
 * Middleware: Requires ANNOTATE / COMMENT permission or higher
 */
export const requirePaperAnnotate = [
  paperAccessResolver,
  (req, res, next) => {
    if (!req.paperPermissions?.canAnnotate) {
      return res.status(403).json({
        error: "You do not have permission to annotate or comment on this paper. Please request access.",
      });
    }
    next();
  },
];

export const requirePaperComment = requirePaperAnnotate;

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
        error: "Only the paper owner or an administrator can perform this action.",
      });
    }
    next();
  },
];
