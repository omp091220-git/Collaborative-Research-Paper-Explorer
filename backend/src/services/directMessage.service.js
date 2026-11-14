import {
  findDirectConversationBetweenUsers,
  createDirectConversation,
  getUserConversations,
  getConversationById,
  isUserConversationParticipant,
  getConversationParticipants,
  getConversationMessages,
  createDirectMessage,
  markMessagesAsRead,
  searchUsers,
  getUserById,
} from '../repositories/directMessage.repository.js';

import {
  isValidUUID,
  validateMessageContent,
  validateCreateConversationPayload,
  validatePagination,
} from '../utils/directMessageValidation.js';

import { createNotification } from './notification.service.js';

let notificationDispatcher = createNotification;

export function _setNotificationDispatcherForTesting(fn) {
  notificationDispatcher = fn;
}

export function _resetNotificationDispatcherForTesting() {
  notificationDispatcher = createNotification;
}

function createHttpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

/**
 * Initiates a new direct conversation or retrieves the existing one between two users.
 */
export async function initiateOrGetDirectConversation(currentUserId, recipientId) {
  const validation = validateCreateConversationPayload({ recipientId }, currentUserId);
  if (!validation.valid) {
    throw createHttpError(validation.error, 400);
  }

  const cleanRecipientId = validation.sanitized.recipientId;

  // Check if recipient exists
  const recipient = await getUserById(cleanRecipientId);
  if (!recipient) {
    throw createHttpError('Recipient user not found.', 404);
  }

  // Check if a direct conversation already exists between the two users
  const existingConv = await findDirectConversationBetweenUsers(currentUserId, cleanRecipientId);
  if (existingConv) {
    return {
      conversation: {
        ...existingConv,
        other_user_id: recipient.id,
        other_user_name: recipient.full_name,
        other_user_email: recipient.email,
        other_user_role: recipient.role,
        other_user_affiliation: recipient.affiliation,
      },
      isNew: false,
    };
  }

  // Create new conversation
  const newConv = await createDirectConversation(currentUserId, cleanRecipientId);
  return {
    conversation: {
      ...newConv,
      other_user_id: recipient.id,
      other_user_name: recipient.full_name,
      other_user_email: recipient.email,
      other_user_role: recipient.role,
      other_user_affiliation: recipient.affiliation,
      last_message_content: null,
      last_message_created_at: null,
      unread_count: 0,
    },
    isNew: true,
  };
}

/**
 * Retrieves all direct conversations for the authenticated user.
 */
export async function listUserConversations(currentUserId) {
  if (!currentUserId || !isValidUUID(currentUserId)) {
    throw createHttpError('Invalid user ID.', 400);
  }

  const conversations = await getUserConversations(currentUserId);
  return conversations;
}

/**
 * Retrieves message history for a conversation after verifying user participation.
 */
export async function getConversationHistory(conversationId, currentUserId, queryOptions = {}) {
  if (!isValidUUID(conversationId)) {
    throw createHttpError('Invalid conversation ID.', 400);
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw createHttpError('Conversation not found.', 404);
  }

  // Security authorization: Ensure requesting user is a participant
  const isParticipant = await isUserConversationParticipant(conversationId, currentUserId);
  if (!isParticipant) {
    throw createHttpError('Access denied: You are not a participant in this conversation.', 403);
  }

  // Automatically mark incoming unread messages as read
  await markMessagesAsRead(conversationId, currentUserId);

  // Get participants to provide the other user's info
  const participants = await getConversationParticipants(conversationId);
  const otherParticipant = participants.find((p) => p.user_id !== currentUserId) || null;

  // Pagination
  const { limit, offset } = validatePagination(queryOptions);
  const messages = await getConversationMessages(conversationId, { limit, offset });

  return {
    conversation,
    otherUser: otherParticipant
      ? {
          id: otherParticipant.user_id,
          full_name: otherParticipant.full_name,
          email: otherParticipant.email,
          role: otherParticipant.role,
          affiliation: otherParticipant.affiliation,
        }
      : null,
    messages,
  };
}

/**
 * Sends a direct message to a conversation after verifying user participation.
 */
export async function sendMessage(conversationId, currentUserId, content) {
  if (!isValidUUID(conversationId)) {
    throw createHttpError('Invalid conversation ID.', 400);
  }

  const contentValidation = validateMessageContent(content);
  if (!contentValidation.valid) {
    throw createHttpError(contentValidation.error, 400);
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw createHttpError('Conversation not found.', 404);
  }

  // Security authorization: Ensure sender is a participant in this conversation
  const isParticipant = await isUserConversationParticipant(conversationId, currentUserId);
  if (!isParticipant) {
    throw createHttpError('Access denied: You are not a participant in this conversation.', 403);
  }

  // Create message
  const message = await createDirectMessage({
    conversationId,
    senderId: currentUserId,
    content: contentValidation.sanitized,
  });

  // Notify other participant (fire-and-forget or non-blocking)
  try {
    const participants = await getConversationParticipants(conversationId);
    const recipient = participants.find((p) => p.user_id !== currentUserId);
    if (recipient) {
      const sender = participants.find((p) => p.user_id === currentUserId);
      const senderName = sender?.full_name || sender?.email || 'A user';
      const snippet =
        message.content.length > 80
          ? `${message.content.substring(0, 77)}...`
          : message.content;

      await notificationDispatcher({
        userId: recipient.user_id,
        type: 'DIRECT_MESSAGE',
        title: `New message from ${senderName}`,
        message: `${senderName}: "${snippet}"`,
        link: '/dashboard',
        data: {
          conversation_id: conversationId,
          sender_id: currentUserId,
          message_id: message.id,
        },
      });
    }
  } catch (notifErr) {
    // Non-fatal notification failure
    console.error('Failed to dispatch message notification:', notifErr.message);
  }

  return message;
}

/**
 * Searches users available to start a conversation with.
 */
export async function searchAvailableUsers(searchQuery, currentUserId) {
  if (!currentUserId || !isValidUUID(currentUserId)) {
    throw createHttpError('Invalid user ID.', 400);
  }

  const users = await searchUsers(searchQuery, currentUserId, 20);
  return users;
}
