import pool from '../config/database.js';

let mockRepository = null;

/**
 * Test hook to inject an in-memory repository for isolated unit tests.
 */
export function _setGroupRepositoryForTesting(mock) {
  mockRepository = mock;
}

export function _resetGroupRepositoryForTesting() {
  mockRepository = null;
}

export async function getUserById(userId) {
  if (mockRepository?.getUserById) {
    return mockRepository.getUserById(userId);
  }

  const res = await pool.query(
    `SELECT id, full_name, email, role, affiliation
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Fetch a group by ID. Ensures conversation type is GROUP.
 * Query text is matched by the FR-33/FR-34 integration test mock.
 */
export async function findGroupById(groupId) {
  if (mockRepository?.findGroupById) {
    return mockRepository.findGroupById(groupId);
  }
  if (mockRepository?.getGroupById) {
    return mockRepository.getGroupById(groupId, null);
  }

  const query = `
    SELECT
      c.id,
      c.title,
      c.title AS name,
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

export async function getGroupById(groupId, currentUserId = null) {
  if (mockRepository?.getGroupById) {
    return mockRepository.getGroupById(groupId, currentUserId);
  }

  const query = `
    SELECT
      c.id,
      c.type,
      c.title,
      c.title AS name,
      c.description,
      c.is_private,
      c.created_by,
      c.created_at,
      c.updated_at,
      creator.full_name AS creator_name,
      creator.email AS creator_email,
      (
        SELECT COUNT(*)::int
        FROM conversation_participants cp
        WHERE cp.conversation_id = c.id
          AND cp.status = 'joined'
      ) AS member_count,
      my_membership.role AS my_role,
      my_membership.role AS user_role,
      my_membership.status AS membership_status,
      (my_membership.id IS NOT NULL) AS is_member
    FROM conversations c
    LEFT JOIN users creator ON c.created_by = creator.id
    LEFT JOIN conversation_participants my_membership
      ON my_membership.conversation_id = c.id AND my_membership.user_id = $2
    WHERE c.id = $1 AND c.type = 'GROUP'
  `;
  const res = await pool.query(query, [groupId, currentUserId]);
  return res.rows[0] || null;
}

/**
 * Creates a group and enrolls the creator as OWNER plus optional initial members.
 * Uses pool.query (not a dedicated client) so the FR-33 test mock can observe inserts.
 */
export async function createGroup({
  name,
  title,
  description = null,
  creatorId,
  createdBy,
  initialMemberIds = [],
  isPrivate = false,
}) {
  const groupName = name || title;
  const ownerId = creatorId || createdBy;

  if (mockRepository?.createGroup) {
    return mockRepository.createGroup({
      name: groupName,
      description,
      creatorId: ownerId,
      initialMemberIds,
      isPrivate,
    });
  }

  const inserted = await pool.query(
    `INSERT INTO conversations (type, title, description, is_private, created_by)
     VALUES ('GROUP', $1, $2, $3, $4)
     RETURNING id, type, title, description, is_private, created_by, created_at, updated_at`,
    [groupName.trim(), description ? String(description).trim() : null, Boolean(isPrivate), ownerId]
  );
  const conversation = inserted.rows[0];

  await addParticipant(conversation.id, ownerId, 'OWNER', 'joined');

  const uniqueMembers = [...new Set((initialMemberIds || []).filter((id) => id && id !== ownerId))];
  for (const memberId of uniqueMembers) {
    await addParticipant(conversation.id, memberId, 'MEMBER', 'joined');
  }

  return {
    ...conversation,
    name: conversation.title,
    title: conversation.title,
    member_count: 1 + uniqueMembers.length,
    membership_status: 'joined',
    user_role: 'OWNER',
    my_role: 'OWNER',
    is_member: true,
  };
}

export async function addParticipant(groupId, userId, role = 'MEMBER', status = 'joined') {
  const normalizedRole = String(role || 'MEMBER').toUpperCase();
  if (mockRepository?.addParticipant) {
    return mockRepository.addParticipant(groupId, userId, normalizedRole, status);
  }

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
  const result = await pool.query(query, [groupId, userId, normalizedRole, status]);
  return result.rows[0];
}

export async function addMemberToGroup(groupId, userId, role = 'MEMBER') {
  if (mockRepository?.addMemberToGroup) {
    return mockRepository.addMemberToGroup(groupId, userId, role);
  }
  return addParticipant(groupId, userId, role, 'joined');
}

export async function findParticipant(groupId, userId) {
  if (mockRepository?.findParticipant) {
    return mockRepository.findParticipant(groupId, userId);
  }

  const query = `
    SELECT id, conversation_id, user_id, role, status, joined_at, last_read_at
    FROM conversation_participants
    WHERE conversation_id = $1 AND user_id = $2
  `;
  const result = await pool.query(query, [groupId, userId]);
  return result.rows[0] || null;
}

export async function isUserGroupMember(groupId, userId) {
  if (mockRepository?.isUserGroupMember) {
    return mockRepository.isUserGroupMember(groupId, userId);
  }

  const res = await pool.query(
    `SELECT 1
     FROM conversation_participants
     WHERE conversation_id = $1 AND user_id = $2 AND status = 'joined'
     LIMIT 1`,
    [groupId, userId]
  );
  return res.rowCount > 0;
}

export async function updateParticipantStatus(groupId, userId, status) {
  if (mockRepository?.updateParticipantStatus) {
    return mockRepository.updateParticipantStatus(groupId, userId, status);
  }

  const query = `
    UPDATE conversation_participants
    SET status = $3, joined_at = CURRENT_TIMESTAMP
    WHERE conversation_id = $1 AND user_id = $2
    RETURNING id, conversation_id, user_id, role, status, joined_at
  `;
  const result = await pool.query(query, [groupId, userId, status]);
  return result.rows[0] || null;
}

export async function removeParticipant(groupId, userId) {
  if (mockRepository?.removeParticipant) {
    return mockRepository.removeParticipant(groupId, userId);
  }

  const query = `
    DELETE FROM conversation_participants
    WHERE conversation_id = $1 AND user_id = $2
    RETURNING id, conversation_id, user_id
  `;
  const result = await pool.query(query, [groupId, userId]);
  return result.rows[0] || null;
}

export async function getGroupMembers(groupId) {
  if (mockRepository?.getGroupMembers) {
    return mockRepository.getGroupMembers(groupId);
  }
  return listGroupMembers(groupId);
}

export async function listGroupMembers(groupId) {
  if (mockRepository?.listGroupMembers) {
    return mockRepository.listGroupMembers(groupId);
  }

  const query = `
    SELECT
      cp.id,
      cp.user_id,
      cp.role,
      cp.status,
      cp.joined_at,
      u.full_name,
      u.email,
      u.affiliation,
      u.role AS user_system_role,
      u.role AS user_global_role
    FROM conversation_participants cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id = $1
    ORDER BY
      CASE WHEN cp.role = 'OWNER' THEN 0 WHEN cp.role = 'ADMIN' THEN 1 ELSE 2 END,
      CASE WHEN cp.status = 'joined' THEN 0 WHEN cp.status = 'pending_approval' THEN 1 ELSE 2 END,
      cp.joined_at ASC
  `;
  const result = await pool.query(query, [groupId]);
  return result.rows;
}

export async function getUserGroups(
  userId,
  { filter = 'all', search = '', limit = 50, offset = 0 } = {}
) {
  if (mockRepository?.getUserGroups) {
    return mockRepository.getUserGroups(userId, { filter, search, limit, offset });
  }

  const params = [userId];
  const whereClauses = ["c.type = 'GROUP'"];

  if (filter === 'my') {
    whereClauses.push('my_membership.id IS NOT NULL');
  } else {
    whereClauses.push('(c.is_private = FALSE OR my_membership.id IS NOT NULL)');
  }

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    whereClauses.push(
      `(LOWER(c.title) LIKE $${params.length} OR LOWER(COALESCE(c.description, '')) LIKE $${params.length})`
    );
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const query = `
    SELECT
      c.id,
      c.type,
      c.title,
      c.title AS name,
      c.description,
      c.is_private,
      c.created_by,
      c.created_at,
      c.updated_at,
      creator.full_name AS creator_name,
      creator.email AS creator_email,
      COALESCE(members_count.total, 0)::int AS member_count,
      my_membership.status AS membership_status,
      my_membership.role AS user_role,
      my_membership.role AS my_role,
      (my_membership.id IS NOT NULL) AS is_member
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
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY c.updated_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

export async function listDiscoverableGroups(userId, search = '') {
  return getUserGroups(userId, { filter: 'all', search });
}

export async function searchUsersForGroup(searchQuery = '', excludeUserId, limit = 20) {
  if (mockRepository?.searchUsersForGroup) {
    return mockRepository.searchUsersForGroup(searchQuery, excludeUserId, limit);
  }

  if (searchQuery && searchQuery.trim()) {
    const term = `%${searchQuery.trim()}%`;
    const res = await pool.query(
      `SELECT id, full_name, email, role, affiliation
       FROM users
       WHERE id != $1
         AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
       ORDER BY full_name ASC
       LIMIT $3`,
      [excludeUserId, term, limit]
    );
    return res.rows;
  }

  const res = await pool.query(
    `SELECT id, full_name, email, role, affiliation
     FROM users
     WHERE id != $1
     ORDER BY full_name ASC
     LIMIT $2`,
    [excludeUserId, limit]
  );
  return res.rows;
}

export async function createGroupMessage({ groupId, senderId, content }) {
  if (mockRepository?.createGroupMessage) {
    return mockRepository.createGroupMessage({ groupId, senderId, content });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const msgResult = await client.query(
      `INSERT INTO group_messages (group_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, group_id, sender_id, content, created_at, updated_at`,
      [groupId, senderId, content.trim()]
    );

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

export async function getGroupMessages(groupId, limit = 50, offset = 0) {
  if (mockRepository?.getGroupMessages) {
    return mockRepository.getGroupMessages(groupId, limit, offset);
  }

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
