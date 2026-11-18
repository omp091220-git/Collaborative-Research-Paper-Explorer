import {
  createMessagingGroup,
  listGroups,
  getGroupDetails,
  searchAvailableUsers,
  joinGroup as joinGroupService,
  leaveGroup as leaveGroupService,
  reviewJoinRequest as reviewJoinRequestService,
  sendGroupMessage as sendGroupMessageService,
  getGroupMessages as getGroupMessagesService,
} from '../services/group.service.js';

function currentUserId(req) {
  return req.user?.id || req.user?._id;
}

/**
 * Create a messaging group.
 * Accepts FR-32 { name, description, initialMemberIds }
 * and FR-33 { title, description, is_private }.
 */
export async function createGroup(req, res, next) {
  try {
    const body = req.body || {};
    const group = await createMessagingGroup(currentUserId(req), {
      name: body.name || body.title,
      description: body.description,
      initialMemberIds: body.initialMemberIds,
      is_private: body.is_private ?? body.isPrivate ?? false,
    });

    return res.status(201).json({
      status: 'success',
      message: 'Group created successfully.',
      group,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List groups. Supports ?filter=all|my and ?search=.
 */
export async function getGroups(req, res, next) {
  try {
    const groups = await listGroups(currentUserId(req), req.query || {});

    return res.status(200).json({
      status: 'success',
      groups,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve group metadata and member roster.
 * Private groups hide the roster from non-members.
 */
export async function getGroup(req, res, next) {
  try {
    const groupId = req.params.groupId || req.params.id;
    const data = await getGroupDetails(groupId, currentUserId(req));

    return res.status(200).json({
      status: 'success',
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Search users available for group invitation.
 */
export async function searchUsers(req, res, next) {
  try {
    const { q = '' } = req.query || {};
    const users = await searchAvailableUsers(q, currentUserId(req));

    return res.status(200).json({
      users,
    });
  } catch (error) {
    next(error);
  }
}

export async function joinGroup(req, res, next) {
  try {
    const result = await joinGroupService({
      groupId: req.params.id,
      userId: currentUserId(req),
    });
    return res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function leaveGroup(req, res, next) {
  try {
    const result = await leaveGroupService({
      groupId: req.params.id,
      userId: currentUserId(req),
    });
    return res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function reviewJoinRequest(req, res, next) {
  try {
    const { id, userId } = req.params;
    const { action } = req.body || {};
    const result = await reviewJoinRequestService({
      groupId: id,
      adminUserId: currentUserId(req),
      targetUserId: userId,
      action,
    });
    return res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function sendGroupMessage(req, res, next) {
  try {
    const { content } = req.body || {};
    const message = await sendGroupMessageService({
      groupId: req.params.id,
      userId: currentUserId(req),
      content,
    });
    return res.status(201).json({
      status: 'success',
      message: 'Message sent successfully.',
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

export async function getGroupMessages(req, res, next) {
  try {
    const { limit, offset } = req.query || {};
    const messages = await getGroupMessagesService({
      groupId: req.params.id,
      userId: currentUserId(req),
      limit,
      offset,
    });
    return res.status(200).json({
      status: 'success',
      messages,
    });
  } catch (error) {
    next(error);
  }
}

export { getGroups as listGroups, getGroup as getGroupDetails };
