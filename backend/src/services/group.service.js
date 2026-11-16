import {
  createGroup,
  getGroupById,
  getGroupMembers,
  getUserGroups,
  searchUsersForGroup,
  isUserGroupMember,
  addMemberToGroup,
  getUserById,
  findGroupById,
  findParticipant,
  addParticipant,
  updateParticipantStatus,
  removeParticipant,
  createGroupMessage,
  getGroupMessages as getGroupMessagesFromRepo,
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

function isGroupManager(participant) {
  if (!participant || participant.status !== 'joined') return false;
  const role = String(participant.role || '').toUpperCase();
  return role === 'OWNER' || role === 'ADMIN';
}

/**
 * Creates a new messaging group.
 * Creator identity comes from the authenticated session.
 * The creator is enrolled as OWNER. Optional initial members join as MEMBER.
 * Accepts public/private via payload.is_private.
 */
export async function createMessagingGroup(creatorId, payload) {
  if (!creatorId || !isValidUUID(creatorId)) {
    throw createHttpError('Invalid or missing authenticated user ID.', 401);
  }

  const creator = await getUserById(creatorId);
  if (!creator) {
    throw createHttpError('Authenticated user not found.', 404);
  }

  const validation = validateCreateGroupPayload(payload, creatorId);
  if (!validation.valid) {
    throw createHttpError(validation.error, 400);
  }

  const { name, description, initialMemberIds } = validation.sanitized;
  const isPrivate = Boolean(payload?.is_private ?? payload?.isPrivate);

  const group = await createGroup({
    name,
    description,
    creatorId,
    initialMemberIds,
    isPrivate,
  });

  return group;
}

/**
 * FR-33 object-style create. Delegates to the shared creator.
 */
export async function createGroupRecord({ title, description, isPrivate, userId, initialMemberIds }) {
  return createMessagingGroup(userId, {
    name: title,
    description,
    initialMemberIds,
    is_private: isPrivate,
  });
}

/**
 * Lists groups with filter and search.
 * filter=all applies discovery rules: public groups, plus private groups
 * the caller already participates in. filter=my is membership only.
 */
export async function listGroups(userId, options = {}) {
  if (userId && typeof userId === 'object') {
    const { userId: id, search } = userId;
    return listGroups(id, { search, filter: 'all' });
  }

  if (!userId || !isValidUUID(userId)) {
    throw createHttpError('Invalid user ID.', 400);
  }

  const filter = options.filter === 'my' ? 'my' : 'all';
  const search = typeof options.search === 'string' ? options.search.slice(0, 100) : '';
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 100);
  const offset = Math.max(parseInt(options.offset, 10) || 0, 0);

  return getUserGroups(userId, { filter, search, limit, offset });
}

/**
 * Group details and roster.
 * Private groups expose limited metadata to users who are not approved members.
 */
export async function getGroupDetails(groupId, userId) {
  if (groupId && typeof groupId === 'object') {
    return getGroupDetails(groupId.groupId, groupId.userId);
  }

  if (!isValidUUID(groupId)) {
    throw createHttpError('Invalid group ID.', 400);
  }

  const group = await getGroupById(groupId, userId);
  if (!group) {
    throw createHttpError('Group not found.', 404);
  }

  const isCreator = group.created_by === userId;
  const isJoined = group.membership_status === 'joined' || (group.is_member && !group.membership_status);

  if (group.is_private && !isJoined && !isCreator) {
    return {
      group: {
        id: group.id,
        title: group.title || group.name,
        name: group.name || group.title,
        description: group.description,
        is_private: true,
        created_at: group.created_at,
        creator_name: group.creator_name,
        member_count: null,
      },
      membership_status: group.membership_status || null,
      user_role: group.user_role || group.my_role || null,
      members: [],
      restricted: true,
    };
  }

  const members = await getGroupMembers(groupId);

  return {
    group,
    membership_status: group.membership_status || (group.is_member ? 'joined' : null),
    user_role: group.user_role || group.my_role || null,
    members,
    restricted: false,
  };
}

