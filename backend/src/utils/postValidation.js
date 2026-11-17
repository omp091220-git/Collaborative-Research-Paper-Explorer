/**
 * ============================================================================
 * Post & Account Validation Utilities
 * Feature: FR-25 - Account Type & Post Visibility
 * ============================================================================
 * Validates input payloads for post creation, updates, visibility settings,
 * and account privacy type modifications.
 */

const VALID_VISIBILITY_LEVELS = Object.freeze(["PUBLIC", "PRIVATE"]);
const VALID_ACCOUNT_TYPES = Object.freeze(["PUBLIC", "PRIVATE"]);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates post creation payload.
 *
 * @param {Object} input
 * @param {string} input.title - Title of the post.
 * @param {string} input.content - Body text of the post.
 * @param {string} [input.visibility='PUBLIC'] - Requested visibility ('PUBLIC' or 'PRIVATE').
 * @param {string[]} [input.tags=[]] - Optional array of topic tags.
 * @param {string|null} [input.paperId=null] - Optional UUID of linked paper.
 * @returns {{ isValid: boolean, errors: string[], sanitized: Object }}
 */
export const validateCreatePostInput = (input = {}) => {
  const errors = [];
  const sanitized = {};

  // 1. Validate Title
  if (!input.title || typeof input.title !== "string" || !input.title.trim()) {
    errors.push("Post title is required and must be a non-empty string.");
  } else {
    const trimmedTitle = input.title.trim();
    if (trimmedTitle.length < 3) {
      errors.push("Post title must be at least 3 characters long.");
    } else if (trimmedTitle.length > 255) {
      errors.push("Post title cannot exceed 255 characters.");
    }
    sanitized.title = trimmedTitle;
  }

  // 2. Validate Content
  if (!input.content || typeof input.content !== "string" || !input.content.trim()) {
    errors.push("Post content is required and must be a non-empty string.");
  } else {
    const trimmedContent = input.content.trim();
    if (trimmedContent.length < 5) {
      errors.push("Post content must be at least 5 characters long.");
    } else if (trimmedContent.length > 25000) {
      errors.push("Post content cannot exceed 25,000 characters.");
    }
    sanitized.content = trimmedContent;
  }

  // 3. Validate Visibility
  if (input.visibility !== undefined && input.visibility !== null) {
    const visUpper = String(input.visibility).trim().toUpperCase();
    if (!VALID_VISIBILITY_LEVELS.includes(visUpper)) {
      errors.push(`Invalid post visibility: '${input.visibility}'. Allowed values: ${VALID_VISIBILITY_LEVELS.join(", ")}.`);
    } else {
      sanitized.visibility = visUpper;
    }
  } else {
    sanitized.visibility = "PUBLIC";
  }

  // 4. Validate Paper ID (optional)
  if (input.paperId !== undefined && input.paperId !== null && input.paperId !== "") {
    if (typeof input.paperId !== "string" || !UUID_REGEX.test(input.paperId)) {
      errors.push("Invalid paperId format. Must be a valid UUID.");
    } else {
      sanitized.paperId = input.paperId;
    }
  } else {
    sanitized.paperId = null;
  }

  // 5. Validate Tags (optional)
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags)) {
      errors.push("Tags must be an array of strings.");
    } else {
      const sanitizedTags = [];
      for (const tag of input.tags) {
        if (typeof tag === "string" && tag.trim()) {
          const cleanTag = tag.trim().toLowerCase();
          if (cleanTag.length <= 50 && !sanitizedTags.includes(cleanTag)) {
            sanitizedTags.push(cleanTag);
          }
        }
      }
      if (sanitizedTags.length > 10) {
        errors.push("A post cannot have more than 10 tags.");
      }
      sanitized.tags = sanitizedTags;
    }
  } else {
    sanitized.tags = [];
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized,
  };
};

/**
 * Validates post update payload.
 *
 * @param {Object} input
 * @returns {{ isValid: boolean, errors: string[], sanitized: Object }}
 */
export const validateUpdatePostInput = (input = {}) => {
  const errors = [];
  const sanitized = {};

  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim()) {
      errors.push("Updated post title must be a non-empty string.");
    } else {
      const trimmedTitle = input.title.trim();
      if (trimmedTitle.length < 3) {
        errors.push("Post title must be at least 3 characters long.");
      } else if (trimmedTitle.length > 255) {
        errors.push("Post title cannot exceed 255 characters.");
      }
      sanitized.title = trimmedTitle;
    }
  }

  if (input.content !== undefined) {
    if (typeof input.content !== "string" || !input.content.trim()) {
      errors.push("Updated post content must be a non-empty string.");
    } else {
      const trimmedContent = input.content.trim();
      if (trimmedContent.length < 5) {
        errors.push("Post content must be at least 5 characters long.");
      } else if (trimmedContent.length > 25000) {
        errors.push("Post content cannot exceed 25,000 characters.");
      }
      sanitized.content = trimmedContent;
    }
  }

  if (input.visibility !== undefined) {
    const visUpper = String(input.visibility).trim().toUpperCase();
    if (!VALID_VISIBILITY_LEVELS.includes(visUpper)) {
      errors.push(`Invalid post visibility: '${input.visibility}'. Allowed values: ${VALID_VISIBILITY_LEVELS.join(", ")}.`);
    } else {
      sanitized.visibility = visUpper;
    }
  }

  if (input.paperId !== undefined) {
    if (input.paperId === null || input.paperId === "") {
      sanitized.paperId = null;
    } else if (typeof input.paperId !== "string" || !UUID_REGEX.test(input.paperId)) {
      errors.push("Invalid paperId format. Must be a valid UUID.");
    } else {
      sanitized.paperId = input.paperId;
    }
  }

  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags)) {
      errors.push("Tags must be an array of strings.");
    } else {
      const sanitizedTags = [];
      for (const tag of input.tags) {
        if (typeof tag === "string" && tag.trim()) {
          const cleanTag = tag.trim().toLowerCase();
          if (cleanTag.length <= 50 && !sanitizedTags.includes(cleanTag)) {
            sanitizedTags.push(cleanTag);
          }
        }
      }
      sanitized.tags = sanitizedTags;
    }
  }

  const hasUpdates = Object.keys(sanitized).length > 0;
  if (!hasUpdates && errors.length === 0) {
    errors.push("At least one valid field must be provided to update.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized,
  };
};

/**
 * Validates user account privacy type.
 *
 * @param {string} accountType
 * @returns {{ isValid: boolean, error?: string, sanitized?: 'PUBLIC' | 'PRIVATE' }}
 */
export const validateAccountTypeInput = (accountType) => {
  if (!accountType || typeof accountType !== "string") {
    return {
      isValid: false,
      error: "Account type is required and must be either 'PUBLIC' or 'PRIVATE'.",
    };
  }

  const upper = accountType.trim().toUpperCase();
  if (!VALID_ACCOUNT_TYPES.includes(upper)) {
    return {
      isValid: false,
      error: `Invalid account type: '${accountType}'. Allowed options are: ${VALID_ACCOUNT_TYPES.join(", ")}.`,
    };
  }

  return {
    isValid: true,
    sanitized: upper,
  };
};
