import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_with_at_least_32_characters_12345';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/test';

import {
  _setGroupRepositoryForTesting,
  _resetGroupRepositoryForTesting,
} from '../repositories/group.repository.js';
import {
  createMessagingGroup,
  listGroups,
  getGroupDetails,
  searchAvailableUsers,
  verifyGroupMembership,
  enrollGroupMember,
} from '../services/group.service.js';

describe('FR-32 Group Service Unit Tests', () => {
  const creatorId = '11111111-1111-4111-a111-111111111111';
  const memberId = '22222222-2222-4222-a222-222222222222';
  const groupId = '33333333-3333-4333-a333-333333333333';

  let mockRepo;

  beforeEach(() => {
    mockRepo = {
      getUserById: async (id) => {
        if (id === creatorId) {
          return { id: creatorId, full_name: 'Bhavi Rana', email: 'bhavi@test.edu' };
        }
        if (id === memberId) {
          return { id: memberId, full_name: 'Krishna Tester', email: 'krishna@test.edu' };
        }
        return null;
      },
      createGroup: async ({ name, description, creatorId: cId, initialMemberIds }) => {
        return {
          id: groupId,
          type: 'GROUP',
          name,
          description,
          created_by: cId,
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
        if (gId === groupId) {
          return {
            id: groupId,
            type: 'GROUP',
            name: 'Machine Learning Reading Group',
            description: 'Weekly paper reviews',
            created_by: creatorId,
            creator_name: 'Bhavi Rana',
            creator_email: 'bhavi@test.edu',
            member_count: 2,
            my_role: uId === creatorId ? 'OWNER' : 'MEMBER',
            is_member: true,
          };
        }
        return null;
      },
      getGroupMembers: async (gId) => {
        if (gId === groupId) {
          return [
            { user_id: creatorId, role: 'OWNER', full_name: 'Bhavi Rana', email: 'bhavi@test.edu' },
            { user_id: memberId, role: 'MEMBER', full_name: 'Krishna Tester', email: 'krishna@test.edu' },
          ];
        }
        return [];
      },
      getUserGroups: async (uId, { filter, search }) => {
        return [
          {
            id: groupId,
            type: 'GROUP',
            name: 'Machine Learning Reading Group',
            description: 'Weekly paper reviews',
            created_by: creatorId,
            member_count: 2,
            my_role: 'OWNER',
            is_member: true,
          },
        ];
      },
      searchUsersForGroup: async (searchQuery, excludeUserId) => {
        return [
          { id: memberId, full_name: 'Krishna Tester', email: 'krishna@test.edu' },
        ];
      },
      isUserGroupMember: async (gId, uId) => {
        return gId === groupId && (uId === creatorId || uId === memberId);
      },
      addMemberToGroup: async (gId, uId, role) => {
        return { conversation_id: gId, user_id: uId, role, joined_at: new Date().toISOString() };
      },
    };

    _setGroupRepositoryForTesting(mockRepo);
  });

  afterEach(() => {
    _resetGroupRepositoryForTesting();
  });

  describe('createMessagingGroup', () => {
    it('creates group with creator as OWNER and returns enriched group record', async () => {
      const payload = {
        name: 'Distributed Systems Club',
        description: 'Focus on Raft and Paxos consensus.',
        initialMemberIds: [memberId],
      };

      const group = await createMessagingGroup(creatorId, payload);
      assert.ok(group);
      assert.equal(group.id, groupId);
      assert.equal(group.name, 'Distributed Systems Club');
      assert.equal(group.created_by, creatorId);
      assert.equal(group.my_role, 'OWNER');
      assert.equal(group.member_count, 2);
    });

    it('rejects missing or invalid creatorId with 401', async () => {
      await assert.rejects(
        createMessagingGroup(null, { name: 'Valid Name' }),
        (err) => err.statusCode === 401
      );
      await assert.rejects(
        createMessagingGroup('not-a-uuid', { name: 'Valid Name' }),
        (err) => err.statusCode === 401
      );
    });

    it('rejects if creator user is not found in database', async () => {
      const nonExistentCreator = '99999999-9999-4999-a999-999999999999';
      await assert.rejects(
        createMessagingGroup(nonExistentCreator, { name: 'Valid Name' }),
        (err) => err.statusCode === 404 && /Authenticated user not found/.test(err.message)
      );
    });

    it('rejects empty or invalid group name with 400', async () => {
      await assert.rejects(
        createMessagingGroup(creatorId, { name: ' ' }),
        (err) => err.statusCode === 400 && /Group name must be at least 2 characters/.test(err.message)
      );
    });

    it('rejects invalid initial member UUID with 400', async () => {
      await assert.rejects(
        createMessagingGroup(creatorId, { name: 'Group Name', initialMemberIds: ['bad-uuid'] }),
        (err) => err.statusCode === 400 && /Invalid user ID/.test(err.message)
      );
    });
  });

  describe('listGroups', () => {
    it('lists groups for authenticated user', async () => {
      const groups = await listGroups(creatorId, { filter: 'all' });
      assert.ok(Array.isArray(groups));
      assert.equal(groups.length, 1);
      assert.equal(groups[0].name, 'Machine Learning Reading Group');
    });

    it('rejects invalid user ID with 400', async () => {
      await assert.rejects(
        listGroups('invalid-id'),
        (err) => err.statusCode === 400
      );
    });
  });

  describe('getGroupDetails', () => {
    it('returns group metadata and member roster', async () => {
      const result = await getGroupDetails(groupId, creatorId);
      assert.ok(result.group);
      assert.ok(Array.isArray(result.members));
      assert.equal(result.group.id, groupId);
      assert.equal(result.members.length, 2);
      assert.equal(result.members[0].role, 'OWNER');
    });

    it('throws 404 if group is not found', async () => {
      const randomId = '00000000-0000-4000-a000-000000000000';
      await assert.rejects(
        getGroupDetails(randomId, creatorId),
        (err) => err.statusCode === 404
      );
    });
  });

  describe('searchAvailableUsers', () => {
    it('searches users excluding caller', async () => {
      const users = await searchAvailableUsers('Krishna', creatorId);
      assert.ok(Array.isArray(users));
      assert.equal(users.length, 1);
      assert.equal(users[0].full_name, 'Krishna Tester');
    });
  });

  describe('Contract Helpers for Krishna (FR-33 & FR-34)', () => {
    it('verifyGroupMembership verifies membership correctly', async () => {
      const isCreatorMember = await verifyGroupMembership(groupId, creatorId);
      assert.equal(isCreatorMember, true);

      const isNonMember = await verifyGroupMembership(groupId, '99999999-9999-4999-a999-999999999999');
      assert.equal(isNonMember, false);
    });

    it('enrollGroupMember adds a member to the group', async () => {
      const newUserId = '44444444-4444-4444-a444-444444444444';
      const result = await enrollGroupMember(groupId, newUserId, 'MEMBER');
      assert.equal(result.conversation_id, groupId);
      assert.equal(result.user_id, newUserId);
      assert.equal(result.role, 'MEMBER');
    });
  });
});
