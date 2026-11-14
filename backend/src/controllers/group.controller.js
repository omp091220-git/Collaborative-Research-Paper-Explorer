import * as groupService from '../services/group.service.js';

export async function createGroup(req, res, next) {
  try {
    const { title, description, is_private } = req.body;
    const group = await groupService.createGroup({
      title,
      description,
      isPrivate: is_private,
      userId: req.user.id,
    });
    return res.status(201).json({
      status: 'success',
      message: 'Group created successfully.',
      group,
    });
  } catch (error) {
    return next(error);
  }
}

export async function listGroups(req, res, next) {
  try {
    const { search } = req.query;
    const groups = await groupService.listGroups({
      userId: req.user.id,
      search,
    });
    return res.status(200).json({
      status: 'success',
      groups,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getGroupDetails(req, res, next) {
  try {
    const { id } = req.params;
    const details = await groupService.getGroupDetails({
      groupId: id,
      userId: req.user.id,
    });
    return res.status(200).json({
      status: 'success',
      ...details,
    });
  } catch (error) {
    return next(error);
  }
}

export async function joinGroup(req, res, next) {
  try {
    const { id } = req.params;
    const result = await groupService.joinGroup({
      groupId: id,
      userId: req.user.id,
    });
    return res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function leaveGroup(req, res, next) {
  try {
    const { id } = req.params;
    const result = await groupService.leaveGroup({
      groupId: id,
      userId: req.user.id,
    });
    return res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function reviewJoinRequest(req, res, next) {
  try {
    const { id, userId } = req.params;
    const { action } = req.body; // 'approve' | 'reject'
    const result = await groupService.reviewJoinRequest({
      groupId: id,
      adminUserId: req.user.id,
      targetUserId: userId,
      action,
    });
    return res.status(200).json({
      status: 'success',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function sendGroupMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const message = await groupService.sendGroupMessage({
      groupId: id,
      userId: req.user.id,
      content,
    });
    return res.status(201).json({
      status: 'success',
      message: 'Message sent successfully.',
      data: message,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getGroupMessages(req, res, next) {
  try {
    const { id } = req.params;
    const { limit, offset } = req.query;
    const messages = await groupService.getGroupMessages({
      groupId: id,
      userId: req.user.id,
      limit,
      offset,
    });
    return res.status(200).json({
      status: 'success',
      messages,
    });
  } catch (error) {
    return next(error);
  }
}
