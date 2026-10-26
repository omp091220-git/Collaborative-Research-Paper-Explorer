import * as service from '../services/tagIntelligence.service.js';
import {
  validateCheckDuplicatePayload,
  validateConsolidatePayload,
  validateTagSearchQuery,
} from '../utils/tagIntelligenceValidation.js';

/**
 * Controller: Check for duplicate / equivalent tags using Agentic AI (FR-12).
 * POST /api/tags/check-duplicate
 */
export const checkDuplicateTag = async (req, res, next) => {
  try {
    const validation = validateCheckDuplicatePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { name, parentId, threshold, useGenAi } = validation.sanitized;
    const result = await service.checkDuplicateTag({
      name,
      parentId,
      threshold,
      useGenAi,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Consolidate or alias duplicate tags (FR-12).
 * POST /api/tags/consolidate
 */
export const consolidateTag = async (req, res, next) => {
  try {
    const validation = validateConsolidatePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { sourceTagId, targetTagId, action } = validation.sanitized;
    const userId = req.user?.id || null;

    const result = await service.consolidateTags({
      sourceTagId,
      targetTagId,
      action,
      userId,
    });

    return res.status(200).json({
      message: 'Topic tags consolidated successfully.',
      ...result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Search and filter papers by hierarchical topic tags (FR-13).
 * GET /api/tags/search/papers
 */
export const searchPapersByTag = async (req, res, next) => {
  try {
    const validation = validateTagSearchQuery(req.query);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { tagId, tagSlug, scope, searchQuery, page, limit, includeSubtree } =
      validation.sanitized;
    const userId = req.user?.id || null;

    const result = await service.searchPapersByHierarchicalTag({
      tagId,
      tagSlug,
      scope,
      userId,
      searchQuery,
      page,
      limit,
      includeSubtree,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};
