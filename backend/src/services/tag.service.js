import * as tagRepo from '../repositories/tag.repository.js';
import { isValidUUID, generateSlug, validateTagSlug } from '../utils/tagValidation.js';

/**
 * Custom application error with HTTP status code.
 */
export class TagError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TagError';
    this.statusCode = statusCode;
  }
}

/**
 * Builds a nested tree structure from a flat array of nodes with depth and parent_id.
 */
export const buildNestedTree = (nodes) => {
  const nodeMap = new Map();
  const roots = [];

  for (const node of nodes) {
    nodeMap.set(node.id, {
      id: node.id,
      name: node.name,
      slug: node.slug,
      parentId: node.parent_id,
      description: node.description,
      canonicalPath: node.canonical_path,
      depth: node.depth,
      createdAt: node.created_at,
      updatedAt: node.updated_at,
      children: [],
    });
  }

  for (const node of nodes) {
    const treeNode = nodeMap.get(node.id);
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id).children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }

  return roots;
};

/**
 * Service: Create a new tag (root or child).
 */
export const createTag = async ({
  name,
  slug,
  parentId = null,
  description = null,
  createdBy = null,
}) => {
  const effectiveSlug = slug ? slug.trim().toLowerCase() : generateSlug(name);
  if (!effectiveSlug) {
    throw new TagError('Tag slug cannot be empty.', 400);
  }

  const slugValidation = validateTagSlug(effectiveSlug);
  if (!slugValidation.valid) {
    throw new TagError(slugValidation.error, 400);
  }

  if (parentId) {
    if (!isValidUUID(parentId)) {
      throw new TagError('parentId must be a valid UUID.', 400);
    }
    const parent = await tagRepo.findTagById(parentId);
    if (!parent) {
      throw new TagError('Parent tag does not exist.', 404);
    }
  }

  // Pre-check for duplicate sibling / root slug to return a clear 409
  const existing = await tagRepo.findTagBySlugAndParent(effectiveSlug, parentId);
  if (existing) {
    const scope = parentId ? 'under this parent tag' : 'at root level';
    throw new TagError(
      `A tag with slug '${effectiveSlug}' already exists ${scope}.`,
      409
    );
  }

  try {
    const created = await tagRepo.createTag({
      name,
      slug: effectiveSlug,
      parentId,
      description,
      createdBy,
    });

    // Return complete representation including canonical path
    return await tagRepo.findTagById(created.id);
  } catch (error) {
    if (error.code === '23505') {
      const scope = parentId ? 'under this parent tag' : 'at root level';
      throw new TagError(
        `A tag with slug '${slug}' already exists ${scope}.`,
        409
      );
    }
    if (error.code === '23503') {
      throw new TagError('Referenced parent tag does not exist.', 404);
    }
    if (error.code === '23514') {
      throw new TagError(`Constraint validation failed: ${error.message}`, 400);
    }
    throw error;
  }
};

/**
 * Service: Retrieve tag by ID.
 */
export const getTagById = async (id) => {
  if (!isValidUUID(id)) {
    throw new TagError('Tag ID must be a valid UUID.', 400);
  }

  const tag = await tagRepo.findTagById(id);
  if (!tag) {
    throw new TagError('Tag not found.', 404);
  }

  const children = await tagRepo.getChildren(id);
  return {
    ...tag,
    children,
  };
};

/**
 * Service: List tags with filtering and pagination.
 */
export const listTags = async ({
  parentId,
  search,
  page = 1,
  limit = 50,
}) => {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (parsedPage - 1) * parsedLimit;

  if (parentId !== undefined && parentId !== null && parentId !== 'root') {
    if (!isValidUUID(parentId)) {
      throw new TagError('parentId must be a valid UUID or "root".', 400);
    }
  }

  const [tags, total] = await Promise.all([
    tagRepo.listTags({
      parentId,
      search,
      limit: parsedLimit,
      offset,
    }),
    tagRepo.countTags({
      parentId,
      search,
    }),
  ]);

  const totalPages = Math.ceil(total / parsedLimit);

  return {
    tags,
    pagination: {
      total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      hasNext: parsedPage < totalPages,
      hasPrev: parsedPage > 1,
    },
  };
};

/**
 * Service: Update tag properties or reparent tag.
 */
