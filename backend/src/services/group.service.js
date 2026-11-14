import * as groupRepo from '../repositories/group.repository.js';

export class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Service: Create a new group (FR-32 foundation).
 * Automatically enrolls creator as group admin.
 */
export async function createGroup({ title, description, isPrivate, userId }) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new AppError('Group title is required.', 400, 'INVALID_TITLE');
  }

  const cleanTitle = title.trim();
  if (cleanTitle.length > 255) {
    throw new AppError('Group title cannot exceed 255 characters.', 400, 'TITLE_TOO_LONG');
  }

  const group = await groupRepo.createGroup({
    title: cleanTitle,
    description: description ? description.trim() : null,
    isPrivate: Boolean(isPrivate),
    createdBy: userId,
  });

  // Creator automatically joins as admin
  await groupRepo.addParticipant(group.id, userId, 'admin', 'joined');

  return {
    ...group,
    member_count: 1,
    membership_status: 'joined',
    user_role: 'admin',
  };
}

/**
 * Service: Discover groups (FR-33).
 * Lists all public groups and any private groups user participates in.
 */
export async function listGroups({ userId, search }) {
  return groupRepo.listDiscoverableGroups(userId, search || '');
}

/**
 * Service: Get group details (FR-33).
 * Enforces privacy: non-members cannot inspect private group rosters.
 */
export async function getGroupDetails({ groupId, userId }) {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) {
    throw new AppError('Group not found.', 404, 'NOT_FOUND');
  }

  const participant = await groupRepo.findParticipant(groupId, userId);
  const isJoined = participant && participant.status === 'joined';
  const isCreator = group.created_by === userId;

  // If private group and user is not an approved member, expose restricted metadata only
  if (group.is_private && !isJoined && !isCreator) {
    return {
      group: {
        id: group.id,
        title: group.title,
        description: group.description,
        is_private: true,
        created_at: group.created_at,
        creator_name: group.creator_name,
        member_count: null,
      },
      membership_status: participant ? participant.status : null,
      user_role: participant ? participant.role : null,
      members: [],
      restricted: true,
    };
  }

  const members = await groupRepo.listGroupMembers(groupId);

  return {
    group,
    membership_status: participant ? participant.status : null,
    user_role: participant ? participant.role : null,
    members,
    restricted: false,
  };
}

/**
 * Service: Join a group according to its rules (FR-33).
 * - Public: joins immediately with 'joined'.
 * - Private: registers 'pending_approval' join request (or accepts pending invite).
 */
export async function joinGroup({ groupId, userId }) {
  const group = await groupRepo.findGroupById(groupId);
  if (!group) {
    throw new AppError('Group not found.', 404, 'NOT_FOUND');
  }

  const participant = await groupRepo.findParticipant(groupId, userId);

  if (participant && participant.status === 'joined') {
    throw new AppError('You are already an active member of this group.', 400, 'ALREADY_MEMBER');
  }

  if (participant && participant.status === 'pending_approval') {
    throw new AppError('Your request to join this group is already pending admin approval.', 400, 'REQUEST_PENDING');
  }

  // Case 1: Public group -> Instant join
  if (!group.is_private) {
    await groupRepo.addParticipant(groupId, userId, 'member', 'joined');
    return {
      message: 'Joined group successfully.',
      status: 'joined',
      is_private: false,
    };
  }

  // Case 2: Private group with existing invitation -> Accept invite
  if (participant && participant.status === 'invited') {
    await groupRepo.updateParticipantStatus(groupId, userId, 'joined');
    return {
      message: 'Group invitation accepted. You are now a member.',
      status: 'joined',
      is_private: true,
    };
  }

  // Case 3: Private group -> Request approval
  await groupRepo.addParticipant(groupId, userId, 'member', 'pending_approval');
  return {
    message: 'Join request submitted. Awaiting group administrator approval.',
    status: 'pending_approval',
    is_private: true,
  };
}

/**
 * Service: Leave a group (FR-33 / FR-34 membership revocation).
 */
export async function leaveGroup({ groupId, userId }) {
  const participant = await groupRepo.findParticipant(groupId, userId);
  if (!participant) {
    throw new AppError('You are not a participant in this group.', 400, 'NOT_MEMBER');
  }

  await groupRepo.removeParticipant(groupId, userId);
  return {
    message: 'You have left the group.',
    status: 'left',
  };
}

/**
 * Service: Admin review of join requests (FR-33).
 */
export async function reviewJoinRequest({ groupId, adminUserId, targetUserId, action }) {
  const adminParticipant = await groupRepo.findParticipant(groupId, adminUserId);
  if (!adminParticipant || adminParticipant.role !== 'admin' || adminParticipant.status !== 'joined') {
    throw new AppError('Only group administrators can approve or reject join requests.', 403, 'FORBIDDEN');
  }

  const targetParticipant = await groupRepo.findParticipant(groupId, targetUserId);
  if (!targetParticipant || targetParticipant.status !== 'pending_approval') {
    throw new AppError('No pending join request found for this user.', 404, 'NO_PENDING_REQUEST');
  }

  if (action === 'approve') {
    await groupRepo.updateParticipantStatus(groupId, targetUserId, 'joined');
    return { message: 'Member join request approved successfully.', status: 'joined' };
  } else if (action === 'reject') {
    await groupRepo.removeParticipant(groupId, targetUserId);
    return { message: 'Member join request rejected.', status: 'rejected' };
  } else {
    throw new AppError("Invalid action. Must be 'approve' or 'reject'.", 400, 'INVALID_ACTION');
  }
}

/**
 * Service: Send a message in a group (FR-34).
 * Strictly enforces that sender is an active member with status = 'joined'.
 */
export async function sendGroupMessage({ groupId, userId, content }) {
  if (!content || typeof content !== 'string' || !content.trim()) {
    throw new AppError('Message content cannot be empty.', 400, 'EMPTY_MESSAGE');
  }

  if (content.trim().length > 5000) {
    throw new AppError('Message exceeds maximum length of 5000 characters.', 400, 'MESSAGE_TOO_LONG');
  }

  // Enforce membership
  const participant = await groupRepo.findParticipant(groupId, userId);
  if (!participant || participant.status !== 'joined') {
    throw new AppError('Access denied. You must be an approved group member to post messages.', 403, 'NOT_GROUP_MEMBER');
  }

  return groupRepo.createGroupMessage({
    groupId,
    senderId: userId,
    content: content.trim(),
  });
}

/**
 * Service: Retrieve group messages (FR-34).
 * Strictly restricts message history to active approved group members.
 */
export async function getGroupMessages({ groupId, userId, limit = 50, offset = 0 }) {
  // Enforce membership
  const participant = await groupRepo.findParticipant(groupId, userId);
  if (!participant || participant.status !== 'joined') {
    throw new AppError('Access denied. You must be an approved group member to view messages.', 403, 'NOT_GROUP_MEMBER');
  }

  const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const parsedOffset = Math.max(0, parseInt(offset, 10) || 0);

  return groupRepo.getGroupMessages(groupId, parsedLimit, parsedOffset);
}
