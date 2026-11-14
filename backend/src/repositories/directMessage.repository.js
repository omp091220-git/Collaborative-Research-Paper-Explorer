import pool from '../config/database.js';

let mockRepository = null;

/**
 * Test hook to inject an in-memory repository for isolated unit/integration tests.
 */
export function _setDirectMessageRepositoryForTesting(mock) {
  mockRepository = mock;
}

export function _resetDirectMessageRepositoryForTesting() {
  mockRepository = null;
}

/**
 * Finds an existing DIRECT 1-to-1 conversation between two users.
 */
export async function findDirectConversationBetweenUsers(userId1, userId2) {
  if (mockRepository?.findDirectConversationBetweenUsers) {
    return mockRepository.findDirectConversationBetweenUsers(userId1, userId2);
  }

  const query = `
    SELECT c.id, c.type, c.title, c.created_at, c.updated_at
    FROM conversations c
    JOIN conversation_participants p1 ON c.id = p1.conversation_id AND p1.user_id = $1
    JOIN conversation_participants p2 ON c.id = p2.conversation_id AND p2.user_id = $2
    WHERE c.type = 'DIRECT'
    LIMIT 1
  `;
  const res = await pool.query(query, [userId1, userId2]);
  return res.rows[0] || null;
}

/**
 * Creates a new DIRECT conversation between two participants in a database transaction.
 */
