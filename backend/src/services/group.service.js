import {
  createGroup,
  getGroupById,
  getGroupMembers,
  getUserGroups,
  searchUsersForGroup,
  isUserGroupMember,
  addMemberToGroup,
  getUserById,
} from '../repositories/group.repository.js';

import {
  isValidUUID,
  validateCreateGroupPayload,
} from '../utils/groupValidation.js';

function createHttpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Creates a new messaging group.
 * Creator identity is strictly derived from the authenticated session (creatorId).
 * The creator is automatically enrolled as the group 'OWNER'.
 *
 * @param {string} creatorId - Authenticated user UUID
 * @param {object} payload - { name, description, initialMemberIds }
 * @returns {Promise<object>} Created group object
 */
export async function createMessagingGroup(creatorId, payload) {
  if (!creatorId || !isValidUUID(creatorId)) {
    throw createHttpError('Invalid or missing authenticated user ID.', 401);
  }

  // Check creator exists in database
  const creator = await getUserById(creatorId);
  if (!creator) {
    throw createHttpError('Authenticated user not found.', 404);
  }

  // Validate payload (name, description, initial members)
  const validation = validateCreateGroupPayload(payload, creatorId);
  if (!validation.valid) {
    throw createHttpError(validation.error, 400);
  }

  const { name, description, initialMemberIds } = validation.sanitized;

  // Create the group and enroll creator as OWNER + initial members as MEMBER
  const group = await createGroup({
    name,
    description,
    creatorId,
    initialMemberIds,
  });

  return group;
}

/**
 * Retrieves messaging groups with filtering and search support.
 *
 * @param {string} userId - Authenticated user UUID
 * @param {object} [options]
 * @param {'all'|'my'} [options.filter='all']
 * @param {string} [options.search='']
 * @param {number} [options.limit=50]
 * @param {number} [options.offset=0]
 * @returns {Promise<Array>} List of groups
 */
export async function listGroups(userId, options = {}) {
  if (!userId || !isValidUUID(userId)) {
    throw createHttpError('Invalid user ID.', 400);
  }

  const filter = options.filter === 'my' ? 'my' : 'all';
  const search = typeof options.search === 'string' ? options.search.slice(0, 100) : '';
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(options.offset, 10) || 0, 0);

  const groups = await getUserGroups(userId, { filter, search, limit, offset });
  return groups;
}

/**
 * Retrieves details of a specific group, including its member roster.
 *
 * @param {string} groupId - UUID of the group
 * @param {string} userId - Authenticated user UUID
 * @returns {Promise<object>} { group, members }
 */
export async function getGroupDetails(groupId, userId) {
  if (!isValidUUID(groupId)) {
    throw createHttpError('Invalid group ID.', 400);
  }

  const group = await getGroupById(groupId, userId);
  if (!group) {
    throw createHttpError('Group not found.', 404);
  }

  const members = await getGroupMembers(groupId);

  return {
    group,
    members,
  };
}

/**
 * Searches users available to be invited into a group.
 *
 * @param {string} searchQuery
 * @param {string} currentUserId
 * @returns {Promise<Array>}
 */
export async function searchAvailableUsers(searchQuery, currentUserId) {
  if (!currentUserId || !isValidUUID(currentUserId)) {
    throw createHttpError('Invalid user ID.', 400);
  }

  const users = await searchUsersForGroup(searchQuery, currentUserId, 20);
  return users;
}

/**
 * Foundational helper for Krishna's FR-34 (Send/Receive Group Messages):
 * Checks if a user is an authorized member of a group.
 *
 * @param {string} groupId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function verifyGroupMembership(groupId, userId) {
  if (!isValidUUID(groupId) || !isValidUUID(userId)) {
    return false;
  }
  return isUserGroupMember(groupId, userId);
}

/**
 * Foundational helper for Krishna's FR-33 (Join Existing Groups):
 * Adds a user to a group.
 *
 * @param {string} groupId
 * @param {string} userId
 * @param {'MEMBER'|'ADMIN'|'OWNER'} [role='MEMBER']
 * @returns {Promise<object>}
 */
export async function enrollGroupMember(groupId, userId, role = 'MEMBER') {
  if (!isValidUUID(groupId)) {
    throw createHttpError('Invalid group ID.', 400);
  }
  if (!isValidUUID(userId)) {
    throw createHttpError('Invalid user ID.', 400);
  }

  const group = await getGroupById(groupId);
  if (!group) {
    throw createHttpError('Group not found.', 404);
  }

  return addMemberToGroup(groupId, userId, role);
}