export const updateTag = async (id, updates) => {
  if (!isValidUUID(id)) {
    throw new TagError('Tag ID must be a valid UUID.', 400);
  }

  const existing = await tagRepo.findTagById(id);
  if (!existing) {
    throw new TagError('Tag not found.', 404);
  }

  const targetParentId =
    updates.parentId !== undefined ? updates.parentId : existing.parent_id;
  const targetSlug = updates.slug !== undefined ? updates.slug : existing.slug;

  // 1. Cannot assign self as parent
  if (targetParentId && targetParentId === id) {
    throw new TagError('A tag cannot be its own parent.', 400);
  }

  // 2. If parentId is changing, validate existence and check for circular hierarchy
  if (updates.parentId !== undefined && updates.parentId !== existing.parent_id) {
    if (updates.parentId !== null) {
      const targetParent = await tagRepo.findTagById(updates.parentId);
      if (!targetParent) {
        throw new TagError('Target parent tag does not exist.', 404);
      }

      // Check circular hierarchy: targetParent must not be a descendant of this tag
      const circular = await tagRepo.isDescendant(id, updates.parentId);
      if (circular) {
        throw new TagError(
          'Circular hierarchy detected: cannot move a tag beneath one of its descendants.',
          409
        );
      }
    }
  }

  // 3. Sibling slug collision check if slug or parentId changes
  if (
    (updates.slug !== undefined && updates.slug !== existing.slug) ||
    (updates.parentId !== undefined && updates.parentId !== existing.parent_id)
  ) {
    const siblingCollision = await tagRepo.findTagBySlugAndParent(
      targetSlug,
      targetParentId
    );
    if (siblingCollision && siblingCollision.id !== id) {
      const scope = targetParentId
        ? 'under the target parent tag'
        : 'at root level';
      throw new TagError(
        `A tag with slug '${targetSlug}' already exists ${scope}.`,
        409
      );
    }
  }

  const repoPayload = {};
  if (updates.name !== undefined) repoPayload.name = updates.name;
  if (updates.slug !== undefined) repoPayload.slug = updates.slug;
  if (updates.parentId !== undefined) repoPayload.parent_id = updates.parentId;
  if (updates.description !== undefined) repoPayload.description = updates.description;

  try {
    const updated = await tagRepo.updateTag(id, repoPayload);
    return updated;
  } catch (error) {
    if (error.code === '23505') {
      throw new TagError(
        `A tag with slug '${targetSlug}' already exists under the target parent.`,
        409
      );
    }
    if (error.code === '23503') {
      throw new TagError('Referenced parent tag does not exist.', 404);
    }
    if (error.code === '23514') {
      throw new TagError(`Constraint validation failed: ${error.message}`, 400);
    }
    throw error;
  }
};

/**
 * Service: Delete tag safely (blocked if child tags exist).
 */
export const deleteTag = async (id) => {
  if (!isValidUUID(id)) {
    throw new TagError('Tag ID must be a valid UUID.', 400);
  }

  const existing = await tagRepo.findTagById(id);
  if (!existing) {
    throw new TagError('Tag not found.', 404);
  }

  const childCount = await tagRepo.countChildren(id);
  if (childCount > 0) {
    throw new TagError(
      `Cannot delete tag '${existing.name}' because it has ${childCount} child tag(s). Delete or move child tags first.`,
      409
    );
  }

  try {
    const deleted = await tagRepo.deleteTag(id);
    return {
      message: 'Tag deleted successfully.',
      id: deleted.id,
      name: deleted.name,
      slug: deleted.slug,
    };
  } catch (error) {
    if (error.code === '23503') {
      throw new TagError(
        'Cannot delete tag because it is referenced by other resources.',
        409
      );
    }
    throw error;
  }
};

/**
 * Service: Get immediate children of a tag.
 */
export const getChildren = async (parentId = null) => {
  if (parentId !== null) {
    if (!isValidUUID(parentId)) {
      throw new TagError('parentId must be a valid UUID.', 400);
    }
    const parent = await tagRepo.findTagById(parentId);
    if (!parent) {
      throw new TagError('Parent tag not found.', 404);
    }
  }

  return await tagRepo.getChildren(parentId);
};

/**
 * Service: Get subtree or full hierarchy tree.
 */
export const getTagTree = async (rootId = null) => {
  if (rootId !== null) {
    if (!isValidUUID(rootId)) {
      throw new TagError('Tag ID must be a valid UUID.', 400);
    }
    const tag = await tagRepo.findTagById(rootId);
    if (!tag) {
      throw new TagError('Tag not found.', 404);
    }
  }

  const rows = await tagRepo.getSubtreeRows(rootId);
  return buildNestedTree(rows);
};
