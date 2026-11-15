import pool from '../config/database.js';

let mockRepository = null;

/**
 * Test hook to inject an in-memory repository for isolated unit/integration tests.
 */
export function _setGroupRepositoryForTesting(mock) {
  mockRepository = mock;
}

export function _resetGroupRepositoryForTesting() {
  mockRepository = null;
}

/**
 * Retrieves a messaging group by its UUID.
 *
 * @param {string} groupId - UUID of the conversation/group
 * @param {string|null} currentUserId - Optional UUID of current user to resolve my_role and is_member
 * @returns {Promise<object|null>} Group object or null
 */
export async function getGroupById(groupId, currentUserId = null) {
  if (mockRepository?.getGroupById) {
    return mockRepository.getGroupById(groupId, currentUserId);
  }

  const query = `
    SELECT 
      c.id,
      c.type,
      c.title AS name,
      c.description,
      c.created_by,
      c.created_at,
      c.updated_at,
      creator.full_name AS creator_name,
      creator.email AS creator_email,
      (
        SELECT COUNT(*)::int
        FROM conversation_participants cp
        WHERE cp.conversation_id = c.id
      ) AS member_count,
      (
        SELECT cp.role
        FROM conversation_participants cp
        WHERE cp.conversation_id = c.id AND cp.user_id = $2
        LIMIT 1
      ) AS my_role,
      EXISTS(
        SELECT 1
        FROM conversation_participants cp
        WHERE cp.conversation_id = c.id AND cp.user_id = $2
      ) AS is_member
    FROM conversations c
    LEFT JOIN users creator ON c.created_by = creator.id
    WHERE c.id = $1 AND c.type = 'GROUP'
  `;
  const res = await pool.query(query, [groupId, currentUserId]);
  return res.rows[0] || null;
}

/**
 * Creates a new messaging group in a database transaction.
 * Automatically adds the creator as 'OWNER' and initial members as 'MEMBER'.
 *
 * @param {object} params
 * @param {string} params.name - Group title/name
 * @param {string|null} params.description - Optional description
 * @param {string} params.creatorId - UUID of the authenticated creator
 * @param {string[]} [params.initialMemberIds] - Optional array of member UUIDs
 * @returns {Promise<object>} Created group object with creator details and member_count
 */
