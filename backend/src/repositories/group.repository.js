import pool from '../config/database.js';

/**
 * Fetch a group by ID. Ensures conversation type is 'GROUP'.
 */
export async function findGroupById(groupId) {
  const query = `
    SELECT 
      c.id,
      c.title,
      c.description,
      c.is_private,
      c.created_by,
      c.created_at,
      c.updated_at,
      u.full_name AS creator_name,
      u.email AS creator_email
    FROM conversations c
    LEFT JOIN users u ON u.id = c.created_by
    WHERE c.id = $1 AND c.type = 'GROUP'
  `;
  const result = await pool.query(query, [groupId]);
  return result.rows[0] || null;
}

/**
 * List discoverable groups for a given user (FR-33).
 * Rules:
 *  - All public groups (is_private = false)
 *  - Private groups where the user has a participant record (joined, pending_approval, invited)
 */
export async function listDiscoverableGroups(userId, search = '') {
  let query = `
    SELECT 
      c.id,
      c.title,
      c.description,
      c.is_private,
      c.created_by,
      c.created_at,
      c.updated_at,
      creator.full_name AS creator_name,
      COALESCE(members_count.total, 0)::int AS member_count,
      my_membership.status AS membership_status,
      my_membership.role AS user_role
    FROM conversations c
    LEFT JOIN users creator ON creator.id = c.created_by
    LEFT JOIN (
      SELECT conversation_id, COUNT(*)::int AS total
      FROM conversation_participants
      WHERE status = 'joined'
      GROUP BY conversation_id
    ) members_count ON members_count.conversation_id = c.id
    LEFT JOIN conversation_participants my_membership 
      ON my_membership.conversation_id = c.id AND my_membership.user_id = $1
    WHERE c.type = 'GROUP'
      AND (
        c.is_private = FALSE 
        OR my_membership.id IS NOT NULL
      )
  `;

  const params = [userId];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    query += ` AND (LOWER(c.title) LIKE $${params.length} OR LOWER(COALESCE(c.description, '')) LIKE $${params.length})`;
  }

  query += ` ORDER BY c.updated_at DESC`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Create a new group (type = 'GROUP').
 */
export async function createGroup({ title, description = null, isPrivate = false, createdBy }) {
  const query = `
    INSERT INTO conversations (type, title, description, is_private, created_by)
    VALUES ('GROUP', $1, $2, $3, $4)
    RETURNING id, type, title, description, is_private, created_by, created_at, updated_at
  `;
  const result = await pool.query(query, [title.trim(), description ? description.trim() : null, Boolean(isPrivate), createdBy]);
  return result.rows[0];
}

/**
 * Add or update a participant in a group.
 */
export async function addParticipant(groupId, userId, role = 'member', status = 'joined') {
  const query = `
    INSERT INTO conversation_participants (conversation_id, user_id, role, status, joined_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (conversation_id, user_id) 
    DO UPDATE SET 
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      joined_at = CURRENT_TIMESTAMP
    RETURNING id, conversation_id, user_id, role, status, joined_at
  `;
  const result = await pool.query(query, [groupId, userId, role, status]);
  return result.rows[0];
}

/**
 * Find participant record for a specific user in a group.
 */
export async function findParticipant(groupId, userId) {
  const query = `
    SELECT id, conversation_id, user_id, role, status, joined_at, last_read_at
    FROM conversation_participants
    WHERE conversation_id = $1 AND user_id = $2
  `;
  const result = await pool.query(query, [groupId, userId]);
  return result.rows[0] || null;
}

/**
 * Update a participant's status (e.g. approve join request).
 */
export async function updateParticipantStatus(groupId, userId, status) {
  const query = `
    UPDATE conversation_participants
    SET status = $3, joined_at = CURRENT_TIMESTAMP
    WHERE conversation_id = $1 AND user_id = $2
    RETURNING id, conversation_id, user_id, role, status, joined_at
  `;
  const result = await pool.query(query, [groupId, userId, status]);
  return result.rows[0] || null;
}

/**
 * Remove participant from group (leave or remove).
 */
export async function removeParticipant(groupId, userId) {
  const query = `
    DELETE FROM conversation_participants
    WHERE conversation_id = $1 AND user_id = $2
    RETURNING id, conversation_id, user_id
  `;
  const result = await pool.query(query, [groupId, userId]);
  return result.rows[0] || null;
}

/**
 * List all members of a group with user profile info.
 */
export async function listGroupMembers(groupId) {
  const query = `
    SELECT 
      cp.id,
      cp.user_id,
      cp.role,
      cp.status,
      cp.joined_at,
      u.full_name,
      u.email,
      u.role AS user_global_role
    FROM conversation_participants cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id = $1
    ORDER BY 
      CASE WHEN cp.role = 'admin' THEN 0 ELSE 1 END,
      CASE WHEN cp.status = 'joined' THEN 0 WHEN cp.status = 'pending_approval' THEN 1 ELSE 2 END,
      cp.joined_at ASC
  `;
  const result = await pool.query(query, [groupId]);
  return result.rows;
}

/**
 * Store a new message in a group (FR-34).
 */
export async function createGroupMessage({ groupId, senderId, content }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const msgQuery = `
      INSERT INTO group_messages (group_id, sender_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, group_id, sender_id, content, created_at, updated_at
    `;
    const msgResult = await client.query(msgQuery, [groupId, senderId, content.trim()]);

    // Touch conversation updated_at
    await client.query(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [groupId]
    );

    await client.query('COMMIT');
    return msgResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fetch group messages in chronological order with sender metadata (FR-34).
 */
export async function getGroupMessages(groupId, limit = 50, offset = 0) {
  const query = `
    SELECT 
      gm.id,
      gm.group_id,
      gm.sender_id,
      gm.content,
      gm.created_at,
      u.full_name AS sender_name,
      u.email AS sender_email,
      cp.role AS sender_group_role
    FROM group_messages gm
    JOIN users u ON u.id = gm.sender_id
    LEFT JOIN conversation_participants cp 
      ON cp.conversation_id = gm.group_id AND cp.user_id = gm.sender_id
    WHERE gm.group_id = $1
    ORDER BY gm.created_at ASC
    LIMIT $2 OFFSET $3
  `;
  const result = await pool.query(query, [groupId, limit, offset]);
  return result.rows;
}
