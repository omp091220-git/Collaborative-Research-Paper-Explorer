import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import pool from '../config/database.js';
import { ROLES } from '../utils/roles.js';

const TEST_SECRET = process.env.JWT_SECRET || 'super_secure_test_jwt_secret_with_32_characters_12345';

const USER_ALICE = '11111111-1111-4111-8111-111111111111'; // Admin / Creator
const USER_BOB = '22222222-2222-4222-8222-222222222222';   // Normal Member
const USER_CHARLIE = '33333333-3333-4333-8333-333333333333'; // Outsider / Requester

function tokenFor(userId, role = ROLES.RESEARCHER) {
  return jwt.sign({ id: userId, role }, TEST_SECRET, { expiresIn: '1h' });
}

// In-memory mock store for isolated unit/integration tests
const mockGroups = new Map();
const mockParticipants = new Map(); // key: `${groupId}:${userId}`
const mockMessages = [];

const originalQuery = pool.query;
const originalConnect = pool.connect;

describe('FR-33 & FR-34: Group Membership & Group Messaging Test Suite', () => {
  before(() => {
    // Mock database interactions
    pool.query = async (sql, params = []) => {
      const text = String(sql);

      // 1. User lookup for authorize/authenticate
      if (text.includes('FROM users') && text.includes('WHERE id = $1')) {
        const id = params[0];
        if (id === USER_ALICE) {
          return { rows: [{ id: USER_ALICE, full_name: 'Alice Admin', email: 'alice@test.edu', role: ROLES.RESEARCHER }] };
        }
        if (id === USER_BOB) {
          return { rows: [{ id: USER_BOB, full_name: 'Bob Researcher', email: 'bob@test.edu', role: ROLES.RESEARCHER }] };
        }
        if (id === USER_CHARLIE) {
          return { rows: [{ id: USER_CHARLIE, full_name: 'Charlie Student', email: 'charlie@test.edu', role: ROLES.STUDENT }] };
        }
        return { rows: [] };
      }

      // 2. Insert into conversations (createGroup)
      if (text.includes('INSERT INTO conversations')) {
        const [title, description, isPrivate, createdBy] = params;
        const id = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const group = {
          id,
          type: 'GROUP',
          title,
          description,
          is_private: isPrivate,
          created_by: createdBy,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockGroups.set(id, group);
        return { rows: [group] };
      }

      // 3. Find group by ID
      if (text.includes('FROM conversations c') && text.includes('WHERE c.id = $1')) {
        const id = params[0];
        const group = mockGroups.get(id);
        if (!group) return { rows: [] };
        return {
          rows: [
            {
              ...group,
              creator_name: group.created_by === USER_ALICE ? 'Alice Admin' : 'Creator',
              creator_email: 'creator@test.edu',
            },
          ],
        };
      }

      // 4. List discoverable groups
      if (text.includes('FROM conversations c') && text.includes("WHERE c.type = 'GROUP'")) {
        const userId = params[0];
        const results = [];
        for (const grp of mockGroups.values()) {
          const partKey = `${grp.id}:${userId}`;
          const part = mockParticipants.get(partKey);
          if (!grp.is_private || part) {
            let memberCount = 0;
            for (const p of mockParticipants.values()) {
              if (p.conversation_id === grp.id && p.status === 'joined') memberCount++;
            }
            results.push({
              ...grp,
              creator_name: 'Alice Admin',
              member_count: memberCount,
              membership_status: part ? part.status : null,
              user_role: part ? part.role : null,
            });
          }
        }
        return { rows: results };
      }

      // 5. Add or update participant
      if (text.includes('INSERT INTO conversation_participants')) {
        const [groupId, userId, role, status] = params;
        const key = `${groupId}:${userId}`;
        const record = {
          id: `part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          conversation_id: groupId,
          user_id: userId,
          role,
          status,
          joined_at: new Date().toISOString(),
        };
        mockParticipants.set(key, record);
        return { rows: [record] };
      }

      // 6. Find participant
      if (text.includes('SELECT') && text.includes('FROM conversation_participants') && text.includes('WHERE conversation_id = $1 AND user_id = $2')) {
        const [groupId, userId] = params;
        const key = `${groupId}:${userId}`;
        const record = mockParticipants.get(key);
        return { rows: record ? [record] : [] };
      }

      // 7. Update participant status
      if (text.includes('UPDATE conversation_participants') && text.includes('SET status = $3')) {
        const [groupId, userId, status] = params;
        const key = `${groupId}:${userId}`;
        const record = mockParticipants.get(key);
        if (record) {
          record.status = status;
          record.joined_at = new Date().toISOString();
        }
        return { rows: record ? [record] : [] };
      }

      // 8. Remove participant
      if (text.includes('DELETE FROM conversation_participants')) {
        const [groupId, userId] = params;
        const key = `${groupId}:${userId}`;
        const record = mockParticipants.get(key);
        mockParticipants.delete(key);
        return { rows: record ? [record] : [] };
      }

      // 9. List group members
      if (text.includes('FROM conversation_participants cp JOIN users u')) {
        const [groupId] = params;
        const rows = [];
        for (const p of mockParticipants.values()) {
          if (p.conversation_id === groupId) {
            rows.push({
              ...p,
              full_name: p.user_id === USER_ALICE ? 'Alice Admin' : p.user_id === USER_BOB ? 'Bob Researcher' : 'Charlie Student',
              email: `${p.user_id}@test.edu`,
              user_global_role: ROLES.RESEARCHER,
            });
          }
        }
        return { rows };
      }

      // 10. Fetch group messages
      if (text.includes('FROM group_messages gm')) {
        const [groupId] = params;
        const rows = mockMessages.filter((m) => m.group_id === groupId);
        return { rows };
      }

      return { rows: [] };
    };

    // Mock client for transactions (createGroupMessage)
    pool.connect = async () => ({
      query: async (sql, params) => {
        const text = String(sql);
        if (text.includes('INSERT INTO group_messages')) {
          const [groupId, senderId, content] = params;
          const msg = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            group_id: groupId,
            sender_id: senderId,
            content,
            created_at: new Date().toISOString(),
            sender_name: senderId === USER_ALICE ? 'Alice Admin' : 'Bob Researcher',
          };
          mockMessages.push(msg);
          return { rows: [msg] };
        }
        return { rows: [] };
      },
      release: () => {},
    });
  });

  after(() => {
    pool.query = originalQuery;
    pool.connect = originalConnect;
  });

  let publicGroupId;
  let privateGroupId;

  describe('Authentication & Route Protection', () => {
    it('rejects unauthenticated requests to list groups with 401', async () => {
      const res = await request(app).get('/api/groups');
      assert.equal(res.status, 401);
    });

    it('rejects unauthenticated requests to create group with 401', async () => {
      const res = await request(app).post('/api/groups').send({ title: 'Secret Lab' });
      assert.equal(res.status, 401);
    });

    it('rejects unauthenticated requests to join group with 401', async () => {
      const res = await request(app).post('/api/groups/dummy-id/join');
      assert.equal(res.status, 401);
    });

    it('rejects unauthenticated requests to post messages with 401', async () => {
      const res = await request(app).post('/api/groups/dummy-id/messages').send({ content: 'Hi' });
      assert.equal(res.status, 401);
    });
  });

  describe('FR-33: Group Creation & Discovery', () => {
    it('allows user Alice to create a Public group and auto-assigns admin/joined', async () => {
      const token = tokenFor(USER_ALICE);
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Quantum Computing Study Group',
          description: 'Open collaboration on quantum algorithms.',
          is_private: false,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.status, 'success');
      assert.equal(res.body.group.title, 'Quantum Computing Study Group');
      assert.equal(res.body.group.is_private, false);
      assert.equal(res.body.group.user_role, 'admin');
      assert.equal(res.body.group.membership_status, 'joined');

      publicGroupId = res.body.group.id;
    });

    it('allows user Alice to create a Private group', async () => {
      const token = tokenFor(USER_ALICE);
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Classified Cryptography Lab',
          description: 'Invite-only research group.',
          is_private: true,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.group.is_private, true);
      privateGroupId = res.body.group.id;
    });

    it('lists public group for other users (Bob) who have not joined yet', async () => {
      const token = tokenFor(USER_BOB);
      const res = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.groups));
      const foundPublic = res.body.groups.find((g) => g.id === publicGroupId);
      assert.ok(foundPublic, 'Public group should be discoverable by Bob');
      assert.equal(foundPublic.membership_status, null);
    });

    it('does NOT expose private group to outside user (Bob) until invited or requested', async () => {
      const token = tokenFor(USER_BOB);
      const res = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${token}`);

      const foundPrivate = res.body.groups.find((g) => g.id === privateGroupId);
      assert.equal(foundPrivate, undefined, 'Private group must be hidden from non-participants');
    });
  });

  describe('FR-33: Group Membership & Join Rules', () => {
    it('allows Bob to immediately join Public group with status = joined', async () => {
      const token = tokenFor(USER_BOB);
      const res = await request(app)
        .post(`/api/groups/${publicGroupId}/join`)
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'joined');
      assert.equal(res.body.is_private, false);
    });

    it('rejects duplicate join request if already a member', async () => {
      const token = tokenFor(USER_BOB);
      const res = await request(app)
        .post(`/api/groups/${publicGroupId}/join`)
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 400);
      assert.match(res.body.error, /already an active member/i);
    });

    it('requires approval when Charlie requests to join Private group (status = pending_approval)', async () => {
      const token = tokenFor(USER_CHARLIE);
      const res = await request(app)
        .post(`/api/groups/${privateGroupId}/join`)
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'pending_approval');
      assert.equal(res.body.is_private, true);
    });

    it('rejects duplicate join request while pending approval', async () => {
      const token = tokenFor(USER_CHARLIE);
      const res = await request(app)
        .post(`/api/groups/${privateGroupId}/join`)
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 400);
      assert.match(res.body.error, /already pending admin approval/i);
    });

    it('prevents non-admin Bob from approving join request', async () => {
      const token = tokenFor(USER_BOB);
      const res = await request(app)
        .post(`/api/groups/${privateGroupId}/members/${USER_CHARLIE}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'approve' });

      assert.equal(res.status, 403);
      assert.match(res.body.error, /only group administrators/i);
    });

    it('allows admin Alice to approve Charlie join request', async () => {
      const token = tokenFor(USER_ALICE);
      const res = await request(app)
        .post(`/api/groups/${privateGroupId}/members/${USER_CHARLIE}/review`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'approve' });

      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'joined');
    });
  });

  describe('FR-34: Group Messaging Authorization & Access Control', () => {
    it('allows joined members (Alice, Bob) to send messages to Public group', async () => {
      const token = tokenFor(USER_BOB);
      const res = await request(app)
        .post(`/api/groups/${publicGroupId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello everyone! Excited to collaborate on quantum algorithms.' });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.content, 'Hello everyone! Excited to collaborate on quantum algorithms.');
    });

    it('allows joined member (Alice) to read group messages', async () => {
      const token = tokenFor(USER_ALICE);
      const res = await request(app)
        .get(`/api/groups/${publicGroupId}/messages`)
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.messages));
      assert.equal(res.body.messages.length, 1);
      assert.equal(res.body.messages[0].content, 'Hello everyone! Excited to collaborate on quantum algorithms.');
    });

    it('strictly forbids outsider (Charlie) from posting message to Public group before joining (403)', async () => {
      const token = tokenFor(USER_CHARLIE);
      const res = await request(app)
        .post(`/api/groups/${publicGroupId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'I am an outsider trying to message.' });

      assert.equal(res.status, 403);
      assert.match(res.body.error, /access denied/i);
    });

    it('strictly forbids outsider (Charlie) from reading group messages before joining (403)', async () => {
      const token = tokenFor(USER_CHARLIE);
      const res = await request(app)
        .get(`/api/groups/${publicGroupId}/messages`)
        .set('Authorization', `Bearer ${token}`);

      assert.equal(res.status, 403);
      assert.match(res.body.error, /access denied/i);
    });

    it('rejects sending empty message with 400', async () => {
      const token = tokenFor(USER_BOB);
      const res = await request(app)
        .post(`/api/groups/${publicGroupId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: '   ' });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /cannot be empty/i);
    });

    it('revokes access immediately when Bob leaves the group', async () => {
      const token = tokenFor(USER_BOB);

      // 1. Bob leaves
      const leaveRes = await request(app)
        .post(`/api/groups/${publicGroupId}/leave`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(leaveRes.status, 200);
      assert.equal(leaveRes.body.status, 'left');

      // 2. Bob tries to send message -> 403 Forbidden
      const msgRes = await request(app)
        .post(`/api/groups/${publicGroupId}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Trying to speak after leaving.' });
      assert.equal(msgRes.status, 403);

      // 3. Bob tries to read messages -> 403 Forbidden
      const readRes = await request(app)
        .get(`/api/groups/${publicGroupId}/messages`)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(readRes.status, 403);
    });
  });
});
