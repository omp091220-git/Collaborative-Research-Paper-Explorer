/**
 * accessRequest.repository.js
 * Data-access layer for paper_access_requests.
 */

import pool from '../config/database.js';

const VALID_PERMISSIONS = ['VIEW', 'ANNOTATE', 'EDIT'];
const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REVOKED'];

const BASE_SELECT = `
  SELECT
    r.id, r.paper_id, r.requester_id, r.owner_id,
    r.requested_permission, r.reason, r.status, r.rejection_reason,
    r.decided_by, r.created_at, r.updated_at, r.decided_at,
    req.full_name AS requester_name, req.email AS requester_email,
    own.full_name AS owner_name, own.email AS owner_email,
    p.title AS paper_title, p.visibility AS paper_visibility
  FROM paper_access_requests r
  JOIN users req ON req.id = r.requester_id
  JOIN users own ON own.id = r.owner_id
  JOIN papers p ON p.id = r.paper_id
`;

/**
 * Create a new access request.
 */
export async function createAccessRequest(
  { paperId, requesterId, ownerId, requestedPermission, reason = null },
  client = pool
) {
  const result = await client.query(
    `INSERT INTO paper_access_requests
       (paper_id, requester_id, owner_id, requested_permission, reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [paperId, requesterId, ownerId, requestedPermission, reason || null]
  );
  return result.rows[0];
}

/**
 * Find an access request by ID (with joins).
 */
export async function findAccessRequestById(id, client = pool) {
  const result = await client.query(
    `${BASE_SELECT} WHERE r.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Check for a pending duplicate request.
 */
export async function findPendingRequest(
  { paperId, requesterId, requestedPermission },
  client = pool
) {
  const result = await client.query(
    `SELECT id FROM paper_access_requests
     WHERE paper_id = $1 AND requester_id = $2
       AND requested_permission = $3 AND status = 'PENDING'`,
    [paperId, requesterId, requestedPermission]
  );
  return result.rows[0] || null;
}

/**
 * List access requests submitted BY a user (my requests).
 */
export async function findRequestsByRequester(
  { requesterId, paperId = null, status = null, limit = 50, offset = 0 },
  client = pool
) {
  const values = [requesterId];
  const conditions = ['r.requester_id = $1'];

  if (paperId) {
    values.push(paperId);
    conditions.push(`r.paper_id = $${values.length}`);
  }

  if (status && VALID_STATUSES.includes(status)) {
    values.push(status);
    conditions.push(`r.status = $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await client.query(
    `SELECT COUNT(*)::int AS total FROM paper_access_requests r ${where}`,
    values
  );

  const dataResult = await client.query(
    `${BASE_SELECT} ${where} ORDER BY r.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    requests: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
  };
}

/**
 * List access requests RECEIVED by a paper owner.
 */
export async function findRequestsForOwner(
  { ownerId, paperId = null, status = null, requestedPermission = null, limit = 50, offset = 0 },
  client = pool
) {
  const values = [ownerId];
  const conditions = ['r.owner_id = $1'];

  if (paperId) {
    values.push(paperId);
    conditions.push(`r.paper_id = $${values.length}`);
  }

  if (status && VALID_STATUSES.includes(status)) {
    values.push(status);
    conditions.push(`r.status = $${values.length}`);
  }

  if (requestedPermission && VALID_PERMISSIONS.includes(requestedPermission)) {
    values.push(requestedPermission);
    conditions.push(`r.requested_permission = $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await client.query(
    `SELECT COUNT(*)::int AS total FROM paper_access_requests r ${where}`,
    values
  );

  const dataResult = await client.query(
    `${BASE_SELECT} ${where} ORDER BY r.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  return {
    requests: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
  };
}

/**
 * Update request status (APPROVED, REJECTED, CANCELLED, REVOKED).
 */
export async function updateRequestStatus(
  { id, status, decidedBy = null, rejectionReason = null },
  client = pool
) {
  const result = await client.query(
    `UPDATE paper_access_requests
     SET status = $1,
         decided_by = $2,
         rejection_reason = $3,
         decided_at = CASE WHEN $1 IN ('APPROVED','REJECTED') THEN CURRENT_TIMESTAMP ELSE decided_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING *`,
    [status, decidedBy || null, rejectionReason || null, id]
  );
  return result.rows[0] || null;
}

/**
 * Cancel all pending requests for a user on a paper (e.g., when permission is revoked).
 */
export async function cancelPendingRequestsForUser(
  { paperId, requesterId },
  client = pool
) {
  const result = await client.query(
    `UPDATE paper_access_requests
     SET status = 'REVOKED', updated_at = CURRENT_TIMESTAMP
     WHERE paper_id = $1 AND requester_id = $2 AND status = 'PENDING'
     RETURNING id`,
    [paperId, requesterId]
  );
  return result.rows;
}

/**
 * Get stats for owner dashboard (pending count per paper).
 */
export async function getPendingCountForOwner(ownerId, client = pool) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS pending_count
     FROM paper_access_requests
     WHERE owner_id = $1 AND status = 'PENDING'`,
    [ownerId]
  );
  return result.rows[0]?.pending_count || 0;
}