export async function createGroup({ name, description, creatorId, initialMemberIds = [] }) {
  if (mockRepository?.createGroup) {
    return mockRepository.createGroup({ name, description, creatorId, initialMemberIds });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert conversation of type 'GROUP'
    const convRes = await client.query(
      `INSERT INTO conversations (type, title, description, created_by)
       VALUES ('GROUP', $1, $2, $3)
       RETURNING id, type, title AS name, description, created_by, created_at, updated_at`,
      [name, description || null, creatorId]
    );
    const conversation = convRes.rows[0];

    // 2. Add creator as OWNER
    await client.query(
      `INSERT INTO conversation_participants (conversation_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [conversation.id, creatorId]
    );

    // 3. Add initial members if provided
    if (initialMemberIds && initialMemberIds.length > 0) {
      const uniqueMembers = [...new Set(initialMemberIds.filter((id) => id !== creatorId))];
      for (const memberId of uniqueMembers) {
        await client.query(
          `INSERT INTO conversation_participants (conversation_id, user_id, role)
           VALUES ($1, $2, 'MEMBER')
           ON CONFLICT (conversation_id, user_id) DO NOTHING`,
          [conversation.id, memberId]
        );
      }
    }

    await client.query('COMMIT');

    // Fetch the full enriched group record
    return getGroupById(conversation.id, creatorId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Retrieves the enrolled members for a messaging group.
 *
 * @param {string} groupId - UUID of the group
 * @returns {Promise<Array>} List of member objects
 */
export async function getGroupMembers(groupId) {
  if (mockRepository?.getGroupMembers) {
    return mockRepository.getGroupMembers(groupId);
  }

  const query = `
    SELECT 
      cp.user_id,
      cp.role,
      cp.joined_at,
      u.full_name,
      u.email,
      u.affiliation,
      u.role AS user_system_role
    FROM conversation_participants cp
    JOIN users u ON cp.user_id = u.id
    WHERE cp.conversation_id = $1
    ORDER BY 
      CASE WHEN cp.role = 'OWNER' THEN 1 WHEN cp.role = 'ADMIN' THEN 2 ELSE 3 END,
      cp.joined_at ASC
  `;
  const res = await pool.query(query, [groupId]);
  return res.rows;
}

/**
 * Retrieves groups with optional filter ('all' vs 'my') and search keyword.
 *
 * @param {string} userId - UUID of current user
 * @param {object} options
 * @param {'all'|'my'} [options.filter='all'] - 'my' restricts to groups where user is enrolled
 * @param {string} [options.search=''] - Keyword to match against group name or description
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @returns {Promise<Array>}
 */
export async function getUserGroups(
  userId,
  { filter = 'all', search = '', limit = 50, offset = 0 } = {}
) {
  if (mockRepository?.getUserGroups) {
    return mockRepository.getUserGroups(userId, { filter, search, limit, offset });
  }

  const whereClauses = ["c.type = 'GROUP'"];
  const params = [userId];

  if (filter === 'my') {
    whereClauses.push(`EXISTS (
      SELECT 1 FROM conversation_participants my_cp 
      WHERE my_cp.conversation_id = c.id AND my_cp.user_id = $1
    )`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    const searchIdx = params.length;
    whereClauses.push(`(c.title ILIKE $${searchIdx} OR c.description ILIKE $${searchIdx})`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const query = `
    SELECT 
      c.id,
      c.type,
      c.title AS name,
      c.description,
      c.created_by,
      c.created_at,
      c.updated_at,
      creator.full_name AS creator_name,
      creator.email AS creator_email,
      (
        SELECT COUNT(*)::int 
        FROM conversation_participants cp 
        WHERE cp.conversation_id = c.id
      ) AS member_count,
      (
        SELECT cp.role 
        FROM conversation_participants cp 
        WHERE cp.conversation_id = c.id AND cp.user_id = $1
        LIMIT 1
      ) AS my_role,
      EXISTS(
        SELECT 1 
        FROM conversation_participants cp 
        WHERE cp.conversation_id = c.id AND cp.user_id = $1
      ) AS is_member
    FROM conversations c
    LEFT JOIN users creator ON c.created_by = creator.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY c.updated_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const res = await pool.query(query, params);
  return res.rows;
}

/**
 * Checks if a specific user is an active participant in a messaging group.
 * Foundational contract for Krishna's FR-34 (Group Messaging authorization).
 *
 * @param {string} groupId - UUID of the group
 * @param {string} userId - UUID of the user
 * @returns {Promise<boolean>}
 */
export async function isUserGroupMember(groupId, userId) {
  if (mockRepository?.isUserGroupMember) {
    return mockRepository.isUserGroupMember(groupId, userId);
  }

  const res = await pool.query(
    `SELECT 1
     FROM conversation_participants
     WHERE conversation_id = $1 AND user_id = $2
     LIMIT 1`,
    [groupId, userId]
  );
  return res.rowCount > 0;
}

/**
 * Adds a user to a group with a specified role.
 * Foundational contract for Krishna's FR-33 (Join Existing Groups).
 *
 * @param {string} groupId - UUID of the group
 * @param {string} userId - UUID of the user joining
 * @param {'OWNER'|'ADMIN'|'MEMBER'} [role='MEMBER']
 * @returns {Promise<object>}
 */
export async function addMemberToGroup(groupId, userId, role = 'MEMBER') {
  if (mockRepository?.addMemberToGroup) {
    return mockRepository.addMemberToGroup(groupId, userId, role);
  }

  const res = await pool.query(
    `INSERT INTO conversation_participants (conversation_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING conversation_id, user_id, role, joined_at`,
    [groupId, userId, role]
  );
  return res.rows[0];
}

/**
 * Searches users for group invitations (excluding caller).
 *
 * @param {string} searchQuery
 * @param {string} excludeUserId
 * @param {number} [limit=20]
 * @returns {Promise<Array>}
 */
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

/**
 * Retrieves a user profile by ID.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
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
