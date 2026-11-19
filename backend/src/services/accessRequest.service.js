/**
 * accessRequest.service.js
 *
 * Business logic for paper access requests, permission upgrades,
 * approvals, rejections, cancellations, and notifications.
 */

import pool from '../config/database.js';
import * as accessRequestRepo from '../repositories/accessRequest.repository.js';
import * as paperAuditRepo from '../repositories/paperAudit.repository.js';
import { createNotification, broadcastToUser } from './notification.service.js';
import { resolveEffectivePaperPermission } from './paperPermission.service.js';
import { ROLES, normalizeRole } from '../utils/roles.js';

export class AccessRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AccessRequestError';
    this.statusCode = statusCode;
  }
}

const VALID_PERMISSIONS = ['VIEW', 'ANNOTATE', 'EDIT'];

/**
 * Helper to dispatch notification and broadcast via SSE
 */
async function dispatchNotification(params, client = pool) {
  try {
    const notif = await createNotification(params, client);
    if (notif && params.recipientId) {
      broadcastToUser(params.recipientId, notif);
    }
    return notif;
  } catch (err) {
    console.error('[Notification] Failed to send notification:', err.message);
    return null;
  }
}

/**
 * Submit an access request for a paper.
 *
 * @param {object} params
 * @param {string} params.paperId
 * @param {string} params.requestedPermission - 'VIEW' | 'ANNOTATE' | 'EDIT'
 * @param {string|null} [params.reason]
 * @param {object} params.user - Authenticated user submitting request
 */
export async function submitAccessRequest({ paperId, requestedPermission, reason = null, user }) {
  const perm = requestedPermission?.toUpperCase();
  if (!VALID_PERMISSIONS.includes(perm)) {
    throw new AccessRequestError(
      `Invalid requested permission "${requestedPermission}". Must be one of: ${VALID_PERMISSIONS.join(', ')}.`,
      400
    );
  }

  // 1. Fetch paper and verify existence
  const paperRes = await pool.query(
    `SELECT id, title, uploader_id, visibility, is_archived FROM papers WHERE id = $1`,
    [paperId]
  );
  if (paperRes.rows.length === 0) {
    throw new AccessRequestError('Paper not found.', 404);
  }
  const paper = paperRes.rows[0];

  // 2. Prevent requesting access on archived papers
  if (paper.is_archived) {
    throw new AccessRequestError('Cannot request access on an archived paper.', 400);
  }

  // 3. Prevent owner from requesting access to their own paper
  if (paper.uploader_id === user.id) {
    throw new AccessRequestError('You are the owner of this paper and cannot request access.', 400);
  }

  // 4. Students can only request VIEW (they cannot annotate or edit per platform policy)
  const userRole = normalizeRole(user.role);
  if (userRole === ROLES.STUDENT && perm !== 'VIEW') {
    throw new AccessRequestError(
      'Student accounts have read-only access and cannot request ANNOTATE or EDIT permissions.',
      403
    );
  }

  // 5. Check if user already has this or higher permission
  const { effectivePermission } = await resolveEffectivePaperPermission(paperId, user);
  if (effectivePermission) {
    const rank = { VIEW: 1, ANNOTATE: 2, COMMENT: 2, EDIT: 3, OWNER: 4 };
    const currentRank = rank[effectivePermission] || 0;
    const requestedRank = rank[perm] || 0;

    if (currentRank >= requestedRank) {
      throw new AccessRequestError(
        `You already have "${effectivePermission}" permission, which includes or exceeds "${perm}".`,
        400
      );
    }
  }

  // 6. Check for existing active pending request for same permission
  const existingPending = await accessRequestRepo.findPendingRequest({
    paperId,
    requesterId: user.id,
    requestedPermission: perm,
  });

  if (existingPending) {
    throw new AccessRequestError(
      `You already have an active pending request for ${perm} access on this paper.`,
      409
    );
  }

  // 7. Insert the request
  const request = await accessRequestRepo.createAccessRequest({
    paperId,
    requesterId: user.id,
    ownerId: paper.uploader_id,
    requestedPermission: perm,
    reason: reason?.trim() || null,
  });

  // 8. Log audit event
  await paperAuditRepo.logAuditEvent({
    paperId,
    actorId: user.id,
    eventType: paperAuditRepo.AUDIT_EVENTS.ACCESS_REQUESTED,
    eventData: {
      requestId: request.id,
      requestedPermission: perm,
      reason: reason?.trim() || null,
    },
  });

  // 9. Notify paper owner
  const requesterName = user.full_name || user.email || 'A researcher';
  await dispatchNotification({
    recipientId: paper.uploader_id,
    actorId: user.id,
    type: 'ACCESS_REQUEST',
    title: 'New Access Request',
    message: `${requesterName} requested ${perm} access to your paper "${paper.title}".`,
    paperId,
    sourceType: 'access_request',
    sourceId: request.id,
    link: `/papers/${paperId}?tab=access`,
    data: {
      request_id: request.id,
      paper_id: paperId,
      requested_permission: perm,
      reason: reason?.trim() || null,
      requester_name: requesterName,
    },
  });

  return request;
}

