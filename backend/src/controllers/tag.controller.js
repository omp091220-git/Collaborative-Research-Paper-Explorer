import * as tagService from '../services/tag.service.js';
import {
  validateCreateTagPayload,
  validateUpdateTagPayload,
  isValidUUID,
} from '../utils/tagValidation.js';

/**
 * Controller: Create a new tag.
 * POST /api/tags
 */
export const createTag = async (req, res, next) => {
  try {
    const validation = validateCreateTagPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { name, slug, parentId, description } = validation.sanitized;
    const createdBy = req.user?.id || null;

    const tag = await tagService.createTag({
      name,
      slug,
      parentId,
      description,
      createdBy,
    });

    return res.status(201).json({
      message: 'Topic tag created successfully.',
      tag,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: List tags with filtering and pagination.
 * GET /api/tags
 */
export const listTags = async (req, res, next) => {
  try {
    const { parent_id, parentId, search, page, limit } = req.query;
    const filterParentId = parent_id !== undefined ? parent_id : parentId;

    const result = await tagService.listTags({
      parentId: filterParentId,
      search,
      page,
      limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Get a single tag by ID.
 * GET /api/tags/:id
 */
export const getTagById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tag = await tagService.getTagById(id);
    return res.status(200).json({ tag });
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Update a tag.
 * PATCH /api/tags/:id
 */
export const updateTag = async (req, res, next) => {
  try {
    const { id } = req.params;
    const validation = validateUpdateTagPayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const tag = await tagService.updateTag(id, validation.sanitized);
    return res.status(200).json({
      message: 'Topic tag updated successfully.',
      tag,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Delete a tag.
 * DELETE /api/tags/:id
 */
export const deleteTag = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await tagService.deleteTag(id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Get immediate children of a tag.
 * GET /api/tags/:id/children
 */
export const getChildren = async (req, res, next) => {
  try {
    const { id } = req.params;
    const children = await tagService.getChildren(id);
    return res.status(200).json({ children });
  } catch (error) {
    return next(error);
  }
};

/**
 * Controller: Get hierarchical tree/subtree.
 * GET /api/tags/:id/tree or GET /api/tags/tree
 */
export const getTree = async (req, res, next) => {
  try {
    const { id } = req.params;
    const tree = await tagService.getTagTree(id || null);
    return res.status(200).json({ tree });
  } catch (error) {
    return next(error);
  }
};