export async function searchAvailableUsers(searchQuery, currentUserId) {
  if (!currentUserId || !isValidUUID(currentUserId)) {
    throw createHttpError('Invalid user ID.', 400);
  }

  return searchUsersForGroup(searchQuery, currentUserId, 20);
}

export async function verifyGroupMembership(groupId, userId) {
  if (!isValidUUID(groupId) || !isValidUUID(userId)) {
    return false;
  }
  return isUserGroupMember(groupId, userId);
}

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

export async function joinGroup({ groupId, userId }) {
  const group = await findGroupById(groupId);
  if (!group) {
    throw createHttpError('Group not found.', 404);
  }

  const participant = await findParticipant(groupId, userId);

  if (participant && participant.status === 'joined') {
    throw createHttpError('You are already an active member of this group.', 400);
  }

  if (participant && participant.status === 'pending_approval') {
    throw createHttpError('Your request to join this group is already pending admin approval.', 400);
  }

  if (!group.is_private) {
    await addParticipant(groupId, userId, 'MEMBER', 'joined');
    return {
      message: 'Joined group successfully.',
      status: 'joined',
      is_private: false,
    };
  }

  if (participant && participant.status === 'invited') {
    await updateParticipantStatus(groupId, userId, 'joined');
    return {
      message: 'Group invitation accepted. You are now a member.',
      status: 'joined',
      is_private: true,
    };
  }

  await addParticipant(groupId, userId, 'MEMBER', 'pending_approval');
  return {
    message: 'Join request submitted. Awaiting group administrator approval.',
    status: 'pending_approval',
    is_private: true,
  };
}

export async function leaveGroup({ groupId, userId }) {
  const participant = await findParticipant(groupId, userId);
  if (!participant) {
    throw createHttpError('You are not a participant in this group.', 400);
  }

  await removeParticipant(groupId, userId);
  return {
    message: 'You have left the group.',
    status: 'left',
  };
}

export async function reviewJoinRequest({ groupId, adminUserId, targetUserId, action }) {
  const adminParticipant = await findParticipant(groupId, adminUserId);
  if (!isGroupManager(adminParticipant)) {
    throw createHttpError('Only group administrators can approve or reject join requests.', 403);
  }

  const targetParticipant = await findParticipant(groupId, targetUserId);
  if (!targetParticipant || targetParticipant.status !== 'pending_approval') {
    throw createHttpError('No pending join request found for this user.', 404);
  }

  if (action === 'approve') {
    await updateParticipantStatus(groupId, targetUserId, 'joined');
    return { message: 'Member join request approved successfully.', status: 'joined' };
  }

  if (action === 'reject') {
    await removeParticipant(groupId, targetUserId);
    return { message: 'Member join request rejected.', status: 'rejected' };
  }

  throw createHttpError("Invalid action. Must be 'approve' or 'reject'.", 400);
}

export async function sendGroupMessage({ groupId, userId, content }) {
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw createHttpError('Message content cannot be empty.', 400);
  }

  if (content.trim().length > 5000) {
    throw createHttpError('Message exceeds maximum length of 5000 characters.', 400);
  }

  const participant = await findParticipant(groupId, userId);
  if (!participant || participant.status !== 'joined') {
    throw createHttpError('Access denied. You must be an approved group member to post messages.', 403);
  }

  return createGroupMessage({
    groupId,
    senderId: userId,
    content: content.trim(),
  });
}

export async function getGroupMessages({ groupId, userId, limit = 50, offset = 0 }) {
  const participant = await findParticipant(groupId, userId);
  if (!participant || participant.status !== 'joined') {
    throw createHttpError('Access denied. You must be an approved group member to view messages.', 403);
  }

  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

  return getGroupMessagesFromRepo(groupId, parsedLimit, parsedOffset);
}