/**
 * Approve an access request transactionally.
 * Creates or updates collaborator record in PostgreSQL.
 *
 * @param {object} params
 * @param {string} params.requestId
 * @param {object} params.user - Owner or System Admin approving
 */
export async function approveAccessRequest({ requestId, user }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch request with lock
    const reqRes = await client.query(
      `SELECT r.*, p.title as paper_title, p.uploader_id
       FROM paper_access_requests r
       JOIN papers p ON p.id = r.paper_id
       WHERE r.id = $1 FOR UPDATE`,
      [requestId]
    );

    if (reqRes.rows.length === 0) {
      throw new AccessRequestError('Access request not found.', 404);
    }

    const request = reqRes.rows[0];

    // 2. State validation
    if (request.status !== 'PENDING') {
      throw new AccessRequestError(
        `This request cannot be approved because it is already ${request.status}.`,
        400
      );
    }

    // 3. Authorization: Only paper owner or SYSTEM_ADMIN can approve
    const userRole = normalizeRole(user.role);
    const isSysAdmin = userRole === ROLES.SYSTEM_ADMIN;
    const isOwner = request.owner_id === user.id;

    if (!isSysAdmin && !isOwner) {
      throw new AccessRequestError(
        'You do not have permission to approve access requests for this paper.',
        403
      );
    }

    // 4. Update request status to APPROVED
    await client.query(
      `UPDATE paper_access_requests
       SET status = 'APPROVED',
           decided_by = $1,
           decided_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [user.id, requestId]
    );

    // 5. Grant/upsert collaborator permission in PostgreSQL
    // Notice role column constraint accepts 'VIEW', 'COMMENT', 'EDIT'
    // Map ANNOTATE to COMMENT for backward compatibility in role column, and store ANNOTATE in permission
    const legacyRole = request.requested_permission === 'ANNOTATE' ? 'COMMENT' : request.requested_permission;
    const permissionVal = request.requested_permission;

    await client.query(
      `INSERT INTO paper_collaborators (paper_id, user_id, role, permission, invited_by, granted_by, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, 'ACTIVE', CURRENT_TIMESTAMP)
       ON CONFLICT (paper_id, user_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         permission = EXCLUDED.permission,
         granted_by = EXCLUDED.granted_by,
         status = 'ACTIVE',
         updated_at = CURRENT_TIMESTAMP`,
      [request.paper_id, request.requester_id, legacyRole, permissionVal, user.id]
    );

    // 6. Log audit event
    await paperAuditRepo.logAuditEvent(
      {
        paperId: request.paper_id,
        actorId: user.id,
        eventType: paperAuditRepo.AUDIT_EVENTS.REQUEST_APPROVED,
        eventData: {
          requestId,
          requesterId: request.requester_id,
          grantedPermission: request.requested_permission,
        },
      },
      client
    );

    await client.query('COMMIT');

    // 7. Notify requester of approval (outside transaction)
    const approverName = user.full_name || 'The paper owner';
    await dispatchNotification({
      recipientId: request.requester_id,
      actorId: user.id,
      type: 'ACCESS_REQUEST_APPROVED',
      title: 'Access Request Approved',
      message: `${approverName} approved your request for ${request.requested_permission} access to "${request.paper_title}".`,
      paperId: request.paper_id,
      sourceType: 'access_request',
      sourceId: requestId,
      link: `/papers/${request.paper_id}`,
      data: {
        request_id: requestId,
        paper_id: request.paper_id,
        permission: request.requested_permission,
      },
    });

    return {
      message: `Access request approved. ${request.requested_permission} permission granted.`,
      request: { ...request, status: 'APPROVED' },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reject an access request.
 *
 * @param {object} params
 * @param {string} params.requestId
 * @param {string|null} [params.rejectionReason]
 * @param {object} params.user - Owner or Admin rejecting
 */
export async function rejectAccessRequest({ requestId, rejectionReason = null, user }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const reqRes = await client.query(
      `SELECT r.*, p.title as paper_title
       FROM paper_access_requests r
       JOIN papers p ON p.id = r.paper_id
       WHERE r.id = $1 FOR UPDATE`,
      [requestId]
    );

    if (reqRes.rows.length === 0) {
      throw new AccessRequestError('Access request not found.', 404);
    }

    const request = reqRes.rows[0];

    if (request.status !== 'PENDING') {
      throw new AccessRequestError(
        `This request cannot be rejected because it is already ${request.status}.`,
        400
      );
    }

    const userRole = normalizeRole(user.role);
    const isSysAdmin = userRole === ROLES.SYSTEM_ADMIN;
    const isOwner = request.owner_id === user.id;

    if (!isSysAdmin && !isOwner) {
      throw new AccessRequestError(
        'You do not have permission to reject access requests for this paper.',
        403
      );
    }

    await client.query(
      `UPDATE paper_access_requests
       SET status = 'REJECTED',
           decided_by = $1,
           rejection_reason = $2,
           decided_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [user.id, rejectionReason?.trim() || null, requestId]
    );

    await paperAuditRepo.logAuditEvent(
      {
        paperId: request.paper_id,
        actorId: user.id,
        eventType: paperAuditRepo.AUDIT_EVENTS.REQUEST_REJECTED,
        eventData: {
          requestId,
          requesterId: request.requester_id,
          requestedPermission: request.requested_permission,
          rejectionReason: rejectionReason?.trim() || null,
        },
      },
      client
    );

    await client.query('COMMIT');

    // Notify requester
    const rejecterName = user.full_name || 'The paper owner';
    const reasonMsg = rejectionReason?.trim() ? ` Reason: "${rejectionReason.trim()}"` : '';
    await dispatchNotification({
      recipientId: request.requester_id,
      actorId: user.id,
      type: 'ACCESS_REQUEST_REJECTED',
      title: 'Access Request Rejected',
      message: `${rejecterName} declined your request for ${request.requested_permission} access to "${request.paper_title}".${reasonMsg}`,
      paperId: request.paper_id,
      sourceType: 'access_request',
      sourceId: requestId,
      link: `/papers/${request.paper_id}`,
      data: {
        request_id: requestId,
        paper_id: request.paper_id,
        permission: request.requested_permission,
        rejection_reason: rejectionReason?.trim() || null,
      },
    });

    return {
      message: 'Access request rejected.',
      request: { ...request, status: 'REJECTED', rejection_reason: rejectionReason || null },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Cancel an access request (requester only).
 *
 * @param {object} params
 * @param {string} params.requestId
 * @param {object} params.user
 */
export async function cancelAccessRequest({ requestId, user }) {
  const request = await accessRequestRepo.findAccessRequestById(requestId);
  if (!request) {
    throw new AccessRequestError('Access request not found.', 404);
  }

  // Only the requester can cancel
  if (request.requester_id !== user.id) {
    throw new AccessRequestError('You can only cancel your own access requests.', 403);
  }

  if (request.status !== 'PENDING') {
    throw new AccessRequestError(
      `This request cannot be cancelled because it is already ${request.status}.`,
      400
    );
  }

  const updated = await accessRequestRepo.updateRequestStatus({
    id: requestId,
    status: 'CANCELLED',
    decidedBy: user.id,
  });

  await paperAuditRepo.logAuditEvent({
    paperId: request.paper_id,
    actorId: user.id,
    eventType: paperAuditRepo.AUDIT_EVENTS.REQUEST_CANCELLED,
    eventData: { requestId },
  });

  return updated;
}
