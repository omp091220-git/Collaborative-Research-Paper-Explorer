import {
  createMessagingGroup,
  listGroups,
  getGroupDetails,
  searchAvailableUsers,
} from '../services/group.service.js';

/**
 * Controller to create a new messaging group.
 * Derives creator strictly from req.user.id.
 */
export async function createGroup(req, res, next) {
  try {
    const creatorId = req.user?.id || req.user?._id;
    const group = await createMessagingGroup(creatorId, req.body || {});

    return res.status(201).json({
      message: 'Group created successfully.',
      group,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to list messaging groups with optional filter and search.
 */
export async function getGroups(req, res, next) {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const groups = await listGroups(currentUserId, req.query);

    return res.status(200).json({
      groups,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to retrieve group metadata and member roster.
 */
export async function getGroup(req, res, next) {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const { groupId } = req.params;

    const data = await getGroupDetails(groupId, currentUserId);

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller to search users available for group invitation.
 */
export async function searchUsers(req, res, next) {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const { q = '' } = req.query;

    const users = await searchAvailableUsers(q, currentUserId);

    return res.status(200).json({
      users,
    });
  } catch (error) {
    next(error);
  }
}
