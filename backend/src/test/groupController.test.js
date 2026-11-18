import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createGroup,
  getGroups,
  getGroup,
  searchUsers,
} from '../controllers/group.controller.js';

import {
  _setGroupRepositoryForTesting,
  _resetGroupRepositoryForTesting,
} from '../repositories/group.repository.js';

const TEST_USER_ID = '11111111-1111-4111-a111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-a222-222222222222';
const TEST_GROUP_ID = '33333333-3333-4333-a333-333333333333';

function createMockReqRes({ body = {}, params = {}, query = {}, user = null } = {}) {
  const req = {
    body,
    params,
    query,
    user,
  };

  const res = {
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

  return { req, res };
}

describe('FR-32 Group Controller Unit Tests', () => {
  let mockRepo;

  beforeEach(() => {
    mockRepo = {
      getUserById: async (id) => {
        if (id === TEST_USER_ID) {
          return { id: TEST_USER_ID, full_name: 'Bhavi Rana', email: 'bhavi@test.edu' };
        }
        if (id === OTHER_USER_ID) {
          return { id: OTHER_USER_ID, full_name: 'Collaborator Two', email: 'collab@test.edu' };
        }
        return null;
      },
      createGroup: async ({ name, description, creatorId, initialMemberIds }) => {
        return {
          id: TEST_GROUP_ID,
          type: 'GROUP',
          name,
          description: description || null,
          created_by: creatorId,
          creator_name: 'Bhavi Rana',
          creator_email: 'bhavi@test.edu',
          member_count: 1 + (initialMemberIds?.length || 0),
          my_role: 'OWNER',
          is_member: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      },
      getGroupById: async (gId, uId) => {
        if (gId === TEST_GROUP_ID) {
          return {
            id: TEST_GROUP_ID,
            type: 'GROUP',
            name: 'Quantum Optics Lab',
            description: 'Discussion on entanglement and photonics.',
            created_by: TEST_USER_ID,
            creator_name: 'Bhavi Rana',
            creator_email: 'bhavi@test.edu',
            member_count: 2,
            my_role: uId === TEST_USER_ID ? 'OWNER' : 'MEMBER',
            is_member: true,
          };
        }
        return null;
      },
      getGroupMembers: async (gId) => {
        if (gId === TEST_GROUP_ID) {
          return [
            { user_id: TEST_USER_ID, role: 'OWNER', full_name: 'Bhavi Rana', email: 'bhavi@test.edu' },
            { user_id: OTHER_USER_ID, role: 'MEMBER', full_name: 'Collaborator Two', email: 'collab@test.edu' },
          ];
        }
        return [];
      },
      getUserGroups: async (uId, { filter, search }) => {
        return [
          {
            id: TEST_GROUP_ID,
            type: 'GROUP',
            name: 'Quantum Optics Lab',
            description: 'Discussion on entanglement and photonics.',
            created_by: TEST_USER_ID,
            member_count: 2,
            my_role: 'OWNER',
            is_member: true,
          },
        ];
      },
      searchUsersForGroup: async (searchQuery, excludeUserId) => {
        return [
          { id: OTHER_USER_ID, full_name: 'Collaborator Two', email: 'collab@test.edu' },
        ];
      },
    };

    _setGroupRepositoryForTesting(mockRepo);
  });

  afterEach(() => {
    _resetGroupRepositoryForTesting();
  });

  describe('createGroup Controller', () => {
    it('creates group and returns 201 with group payload', async () => {
      const { req, res } = createMockReqRes({
        user: { id: TEST_USER_ID },
        body: {
          name: 'Quantum Optics Lab',
          description: 'Discussion on entanglement and photonics.',
          initialMemberIds: [OTHER_USER_ID],
        },
      });

      let nextError = null;
      await createGroup(req, res, (err) => { nextError = err; });

      assert.equal(nextError, null);
      assert.equal(res.statusCode, 201);
      assert.equal(res.body.message, 'Group created successfully.');
      assert.ok(res.body.group);
      assert.equal(res.body.group.name, 'Quantum Optics Lab');
      assert.equal(res.body.group.my_role, 'OWNER');
    });

    it('passes validation errors to next() middleware with 400 statusCode', async () => {
      const { req, res } = createMockReqRes({
        user: { id: TEST_USER_ID },
        body: { name: '   ' },
      });

      let nextError = null;
      await createGroup(req, res, (err) => { nextError = err; });

      assert.ok(nextError);
      assert.equal(nextError.statusCode, 400);
      assert.match(nextError.message, /at least 2 characters/);
    });

    it('passes unauthenticated error to next() with 401 when req.user is missing', async () => {
      const { req, res } = createMockReqRes({
        user: null,
        body: { name: 'Valid Name' },
      });

      let nextError = null;
      await createGroup(req, res, (err) => { nextError = err; });

      assert.ok(nextError);
      assert.equal(nextError.statusCode, 401);
    });
  });

  describe('getGroups Controller', () => {
    it('returns 200 with groups array for authenticated user', async () => {
      const { req, res } = createMockReqRes({
        user: { id: TEST_USER_ID },
        query: { filter: 'all' },
      });

      let nextError = null;
      await getGroups(req, res, (err) => { nextError = err; });

      assert.equal(nextError, null);
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.groups));
      assert.equal(res.body.groups.length, 1);
      assert.equal(res.body.groups[0].name, 'Quantum Optics Lab');
    });
  });

  describe('getGroup Controller', () => {
    it('returns 200 with group details and member roster', async () => {
      const { req, res } = createMockReqRes({
        user: { id: TEST_USER_ID },
        params: { groupId: TEST_GROUP_ID },
      });

      let nextError = null;
      await getGroup(req, res, (err) => { nextError = err; });

      assert.equal(nextError, null);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.group);
      assert.ok(Array.isArray(res.body.members));
      assert.equal(res.body.members.length, 2);
    });

    it('passes 404 to next() when group is not found', async () => {
      const { req, res } = createMockReqRes({
        user: { id: TEST_USER_ID },
        params: { groupId: '99999999-9999-4999-a999-999999999999' },
      });

      let nextError = null;
      await getGroup(req, res, (err) => { nextError = err; });

      assert.ok(nextError);
      assert.equal(nextError.statusCode, 404);
    });
  });

  describe('searchUsers Controller', () => {
    it('returns 200 with list of candidates for group invitations', async () => {
      const { req, res } = createMockReqRes({
        user: { id: TEST_USER_ID },
        query: { q: 'Collab' },
      });

      let nextError = null;
      await searchUsers(req, res, (err) => { nextError = err; });

      assert.equal(nextError, null);
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.users));
      assert.equal(res.body.users.length, 1);
      assert.equal(res.body.users[0].full_name, 'Collaborator Two');
    });
  });
});
