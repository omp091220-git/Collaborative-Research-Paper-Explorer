/**
 * paperPermission.service.js
 *
 * Central service for paper-level permission resolution.
 * Used by middleware and controllers to determine what a user can do on a paper.
 *
 * Permission hierarchy (lowest to highest):
 *   VIEW < ANNOTATE < EDIT < OWNER
 *
 * Paper-level permissions differ from SYSTEM roles:
 *   - PAPER_OWNER = uploader or explicitly designated owner (paper-level)
 *   - SYSTEM_ADMIN = platform admin (system-level)
 */

import pool from '../config/database.js';
import { ROLES, normalizeRole } from '../utils/roles.js';

// Permission hierarchy for ordering / comparison
const PERMISSION_RANK = {
  VIEW: 1,
  ANNOTATE: 2,
  COMMENT: 2, // legacy alias for ANNOTATE in paper_collaborators
  EDIT: 3,
  OWNER: 4,
};

/**
 * Returns true if `actualPermission` satisfies `requiredPermission`.
 */
export function hasMinPermission(actualPermission, requiredPermission) {
  const actual = PERMISSION_RANK[actualPermission?.toUpperCase()] || 0;
  const required = PERMISSION_RANK[requiredPermission?.toUpperCase()] || 0;
  return actual >= required;
}

/**
 * Resolves a user's effective permission on a paper.
 *
 * Returns:
 *   { effectivePermission, isOwner, isSysAdmin, paper, collaborator }
 *
 * effectivePermission is one of: 'OWNER', 'EDIT', 'ANNOTATE', 'VIEW', null
 * null means no access.
 *
 * PUBLIC papers give all authenticated users implicit VIEW.
 * PRIVATE papers require explicit collaborator entry or ownership.
 */
export async function resolveEffectivePaperPermission(paperId, user, client = pool) {
  if (!paperId || !user || !user.id) {
    return { effectivePermission: null, isOwner: false, isSysAdmin: false, paper: null };
  }

  // 1. Load paper
  const paperRes = await client.query(
    `SELECT id, title, abstract, authors, arxiv_id, doi, publication_year,
            uploader_id, uploaded_at, updated_at, visibility, is_archived,
            file_size_bytes, mime_type
     FROM papers WHERE id = $1`,
    [paperId]
  );

  if (paperRes.rows.length === 0) {
    return { effectivePermission: null, isOwner: false, isSysAdmin: false, paper: null };
  }

  const paper = paperRes.rows[0];
  const userRole = normalizeRole(user.role);
  const isSysAdmin = userRole === ROLES.SYSTEM_ADMIN;
  const isOwner = paper.uploader_id === user.id;

  // 2. System admin override
  if (isSysAdmin) {
    return { effectivePermission: 'OWNER', isOwner: true, isSysAdmin: true, paper, collaborator: null };
  }

  // 3. Paper owner
  if (isOwner) {
    return { effectivePermission: 'OWNER', isOwner: true, isSysAdmin: false, paper, collaborator: null };
  }

  // 4. Check explicit collaborator entry
  const collabRes = await client.query(
    `SELECT id, permission, role, status
     FROM paper_collaborators
     WHERE paper_id = $1 AND user_id = $2`,
    [paperId, user.id]
  );

  const collaborator = collabRes.rows[0] || null;

  if (collaborator && collaborator.status !== 'REVOKED') {
    // permission column takes precedence; fall back to role (legacy)
    const rawPerm = collaborator.permission || collaborator.role;
    // Normalize COMMENT -> ANNOTATE
    let perm = rawPerm === 'COMMENT' ? 'ANNOTATE' : rawPerm?.toUpperCase() || null;
    // Students are strictly read-only and must never gain ANNOTATE or EDIT through collaborator permissions
    if (userRole === ROLES.STUDENT && perm && perm !== 'VIEW') {
      perm = 'VIEW';
    }
    return { effectivePermission: perm, isOwner: false, isSysAdmin: false, paper, collaborator };
  }

  // 5. Public papers give VIEW to all authenticated users
  if (paper.visibility === 'PUBLIC') {
    return { effectivePermission: 'VIEW', isOwner: false, isSysAdmin: false, paper, collaborator: null };
  }

  // 6. Private paper, no access
  return { effectivePermission: null, isOwner: false, isSysAdmin: false, paper, collaborator: null };
}

/**
 * Builds the permissions object from an effectivePermission value.
 */
export function buildPermissions(effectivePermission) {
  const rank = PERMISSION_RANK[effectivePermission] || 0;
  return {
    canView: rank >= PERMISSION_RANK.VIEW,
    canAnnotate: rank >= PERMISSION_RANK.ANNOTATE,
    canEdit: rank >= PERMISSION_RANK.EDIT,
    canManage: rank >= PERMISSION_RANK.OWNER,
    effectivePermission,
  };
}

/**
 * Checks whether a user can access a paper at the given minimum permission level.
 * Returns { allowed, paper, permissions } or throws if DB error.
 */
export async function checkPaperAccess(paperId, user, minPermission = 'VIEW', client = pool) {
  const { effectivePermission, isOwner, isSysAdmin, paper } =
    await resolveEffectivePaperPermission(paperId, user, client);

  if (!paper) {
    return { allowed: false, reason: 'not_found', paper: null, permissions: null };
  }

  if (!effectivePermission) {
    return {
      allowed: false,
      reason: 'no_access',
      paper,
      permissions: buildPermissions(null),
    };
  }

  const allowed = hasMinPermission(effectivePermission, minPermission);
  return {
    allowed,
    reason: allowed ? 'ok' : 'insufficient_permission',
    paper,
    permissions: buildPermissions(effectivePermission),
    isOwner,
    isSysAdmin,
  };
}
