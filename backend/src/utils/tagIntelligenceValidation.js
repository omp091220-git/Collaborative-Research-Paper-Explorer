import { isValidUUID, validateTagSlug } from './tagValidation.js';

/**
 * Validates the payload for checking duplicate/equivalent tags (FR-12).
 */
export const validateCheckDuplicatePayload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const { name, parentId, threshold, useGenAi } = body;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'Tag name is required and cannot be empty.' };
  }

  const trimmedName = name.trim();
  if (trimmedName.length > 100) {
    return { valid: false, error: 'Tag name must not exceed 100 characters.' };
  }

  let sanitizedParentId = null;
  if (parentId !== undefined && parentId !== null) {
    if (typeof parentId !== 'string' || !isValidUUID(parentId)) {
      return { valid: false, error: 'parentId must be a valid UUID or null.' };
    }
    sanitizedParentId = parentId;
  }

  let sanitizedThreshold = 0.75;
  if (threshold !== undefined && threshold !== null) {
    const num = Number(threshold);
    if (Number.isNaN(num) || num < 0 || num > 1) {
      return { valid: false, error: 'threshold must be a float between 0.0 and 1.0.' };
    }
    sanitizedThreshold = num;
  }

  return {
    valid: true,
    sanitized: {
      name: trimmedName,
      parentId: sanitizedParentId,
      threshold: sanitizedThreshold,
      useGenAi: useGenAi !== false,
    },
  };
};

/**
 * Validates the payload for tag consolidation / aliasing (FR-12).
 */
export const validateConsolidatePayload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const { sourceTagId, targetTagId, action = 'ALIAS' } = body;

  if (!sourceTagId || typeof sourceTagId !== 'string' || !isValidUUID(sourceTagId)) {
    return { valid: false, error: 'sourceTagId must be a valid UUID.' };
  }

  if (!targetTagId || typeof targetTagId !== 'string' || !isValidUUID(targetTagId)) {
    return { valid: false, error: 'targetTagId must be a valid UUID.' };
  }

  if (sourceTagId === targetTagId) {
    return { valid: false, error: 'sourceTagId and targetTagId cannot be the same tag.' };
  }

  const allowedActions = ['MERGE_AND_DELETE', 'ALIAS'];
  if (!allowedActions.includes(action)) {
    return {
      valid: false,
      error: `action must be one of: ${allowedActions.join(', ')}.`,
    };
  }

  return {
    valid: true,
    sanitized: {
      sourceTagId,
      targetTagId,
      action,
    },
  };
};

/**
 * Validates query parameters for hierarchical paper tag search (FR-13).
 */
export const validateTagSearchQuery = (query = {}) => {
  const { tagId, tag_id, tagSlug, tag_slug, scope = 'global', q, page = 1, limit = 20, includeSubtree = 'true' } = query;

  const resolvedTagId = tagId || tag_id;
  const resolvedTagSlug = tagSlug || tag_slug;

  if (!resolvedTagId && !resolvedTagSlug) {
    return { valid: false, error: 'Either tagId or tagSlug is required to search papers.' };
  }

  if (resolvedTagId && (!isValidUUID(resolvedTagId) || typeof resolvedTagId !== 'string')) {
    return { valid: false, error: 'tagId must be a valid UUID.' };
  }

  if (resolvedTagSlug && typeof resolvedTagSlug === 'string') {
    const slugValidation = validateTagSlug(resolvedTagSlug);
    if (!slugValidation.valid) {
      return { valid: false, error: `Invalid tagSlug: ${slugValidation.error}` };
    }
  }

  const normalizedScope = String(scope).toLowerCase();
  if (!['global', 'personal'].includes(normalizedScope)) {
    return { valid: false, error: "scope must be either 'global' or 'personal'." };
  }

  const parsedPage = parseInt(page, 10);
  if (Number.isNaN(parsedPage) || parsedPage < 1) {
    return { valid: false, error: 'page must be a positive integer.' };
  }

  const parsedLimit = parseInt(limit, 10);
  if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return { valid: false, error: 'limit must be an integer between 1 and 100.' };
  }

  const parsedIncludeSubtree = includeSubtree === true || includeSubtree === 'true' || includeSubtree === '1';

  return {
    valid: true,
    sanitized: {
      tagId: resolvedTagId || null,
      tagSlug: resolvedTagSlug ? String(resolvedTagSlug).trim().toLowerCase() : null,
      scope: normalizedScope,
      searchQuery: q && typeof q === 'string' ? q.trim() : null,
      page: parsedPage,
      limit: parsedLimit,
      includeSubtree: parsedIncludeSubtree,
    },
  };
};
