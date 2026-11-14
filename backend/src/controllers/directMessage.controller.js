import {
  initiateOrGetDirectConversation,
  listUserConversations,
  getConversationHistory,
  sendMessage,
  searchAvailableUsers,
} from '../services/directMessage.service.js';

export async function initiateConversation(req, res, next) {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const { recipientId } = req.body || {};

    const { conversation, isNew } = await initiateOrGetDirectConversation(
      currentUserId,
      recipientId
    );

    return res.status(isNew ? 201 : 200).json({
      message: isNew
        ? 'Direct message conversation created successfully.'
        : 'Existing conversation retrieved.',
      conversation,
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserConversations(req, res, next) {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const conversations = await listUserConversations(currentUserId);

    return res.status(200).json({
      conversations,
    });
  } catch (error) {
    next(error);
  }
}

export async function getConversationMessages(req, res, next) {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const { conversationId } = req.params;

    const data = await getConversationHistory(
      conversationId,
      currentUserId,
      req.query
    );

    return res.status(200).json(data);
  } catch (error) {
    next(error);
  }
}

export async function postMessage(req, res, next) {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const { conversationId } = req.params;
    const { content } = req.body || {};

    const message = await sendMessage(conversationId, currentUserId, content);

    return res.status(201).json({
      message: 'Message sent successfully.',
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

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