export async function createDirectConversation(creatorId, recipientId) {
  if (mockRepository?.createDirectConversation) {
    return mockRepository.createDirectConversation(creatorId, recipientId);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const convRes = await client.query(
      `INSERT INTO conversations (type, created_by)
       VALUES ('DIRECT', $1)
       RETURNING id, type, title, created_by, created_at, updated_at`,
      [creatorId]
    );
    const conversation = convRes.rows[0];

    const participantQuery = `
      INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES ($1, $2), ($1, $3)
    `;
    await client.query(participantQuery, [conversation.id, creatorId, recipientId]);

    await client.query('COMMIT');
    return conversation;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Retrieves all direct conversations for a given user, including the other user's
 * profile summary, last message snippet, and unread count.
 */
export async function getUserConversations(userId) {
  if (mockRepository?.getUserConversations) {
    return mockRepository.getUserConversations(userId);
  }

  const query = `
    SELECT 
      c.id,
      c.type,
      c.title,
      c.created_at,
      c.updated_at,
      other_u.id AS other_user_id,
      other_u.full_name AS other_user_name,
      other_u.email AS other_user_email,
      other_u.role AS other_user_role,
      other_u.affiliation AS other_user_affiliation,
      lm.content AS last_message_content,
      lm.created_at AS last_message_created_at,
      lm.sender_id AS last_message_sender_id,
      (
        SELECT COUNT(*)::int
        FROM direct_messages dm
        WHERE dm.conversation_id = c.id
          AND dm.sender_id != $1
          AND dm.is_read = FALSE
      ) AS unread_count
    FROM conversations c
    JOIN conversation_participants my_cp ON c.id = my_cp.conversation_id AND my_cp.user_id = $1
    JOIN conversation_participants other_cp ON c.id = other_cp.conversation_id AND other_cp.user_id != $1
    JOIN users other_u ON other_cp.user_id = other_u.id
    LEFT JOIN LATERAL (
      SELECT dm.content, dm.created_at, dm.sender_id
      FROM direct_messages dm
      WHERE dm.conversation_id = c.id
      ORDER BY dm.created_at DESC
      LIMIT 1
    ) lm ON TRUE
    WHERE c.type = 'DIRECT'
    ORDER BY COALESCE(lm.created_at, c.updated_at) DESC
  `;
  const res = await pool.query(query, [userId]);
  return res.rows;
}

/**
 * Retrieves a conversation by its UUID.
 */
export async function getConversationById(conversationId) {
  if (mockRepository?.getConversationById) {
    return mockRepository.getConversationById(conversationId);
  }

  const res = await pool.query(
    `SELECT id, type, title, created_by, created_at, updated_at
     FROM conversations
     WHERE id = $1`,
    [conversationId]
  );
  return res.rows[0] || null;
}

/**
 * Checks if a specific user is an authorized participant in a conversation.
 */
export async function isUserConversationParticipant(conversationId, userId) {
  if (mockRepository?.isUserConversationParticipant) {
    return mockRepository.isUserConversationParticipant(conversationId, userId);
  }

  const res = await pool.query(
    `SELECT 1
     FROM conversation_participants
     WHERE conversation_id = $1 AND user_id = $2
     LIMIT 1`,
    [conversationId, userId]
  );
  return res.rowCount > 0;
}

/**
 * Retrieves participants for a conversation.
 */
export async function getConversationParticipants(conversationId) {
  if (mockRepository?.getConversationParticipants) {
    return mockRepository.getConversationParticipants(conversationId);
  }

  const query = `
    SELECT 
      cp.user_id,
      cp.joined_at,
      cp.last_read_at,
      u.full_name,
      u.email,
      u.role,
      u.affiliation
    FROM conversation_participants cp
    JOIN users u ON cp.user_id = u.id
    WHERE cp.conversation_id = $1
  `;
  const res = await pool.query(query, [conversationId]);
  return res.rows;
}

/**
 * Retrieves messages for a conversation in chronological order (oldest first).
 */
export async function getConversationMessages(conversationId, { limit = 50, offset = 0 } = {}) {
  if (mockRepository?.getConversationMessages) {
    return mockRepository.getConversationMessages(conversationId, { limit, offset });
  }

  const query = `
    SELECT 
      m.id,
      m.conversation_id,
      m.sender_id,
      m.content,
      m.is_read,
      m.created_at,
      u.full_name AS sender_name,
      u.email AS sender_email
    FROM direct_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.conversation_id = $1
    ORDER BY m.created_at ASC
    LIMIT $2 OFFSET $3
  `;
  const res = await pool.query(query, [conversationId, limit, offset]);
  return res.rows;
}

/**
 * Inserts a new direct message and updates the conversation's updated_at timestamp.
 */
export async function createDirectMessage({ conversationId, senderId, content }) {
  if (mockRepository?.createDirectMessage) {
    return mockRepository.createDirectMessage({ conversationId, senderId, content });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const msgRes = await client.query(
      `INSERT INTO direct_messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, conversation_id, sender_id, content, is_read, created_at`,
      [conversationId, senderId, content]
    );
    const message = msgRes.rows[0];

    await client.query(
      `UPDATE conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [conversationId]
    );

    // Fetch sender info for complete return payload
    const userRes = await client.query(
      `SELECT full_name, email FROM users WHERE id = $1`,
      [senderId]
    );
    const sender = userRes.rows[0] || {};
    message.sender_name = sender.full_name;
    message.sender_email = sender.email;

    await client.query('COMMIT');
    return message;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Marks unread messages as read for a recipient and updates last_read_at timestamp.
 */
export async function markMessagesAsRead(conversationId, userId) {
  if (mockRepository?.markMessagesAsRead) {
    return mockRepository.markMessagesAsRead(conversationId, userId);
  }

  const query1 = `
    UPDATE direct_messages
    SET is_read = TRUE
    WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE
  `;
  await pool.query(query1, [conversationId, userId]);

  const query2 = `
    UPDATE conversation_participants
    SET last_read_at = CURRENT_TIMESTAMP
    WHERE conversation_id = $1 AND user_id = $2
  `;
  await pool.query(query2, [conversationId, userId]);
}

/**
 * Searches registered users (excluding current user) by name or email.
 */
export async function searchUsers(searchQuery = '', excludeUserId, limit = 20) {
  if (mockRepository?.searchUsers) {
    return mockRepository.searchUsers(searchQuery, excludeUserId, limit);
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
 * Retrieves a user by ID.
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
