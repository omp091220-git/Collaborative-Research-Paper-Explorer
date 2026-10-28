/**
 * Validation utilities for FR-11 Paper Tag Assignments.
 * All functions are pure and have no side effects.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Returns true when the value is a syntactically valid UUID v1–v8.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export const isValidUUID = (value) =>
  typeof value === 'string' && UUID_RE.test(value);

/**
 * Validates a Create Assignment payload.
 *
 * Required fields: paper_id, tag_id
 * Optional fields: annotation_id
 *
 * @param {object} body - Raw request body.
 * @returns {string|null} Error message, or null when valid.
 */
export const validateCreateAssignment = (body) => {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object.';
  }

  const { paper_id, tag_id, annotation_id } = body;

  if (!paper_id) {
    return 'paper_id is required.';
  }
  if (!isValidUUID(paper_id)) {
    return 'paper_id must be a valid UUID.';
  }

  if (!tag_id) {
    return 'tag_id is required.';
  }
  if (!isValidUUID(tag_id)) {
    return 'tag_id must be a valid UUID.';
  }

  if (annotation_id !== undefined && annotation_id !== null) {
    if (!isValidUUID(annotation_id)) {
      return 'annotation_id must be a valid UUID when provided.';
    }
  }

  return null;
};

/**
 * Validates a UUID path parameter (e.g., `:id`, `:paperId`).
 *
 * @param {unknown} value
 * @param {string}  paramName - Human-readable name for error messages.
 * @returns {string|null} Error message, or null when valid.
 */
export const validateUUIDParam = (value, paramName = 'id') => {
  if (!isValidUUID(value)) {
    return `${paramName} must be a valid UUID.`;
  }
  return null;
};

/**
 * Parses and validates pagination query parameters.
 *
 * @param {{ limit?: unknown, offset?: unknown }} query
 * @returns {{ limit: number, offset: number }|{ error: string }}
 */
export const parsePagination = (query = {}) => {
  let limit = 50;
  let offset = 0;

  if (query.limit !== undefined) {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
      return { error: 'limit must be an integer between 1 and 200.' };
    }
    limit = parsed;
  }

  if (query.offset !== undefined) {
    const parsed = Number(query.offset);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { error: 'offset must be a non-negative integer.' };
    }
    offset = parsed;
  }

  return { limit, offset };
};
