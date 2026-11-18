/**
 * paperAudit.repository.js
 * Writes and queries paper audit/activity log entries.
 */

import pool from '../config/database.js';

export const AUDIT_EVENTS = Object.freeze({
  PAPER_UPLOADED: 'PAPER_UPLOADED',
  VISIBILITY_CHANGED: 'VISIBILITY_CHANGED',
  PAPER_ARCHIVED: 'PAPER_ARCHIVED',
  PAPER_DELETED: 'PAPER_DELETED',
  PAPER_METADATA_UPDATED: 'PAPER_METADATA_UPDATED',
  ACCESS_REQUESTED: 'ACCESS_REQUESTED',
  REQUEST_APPROVED: 'REQUEST_APPROVED',
  REQUEST_REJECTED: 'REQUEST_REJECTED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  PERMISSION_GRANTED: 'PERMISSION_GRANTED',
  PERMISSION_REVOKED: 'PERMISSION_REVOKED',
  PERMISSION_UPGRADED: 'PERMISSION_UPGRADED',
  COLLABORATOR_REMOVED: 'COLLABORATOR_REMOVED',
});

/**
 * Log a paper event.
 */
export async function logAuditEvent(
  { paperId, actorId, eventType, eventData = {} },
  client = pool
) {
  try {
    const result = await client.query(
      `INSERT INTO paper_audit_log (paper_id, actor_id, event_type, event_data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, paper_id, actor_id, event_type, event_data, created_at`,
      [paperId, actorId || null, eventType, JSON.stringify(eventData)]
    );
    return result.rows[0];
  } catch (err) {
    // Audit failures must never block primary operations
    console.error('[AuditLog] Failed to write audit event:', err.message);
    return null;
  }
}

/**
 * Fetch audit log for a paper (newest first).
 */
export async function findAuditLogByPaper(paperId, limit = 50, client = pool) {
  const result = await client.query(
    `SELECT al.id, al.paper_id, al.actor_id, al.event_type, al.event_data, al.created_at,
            u.full_name AS actor_name, u.email AS actor_email
     FROM paper_audit_log al
     LEFT JOIN users u ON u.id = al.actor_id
     WHERE al.paper_id = $1
     ORDER BY al.created_at DESC
     LIMIT $2`,
    [paperId, limit]
  );
  return result.rows;
}
