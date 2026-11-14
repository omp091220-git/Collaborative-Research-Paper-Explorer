import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  initiateConversation,
  getUserConversations,
  getConversationMessages,
  postMessage,
  searchUsers,
} from '../controllers/directMessage.controller.js';

import {
  _setDirectMessageRepositoryForTesting,
  _resetDirectMessageRepositoryForTesting,
} from '../repositories/directMessage.repository.js';

import {
  _setNotificationDispatcherForTesting,
  _resetNotificationDispatcherForTesting,
} from '../services/directMessage.service.js';

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

describe('FR-31 Direct Messaging Controller Unit & Integration Suite', () => {
  const USER_1 = '10000000-0000-4000-8000-000000000001';
  const USER_2 = '20000000-0000-4000-8000-000000000002';
  const USER_3 = '30000000-0000-4000-8000-000000000003';
  const CONV_1_2 = 'c0000000-0000-4000-8000-000000000001';

  let conversations;
  let participants;
  let messages;
  let users;

  beforeEach(() => {
    users = [
      { id: USER_1, full_name: 'User One', email: 'user1@example.com', role: 'RESEARCHER' },
      { id: USER_2, full_name: 'User Two', email: 'user2@example.com', role: 'STUDENT' },
      { id: USER_3, full_name: 'User Three', email: 'user3@example.com', role: 'STUDENT' },
    ];

    conversations = [
      {
        id: CONV_1_2,
        type: 'DIRECT',
        title: null,
        created_by: USER_1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    participants = [
      { conversation_id: CONV_1_2, user_id: USER_1 },
      { conversation_id: CONV_1_2, user_id: USER_2 },
    ];

    messages = [
      {
        id: 'm0000000-0000-4000-8000-000000000001',
        conversation_id: CONV_1_2,
        sender_id: USER_1,
        sender_name: 'User One',
        sender_email: 'user1@example.com',
        content: 'Hello User Two!',
        is_read: false,
        created_at: new Date().toISOString(),
      },
    ];

    _setNotificationDispatcherForTesting(async () => {});

    _setDirectMessageRepositoryForTesting({
      getUserById: async (id) => users.find((u) => u.id === id) || null,

      findDirectConversationBetweenUsers: async (u1, u2) => {
        for (const c of conversations) {
          const parts = participants.filter((p) => p.conversation_id === c.id).map((p) => p.user_id);
          if (parts.includes(u1) && parts.includes(u2)) return c;
        }
        return null;
      },

      createDirectConversation: async (creatorId, recipientId) => {
        const c = {
          id: `c0000000-0000-4000-8000-${String(conversations.length + 1).padStart(12, '0')}`,
          type: 'DIRECT',
          title: null,
          created_by: creatorId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        conversations.push(c);
        participants.push({ conversation_id: c.id, user_id: creatorId });
        participants.push({ conversation_id: c.id, user_id: recipientId });
        return c;
      },

      getUserConversations: async (userId) => {
        const userConvIds = participants.filter((p) => p.user_id === userId).map((p) => p.conversation_id);
        return userConvIds.map((cId) => {
          const conv = conversations.find((c) => c.id === cId);
          const otherPart = participants.find((p) => p.conversation_id === cId && p.user_id !== userId);
          const otherUser = users.find((u) => u.id === otherPart?.user_id) || {};
          return {
            ...conv,
            other_user_id: otherUser.id,
            other_user_name: otherUser.full_name,
            other_user_email: otherUser.email,
            unread_count: messages.filter((m) => m.conversation_id === cId && m.sender_id !== userId && !m.is_read).length,
          };
        });
      },

      getConversationById: async (id) => conversations.find((c) => c.id === id) || null,

      isUserConversationParticipant: async (cId, uId) => {
        return participants.some((p) => p.conversation_id === cId && p.user_id === uId);
      },

      getConversationParticipants: async (cId) => {
        return participants
          .filter((p) => p.conversation_id === cId)
          .map((p) => {
            const u = users.find((x) => x.id === p.user_id) || {};
            return { user_id: p.user_id, ...u };
          });
      },

      getConversationMessages: async (cId) => {
        return messages.filter((m) => m.conversation_id === cId);
      },

      createDirectMessage: async ({ conversationId, senderId, content }) => {
        const sender = users.find((u) => u.id === senderId) || {};
        const msg = {
          id: `m0000000-0000-4000-8000-${String(messages.length + 1).padStart(12, '0')}`,
          conversation_id: conversationId,
          sender_id: senderId,
          sender_name: sender.full_name,
          sender_email: sender.email,
          content,
          is_read: false,
          created_at: new Date().toISOString(),
        };
        messages.push(msg);
        return msg;
      },

      markMessagesAsRead: async () => {},

      searchUsers: async (q, excludeId) => {
        return users.filter((u) => u.id !== excludeId);
      },
    });
  });

  afterEach(() => {
    _resetDirectMessageRepositoryForTesting();
    _resetNotificationDispatcherForTesting();
  });

  it('initiateConversation returns 200 for existing conversation', async () => {
    const req = { user: { id: USER_1 }, body: { recipientId: USER_2 } };
    const res = mockResponse();
    let nextCalled = false;

    await initiateConversation(req, res, (err) => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.conversation.id, CONV_1_2);
  });

  it('initiateConversation returns 201 for a new conversation', async () => {
    const req = { user: { id: USER_1 }, body: { recipientId: USER_3 } };
    const res = mockResponse();
    let nextCalled = false;

    await initiateConversation(req, res, (err) => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.conversation.other_user_id, USER_3);
  });

  it('initiateConversation passes error to next on invalid recipient', async () => {
    const req = { user: { id: USER_1 }, body: { recipientId: 'bad-id' } };
    const res = mockResponse();
    let capturedErr = null;

    await initiateConversation(req, res, (err) => { capturedErr = err; });

    assert.ok(capturedErr);
    assert.strictEqual(capturedErr.statusCode, 400);
  });

  it('getUserConversations returns 200 with list of conversations', async () => {
    const req = { user: { id: USER_1 } };
    const res = mockResponse();
    let nextCalled = false;

    await getUserConversations(req, res, (err) => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.conversations.length, 1);
    assert.strictEqual(res.body.conversations[0].other_user_id, USER_2);
  });

  it('getConversationMessages returns 200 with messages for participant', async () => {
    const req = { user: { id: USER_2 }, params: { conversationId: CONV_1_2 }, query: {} };
    const res = mockResponse();
    let nextCalled = false;

    await getConversationMessages(req, res, (err) => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.messages.length, 1);
    assert.strictEqual(res.body.messages[0].content, 'Hello User Two!');
  });

  it('getConversationMessages passes 403 Forbidden to next for non-participant', async () => {
    const req = { user: { id: USER_3 }, params: { conversationId: CONV_1_2 }, query: {} };
    const res = mockResponse();
    let capturedErr = null;

    await getConversationMessages(req, res, (err) => { capturedErr = err; });

    assert.ok(capturedErr);
    assert.strictEqual(capturedErr.statusCode, 403);
  });

  it('postMessage returns 201 on success', async () => {
    const req = {
      user: { id: USER_2 },
      params: { conversationId: CONV_1_2 },
      body: { content: 'Acknowledged, starting experiment.' },
    };
    const res = mockResponse();
    let nextCalled = false;

    await postMessage(req, res, (err) => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.data.content, 'Acknowledged, starting experiment.');
    assert.strictEqual(res.body.data.sender_id, USER_2);
  });

  it('postMessage passes 400 to next on empty content', async () => {
    const req = {
      user: { id: USER_2 },
      params: { conversationId: CONV_1_2 },
      body: { content: '   ' },
    };
    const res = mockResponse();
    let capturedErr = null;

    await postMessage(req, res, (err) => { capturedErr = err; });

    assert.ok(capturedErr);
    assert.strictEqual(capturedErr.statusCode, 400);
  });

  it('searchUsers returns 200 with matching users', async () => {
    const req = { user: { id: USER_1 }, query: { q: '' } };
    const res = mockResponse();
    let nextCalled = false;

    await searchUsers(req, res, (err) => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.users.length, 2);
    assert.ok(!res.body.users.some((u) => u.id === USER_1));
  });
});
