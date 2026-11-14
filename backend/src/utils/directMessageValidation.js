/**
 * Validation utilities for FR-31 One-to-One Direct Messaging.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_MESSAGE_LENGTH = 5000;

/**
 * Validates whether a value is a valid RFC-4122 compliant UUID.
 */
export function isValidUUID(value) {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
}

/**
 * Validates and sanitizes message content string.
 */
export function validateMessageContent(content) {
  if (content === undefined || content === null) {
    return { valid: false, error: 'Message content is required.' };
  }

  if (typeof content !== 'string') {
    return { valid: false, error: 'Message content must be a string.' };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Message content cannot be empty.' };
  }

  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      valid: false,
      error: `Message content cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validates payload for creating / initiating a direct conversation.
 */
export function validateCreateConversationPayload(payload, currentUserId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Payload must be a valid JSON object.' };
  }

  const { recipientId } = payload;

  if (!recipientId) {
    return { valid: false, error: 'recipientId is required.' };
  }

  if (!isValidUUID(recipientId)) {
    return { valid: false, error: 'recipientId must be a valid UUID.' };
  }

  if (currentUserId && recipientId.trim() === currentUserId.trim()) {
    return {
      valid: false,
      error: 'You cannot start a direct message conversation with yourself.',
    };
  }

  return {
    valid: true,
    sanitized: {
      recipientId: recipientId.trim(),
    },
  };
}

/**
 * Validates payload for sending a direct message.
 */
export function validateSendMessagePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Payload must be a valid JSON object.' };
  }

  const contentValidation = validateMessageContent(payload.content);
  if (!contentValidation.valid) {
    return contentValidation;
  }

  return {
    valid: true,
    sanitized: {
      content: contentValidation.sanitized,
    },
  };
}

/**
 * Validates pagination options for message history.
 */
export function validatePagination(query = {}) {
  let limit = parseInt(query.limit, 10);
  if (Number.isNaN(limit) || limit < 1) {
    limit = 50;
  } else if (limit > 100) {
    limit = 100;
  }

  let offset = parseInt(query.offset, 10);
  if (Number.isNaN(offset) || offset < 0) {
    offset = 0;
  }

  return { limit, offset };
}
