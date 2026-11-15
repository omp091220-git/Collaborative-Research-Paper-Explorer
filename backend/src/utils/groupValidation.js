/**
 * Validation utilities for FR-32 Create Messaging Groups.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_GROUP_NAME_LENGTH = 100;
export const MIN_GROUP_NAME_LENGTH = 2;
export const MAX_GROUP_DESCRIPTION_LENGTH = 500;
export const MAX_INITIAL_MEMBERS = 50;

/**
 * Validates whether a value is a valid RFC-4122 compliant UUID.
 */
export function isValidUUID(value) {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
}

/**
 * Validates and sanitizes a group name.
 */
export function validateGroupName(name) {
  if (name === undefined || name === null) {
    return { valid: false, error: 'Group name is required.' };
  }

  if (typeof name !== 'string') {
    return { valid: false, error: 'Group name must be a string.' };
  }

  const trimmed = name.trim();

  if (trimmed.length < MIN_GROUP_NAME_LENGTH) {
    return {
      valid: false,
      error: `Group name must be at least ${MIN_GROUP_NAME_LENGTH} characters long.`,
    };
  }

  if (trimmed.length > MAX_GROUP_NAME_LENGTH) {
    return {
      valid: false,
      error: `Group name cannot exceed ${MAX_GROUP_NAME_LENGTH} characters.`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validates and sanitizes an optional group description.
 */
export function validateGroupDescription(description) {
  if (description === undefined || description === null || description === '') {
    return { valid: true, sanitized: null };
  }

  if (typeof description !== 'string') {
    return { valid: false, error: 'Group description must be a string.' };
  }

  const trimmed = description.trim();

  if (trimmed.length === 0) {
    return { valid: true, sanitized: null };
  }

  if (trimmed.length > MAX_GROUP_DESCRIPTION_LENGTH) {
    return {
      valid: false,
      error: `Group description cannot exceed ${MAX_GROUP_DESCRIPTION_LENGTH} characters.`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validates an optional list of initial member UUIDs.
 */
export function validateInitialMembers(memberIds, creatorId) {
  if (memberIds === undefined || memberIds === null) {
    return { valid: true, sanitized: [] };
  }

  if (!Array.isArray(memberIds)) {
    return { valid: false, error: 'initialMemberIds must be an array of user UUIDs.' };
  }

  if (memberIds.length > MAX_INITIAL_MEMBERS) {
    return {
      valid: false,
      error: `Cannot add more than ${MAX_INITIAL_MEMBERS} members at creation time.`,
    };
  }

  const sanitizedIds = new Set();
  const normalizedCreatorId = creatorId ? creatorId.trim().toLowerCase() : '';

  for (const id of memberIds) {
    if (typeof id !== 'string' || !isValidUUID(id)) {
      return {
        valid: false,
        error: `Invalid user ID "${id}" in initialMemberIds list.`,
      };
    }

    const trimmed = id.trim();
    // Exclude creator from initialMemberIds since creator is automatically assigned as OWNER
    if (trimmed.toLowerCase() !== normalizedCreatorId) {
      sanitizedIds.add(trimmed);
    }
  }

  return { valid: true, sanitized: Array.from(sanitizedIds) };
}

/**
 * Validates the full group creation payload.
 */
export function validateCreateGroupPayload(payload, creatorId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Payload must be a valid JSON object.' };
  }

  const nameVal = validateGroupName(payload.name);
  if (!nameVal.valid) {
    return nameVal;
  }

  const descVal = validateGroupDescription(payload.description);
  if (!descVal.valid) {
    return descVal;
  }

  const membersVal = validateInitialMembers(payload.initialMemberIds, creatorId);
  if (!membersVal.valid) {
    return membersVal;
  }

  return {
    valid: true,
    sanitized: {
      name: nameVal.sanitized,
      description: descVal.sanitized,
      initialMemberIds: membersVal.sanitized,
    },
  };
}
