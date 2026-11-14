import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  initiateOrGetDirectConversation,
  listUserConversations,
  getConversationHistory,
  sendMessage,
  searchAvailableUsers,
  _setNotificationDispatcherForTesting,
  _resetNotificationDispatcherForTesting,
} from '../services/directMessage.service.js';

import {
  _setDirectMessageRepositoryForTesting,
  _resetDirectMessageRepositoryForTesting,
} from '../repositories/directMessage.repository.js';

describe('FR-31 One-to-One Direct Messaging Service & Authorization Suite', () => {
  // Test fixture UUIDs
  const USER_ALICE = '10000000-0000-4000-8000-000000000001';
  const USER_BOB = '20000000-0000-4000-8000-000000000002';
  const USER_CHARLIE = '30000000-0000-4000-8000-000000000003';
  const USER_DAVID = '40000000-0000-4000-8000-000000000004';

  const CONV_ALICE_BOB = 'c0000000-0000-4000-8000-000000000001';
  const CONV_CHARLIE_DAVID = 'c0000000-0000-4000-8000-000000000002';

  let users = [];
  let conversations = [];
  let participants = [];
  let messages = [];
  let dispatchedNotifications = [];

  function resetDb() {
    users = [
      {
        id: USER_ALICE,
        full_name: 'Alice Smith',
        email: 'alice@example.com',
        role: 'RESEARCHER',
        affiliation: 'MIT',
      },
      {
        id: USER_BOB,
        full_name: 'Bob Jones',
        email: 'bob@example.com',
        role: 'STUDENT',
        affiliation: 'Stanford',
      },
      {
        id: USER_CHARLIE,
        full_name: 'Charlie Brown',
        email: 'charlie@example.com',
        role: 'RESEARCHER',
        affiliation: 'Oxford',
      },
      {
        id: USER_DAVID,
        full_name: 'David Miller',
        email: 'david@example.com',
        role: 'STUDENT',
        affiliation: 'Cambridge',
      },
    ];

    conversations = [
      {
        id: CONV_ALICE_BOB,
        type: 'DIRECT',
        title: null,
        created_by: USER_ALICE,
        created_at: new Date('2026-11-01T10:00:00Z').toISOString(),
        updated_at: new Date('2026-11-01T10:05:00Z').toISOString(),
      },
      {
        id: CONV_CHARLIE_DAVID,
        type: 'DIRECT',
        title: null,
        created_by: USER_CHARLIE,
        created_at: new Date('2026-11-02T12:00:00Z').toISOString(),
        updated_at: new Date('2026-11-02T12:10:00Z').toISOString(),
      },
    ];

    participants = [
      { conversation_id: CONV_ALICE_BOB, user_id: USER_ALICE, joined_at: new Date(), last_read_at: new Date() },
      { conversation_id: CONV_ALICE_BOB, user_id: USER_BOB, joined_at: new Date(), last_read_at: new Date() },
      { conversation_id: CONV_CHARLIE_DAVID, user_id: USER_CHARLIE, joined_at: new Date(), last_read_at: new Date() },
      { conversation_id: CONV_CHARLIE_DAVID, user_id: USER_DAVID, joined_at: new Date(), last_read_at: new Date() },
    ];

    messages = [
      {
        id: 'm0000000-0000-4000-8000-000000000001',
        conversation_id: CONV_ALICE_BOB,
        sender_id: USER_ALICE,
        sender_name: 'Alice Smith',
        sender_email: 'alice@example.com',
        content: 'Hi Bob, did you review section 3?',
        is_read: true,
        created_at: new Date('2026-11-01T10:01:00Z').toISOString(),
      },
      {
        id: 'm0000000-0000-4000-8000-000000000002',
        conversation_id: CONV_ALICE_BOB,
        sender_id: USER_BOB,
        sender_name: 'Bob Jones',
        sender_email: 'bob@example.com',
        content: 'Yes Alice, equations look consistent.',
        is_read: false,
        created_at: new Date('2026-11-01T10:05:00Z').toISOString(),
      },
      {
        id: 'm0000000-0000-4000-8000-000000000003',
        conversation_id: CONV_CHARLIE_DAVID,
        sender_id: USER_CHARLIE,
        sender_name: 'Charlie Brown',
        sender_email: 'charlie@example.com',
        content: 'Hello David, meeting at 3 PM?',
        is_read: true,
        created_at: new Date('2026-11-02T12:05:00Z').toISOString(),
      },
    ];

    dispatchedNotifications = [];
  }

  beforeEach(() => {
    resetDb();
    _setNotificationDispatcherForTesting(async (notif) => {
      dispatchedNotifications.push(notif);
      return notif;
    });

    // Mock repository implementations for isolated unit testing
    _setDirectMessageRepositoryForTesting({
      getUserById: async (id) => users.find((u) => u.id === id) || null,

      findDirectConversationBetweenUsers: async (u1, u2) => {
        for (const c of conversations) {
          if (c.type !== 'DIRECT') continue;
          const userParts = participants.filter((p) => p.conversation_id === c.id).map((p) => p.user_id);
          if (userParts.includes(u1) && userParts.includes(u2)) {
            return c;
          }
        }
        return null;
      },

      createDirectConversation: async (creatorId, recipientId) => {
        const newConv = {
          id: `c0000000-0000-4000-8000-${String(conversations.length + 1).padStart(12, '0')}`,
          type: 'DIRECT',
          title: null,
          created_by: creatorId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        conversations.push(newConv);
        participants.push({ conversation_id: newConv.id, user_id: creatorId, joined_at: new Date(), last_read_at: new Date() });
        participants.push({ conversation_id: newConv.id, user_id: recipientId, joined_at: new Date(), last_read_at: new Date() });
        return newConv;
      },

      getUserConversations: async (userId) => {
        const userConvIds = participants.filter((p) => p.user_id === userId).map((p) => p.conversation_id);
        const result = [];
        for (const convId of userConvIds) {
          const conv = conversations.find((c) => c.id === convId);
          if (!conv || conv.type !== 'DIRECT') continue;
          const otherPart = participants.find((p) => p.conversation_id === convId && p.user_id !== userId);
          const otherUser = users.find((u) => u.id === otherPart?.user_id) || {};
          const convMsgs = messages.filter((m) => m.conversation_id === convId);
          const lastMsg = convMsgs[convMsgs.length - 1] || null;
          const unreadCount = convMsgs.filter((m) => m.sender_id !== userId && !m.is_read).length;

          result.push({
            id: conv.id,
            type: conv.type,
            title: conv.title,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            other_user_id: otherUser.id,
            other_user_name: otherUser.full_name,
            other_user_email: otherUser.email,
            other_user_role: otherUser.role,
            other_user_affiliation: otherUser.affiliation,
            last_message_content: lastMsg ? lastMsg.content : null,
            last_message_created_at: lastMsg ? lastMsg.created_at : null,
            last_message_sender_id: lastMsg ? lastMsg.sender_id : null,
            unread_count: unreadCount,
          });
        }
        return result;
      },

      getConversationById: async (id) => conversations.find((c) => c.id === id) || null,

      isUserConversationParticipant: async (convId, userId) => {
        return participants.some((p) => p.conversation_id === convId && p.user_id === userId);
      },

      getConversationParticipants: async (convId) => {
        const parts = participants.filter((p) => p.conversation_id === convId);
        return parts.map((p) => {
          const u = users.find((user) => user.id === p.user_id) || {};
          return {
            user_id: p.user_id,
            joined_at: p.joined_at,
            last_read_at: p.last_read_at,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
            affiliation: u.affiliation,
          };
        });
      },

      getConversationMessages: async (convId) => {
        return messages
          .filter((m) => m.conversation_id === convId)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      },

      createDirectMessage: async ({ conversationId, senderId, content }) => {
        const sender = users.find((u) => u.id === senderId) || {};
        const newMsg = {
          id: `m0000000-0000-4000-8000-${String(messages.length + 1).padStart(12, '0')}`,
          conversation_id: conversationId,
          sender_id: senderId,
          sender_name: sender.full_name,
          sender_email: sender.email,
          content,
          is_read: false,
          created_at: new Date().toISOString(),
        };
        messages.push(newMsg);
        return newMsg;
      },

      markMessagesAsRead: async (convId, userId) => {
        messages.forEach((m) => {
          if (m.conversation_id === convId && m.sender_id !== userId) {
            m.is_read = true;
          }
        });
      },

      searchUsers: async (searchQuery, excludeUserId) => {
        return users.filter((u) => {
          if (u.id === excludeUserId) return false;
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
        });
      },
    });
  });

  afterEach(() => {
    _resetDirectMessageRepositoryForTesting();
    _resetNotificationDispatcherForTesting();
  });

  describe('Conversation Initiation', () => {
    it('returns existing conversation if one already exists between participants', async () => {
      const res = await initiateOrGetDirectConversation(USER_ALICE, USER_BOB);
      assert.strictEqual(res.isNew, false);
      assert.strictEqual(res.conversation.id, CONV_ALICE_BOB);
      assert.strictEqual(res.conversation.other_user_id, USER_BOB);
      assert.strictEqual(res.conversation.other_user_name, 'Bob Jones');
    });

    it('creates a new conversation if none exists between participants', async () => {
      const res = await initiateOrGetDirectConversation(USER_ALICE, USER_CHARLIE);
      assert.strictEqual(res.isNew, true);
      assert.ok(res.conversation.id);
      assert.strictEqual(res.conversation.type, 'DIRECT');
      assert.strictEqual(res.conversation.other_user_id, USER_CHARLIE);
      assert.strictEqual(res.conversation.other_user_name, 'Charlie Brown');
    });

    it('rejects conversation initiation with oneself', async () => {
      await assert.rejects(
        async () => initiateOrGetDirectConversation(USER_ALICE, USER_ALICE),
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /cannot start a direct message conversation with yourself/i);
          return true;
        }
      );
    });

    it('rejects initiation with non-existent recipient', async () => {
      const nonExistentId = '90000000-0000-4000-8000-000000000099';
      await assert.rejects(
        async () => initiateOrGetDirectConversation(USER_ALICE, nonExistentId),
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          assert.match(err.message, /recipient user not found/i);
          return true;
        }
      );
    });

    it('rejects invalid recipient UUID', async () => {
      await assert.rejects(
        async () => initiateOrGetDirectConversation(USER_ALICE, 'not-a-valid-uuid'),
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /valid UUID/i);
          return true;
        }
      );
    });
  });

  describe('Listing Conversations & Isolation', () => {
    it('lists only conversations where the user is an active participant', async () => {
      const aliceConvs = await listUserConversations(USER_ALICE);
      assert.strictEqual(aliceConvs.length, 1);
      assert.strictEqual(aliceConvs[0].id, CONV_ALICE_BOB);
      assert.strictEqual(aliceConvs[0].other_user_id, USER_BOB);

      const charlieConvs = await listUserConversations(USER_CHARLIE);
      assert.strictEqual(charlieConvs.length, 1);
      assert.strictEqual(charlieConvs[0].id, CONV_CHARLIE_DAVID);
      assert.strictEqual(charlieConvs[0].other_user_id, USER_DAVID);
    });

    it('accurately reports unread message counts for recipient', async () => {
      // Bob sent an unread message to Alice in setup
      const aliceConvs = await listUserConversations(USER_ALICE);
      assert.strictEqual(aliceConvs[0].unread_count, 1);

      // Bob's view of the conversation should show 0 unread because Bob was the sender
      const bobConvs = await listUserConversations(USER_BOB);
      assert.strictEqual(bobConvs[0].unread_count, 0);
    });
  });

  describe('Message Retrieval & Chronological Order', () => {
    it('retrieves messages in chronological order and marks them as read', async () => {
      const history = await getConversationHistory(CONV_ALICE_BOB, USER_ALICE);
      assert.strictEqual(history.messages.length, 2);
      assert.strictEqual(history.messages[0].sender_id, USER_ALICE);
      assert.strictEqual(history.messages[1].sender_id, USER_BOB);

      // Verify unread messages were marked read
      assert.strictEqual(history.messages[1].is_read, true);
      assert.strictEqual(history.otherUser.id, USER_BOB);
      assert.strictEqual(history.otherUser.full_name, 'Bob Jones');
    });

    it('rejects unauthorized message retrieval by non-participants (403 Forbidden)', async () => {
      // Charlie tries to snoop on Alice and Bob's private conversation
      await assert.rejects(
        async () => getConversationHistory(CONV_ALICE_BOB, USER_CHARLIE),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.match(err.message, /not a participant/i);
          return true;
        }
      );
    });

    it('returns 404 if conversation does not exist', async () => {
      const nonExistentConv = 'c9999999-0000-4000-8000-000000000099';
      await assert.rejects(
        async () => getConversationHistory(nonExistentConv, USER_ALICE),
        (err) => {
          assert.strictEqual(err.statusCode, 404);
          assert.match(err.message, /conversation not found/i);
          return true;
        }
      );
    });
  });

  describe('Sending Direct Messages', () => {
    it('allows an authorized participant to send a message', async () => {
      const msg = await sendMessage(CONV_ALICE_BOB, USER_ALICE, 'Great, let us finalize the draft.');
      assert.ok(msg.id);
      assert.strictEqual(msg.sender_id, USER_ALICE);
      assert.strictEqual(msg.content, 'Great, let us finalize the draft.');
      assert.strictEqual(msg.sender_name, 'Alice Smith');

      // Verify message is present in conversation history
      const history = await getConversationHistory(CONV_ALICE_BOB, USER_BOB);
      assert.strictEqual(history.messages.length, 3);
      assert.strictEqual(history.messages[2].content, 'Great, let us finalize the draft.');

      // Verify notification was dispatched to the other user
      assert.strictEqual(dispatchedNotifications.length, 1);
      assert.strictEqual(dispatchedNotifications[0].userId, USER_BOB);
      assert.strictEqual(dispatchedNotifications[0].type, 'DIRECT_MESSAGE');
    });

    it('rejects sending empty or whitespace-only messages', async () => {
      await assert.rejects(
        async () => sendMessage(CONV_ALICE_BOB, USER_ALICE, '   '),
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /cannot be empty/i);
          return true;
        }
      );
    });

    it('rejects sending message from an unauthorized non-participant (403 Forbidden)', async () => {
      // Charlie tries to inject a message into Alice & Bob's conversation
      await assert.rejects(
        async () => sendMessage(CONV_ALICE_BOB, USER_CHARLIE, 'Intruder message!'),
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.match(err.message, /not a participant/i);
          return true;
        }
      );
    });
  });

  describe('User Discovery for Messaging', () => {
    it('returns registered users excluding the current user', async () => {
      const results = await searchAvailableUsers('', USER_ALICE);
      assert.strictEqual(results.length, 3);
      assert.ok(!results.some((u) => u.id === USER_ALICE));
      assert.ok(results.some((u) => u.id === USER_BOB));
    });

    it('filters users by search term', async () => {
      const results = await searchAvailableUsers('charlie', USER_ALICE);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].id, USER_CHARLIE);
      assert.strictEqual(results[0].full_name, 'Charlie Brown');
    });
  });
});
