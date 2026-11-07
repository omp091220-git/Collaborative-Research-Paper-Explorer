/**
 * Controller layer for FR-11 Paper Tag Assignments.
 * Handles HTTP request/response concerns and delegates to the service layer.
 */

import * as service from '../services/paperTagAssignment.service.js';
import { AssignmentError } from '../services/paperTagAssignment.service.js';
import {
  validateCreateAssignment,
  validateUUIDParam,
  parsePagination,
  isValidUUID,
} from '../utils/paperTagAssignmentValidation.js';

/**
 * Helper: sends a service-layer AssignmentError as an HTTP response.
 *
 * @param {unknown} error
 * @param {import('express').Response} res
 * @param {Function} next
 */
const handleError = (error, res, next) => {
  if (error instanceof AssignmentError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  return next(error);
};

// ---------------------------------------------------------------------------
// POST /api/paper-tags
// ---------------------------------------------------------------------------
/**
 * Creates a new tag assignment.
 *
 * Body:
 *   { paper_id: UUID, tag_id: UUID, annotation_id?: UUID|null }
 *
 * Authorization: RESEARCHER or SYSTEM_ADMIN.
 */
export const createAssignment = async (req, res, next) => {
  try {
    const validationError = validateCreateAssignment(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { paper_id, tag_id, annotation_id = null } = req.body;

    const assignment = await service.createAssignment({
      paperId: paper_id,
      tagId: tag_id,
      annotationId: annotation_id,
      assignedBy: req.user.id,
    });

    return res.status(201).json({
      message: 'Tag assignment created successfully.',
      assignment,
    });
  } catch (error) {
    return handleError(error, res, next);
  }
};

// ---------------------------------------------------------------------------
// GET /api/paper-tags/:id
// ---------------------------------------------------------------------------
/**
 * Retrieves a single assignment by its UUID.
 *
 * Authorization: any authenticated role.
 */
export const getAssignment = async (req, res, next) => {
  try {
    const paramError = validateUUIDParam(req.params.id, 'id');
    if (paramError) {
      return res.status(400).json({ error: paramError });
    }

    const assignment = await service.getAssignmentById(req.params.id);
    return res.status(200).json({ assignment });
  } catch (error) {
    return handleError(error, res, next);
  }
};

// ---------------------------------------------------------------------------
// GET /api/paper-tags/section/:sectionId
// GET /api/paper-tags/annotation/:annotationId
// ---------------------------------------------------------------------------
/**
 * Lists all tags assigned to a specific paper section / annotation.
 *
 * Authorization: any authenticated role.
 */
export const listTagsForSection = async (req, res, next) => {
  try {
    const targetId = req.params.sectionId || req.params.annotationId;
    const paramError = validateUUIDParam(targetId, 'sectionId');
    if (paramError) {
      return res.status(400).json({ error: paramError });
    }

    const tags = await service.listTagsForAnnotation(targetId);
    return res.status(200).json({ tags });
  } catch (error) {
    return handleError(error, res, next);
  }
};

// ---------------------------------------------------------------------------
// GET /api/paper-tags?paper_id=<UUID>[&annotation_id=<UUID>][&limit=N][&offset=N]
// GET /api/paper-tags/paper/:paperId
// ---------------------------------------------------------------------------
/**
 * Lists all tag assignments for a paper, optionally narrowed to one annotation.
 * Supports pagination via `limit` and `offset` query parameters.
 *
 * Authorization: any authenticated role.
 */
export const listAssignments = async (req, res, next) => {
  try {
    const paper_id = req.params.paperId || req.query.paper_id;

    if (!paper_id) {
      return res
        .status(400)
        .json({ error: 'paper_id is required.' });
    }
    if (!isValidUUID(paper_id)) {
      return res.status(400).json({ error: 'paper_id must be a valid UUID.' });
    }

    // annotation_id is optional; when supplied it must be a valid UUID
    let annotationFilter = undefined; // means "no filter" — return all
    const annotation_id = req.query.annotation_id;
    if (annotation_id !== undefined) {
      if (annotation_id === 'null' || annotation_id === '') {
        annotationFilter = null; // paper-level only
      } else {
        if (!isValidUUID(annotation_id)) {
          return res
            .status(400)
            .json({ error: 'annotation_id must be a valid UUID.' });
        }
        annotationFilter = annotation_id;
      }
    }

    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

    const result = await service.listAssignmentsForPaper({
      paperId: paper_id,
      annotationId: annotationFilter,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
};

// ---------------------------------------------------------------------------
// GET /api/paper-tags/by-tag/:tagId
// ---------------------------------------------------------------------------
/**
 * Lists all papers that have been assigned a given tag.
 *
 * Authorization: any authenticated role.
 */
export const listPapersByTag = async (req, res, next) => {
  try {
    const paramError = validateUUIDParam(req.params.tagId, 'tagId');
    if (paramError) {
      return res.status(400).json({ error: paramError });
    }

    const pagination = parsePagination(req.query);
    if (pagination.error) {
      return res.status(400).json({ error: pagination.error });
    }

    const papers = await service.listPapersForTag({
      tagId: req.params.tagId,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return res.status(200).json({ papers });
  } catch (error) {
    return handleError(error, res, next);
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/paper-tags/:id
// ---------------------------------------------------------------------------
/**
 * Removes a tag assignment by its UUID.
 *
 * Authorization:
 *   - SYSTEM_ADMIN: any assignment.
 *   - RESEARCHER:   own assignments only.
 *   - STUDENT:      not permitted (blocked at route level).
 */
export const deleteAssignment = async (req, res, next) => {
  try {
    const paramError = validateUUIDParam(req.params.id, 'id');
    if (paramError) {
      return res.status(400).json({ error: paramError });
    }

    const deleted = await service.deleteAssignment(req.params.id, {
      userId: req.user.id,
      role: req.user.role,
    });

    return res.status(200).json({
      message: 'Tag assignment removed successfully.',
      assignment: deleted,
    });
  } catch (error) {
    return handleError(error, res, next);
  }
};

// ---------------------------------------------------------------------------
// PUT /api/paper-tags/paper/:paperId
// ---------------------------------------------------------------------------
/**
 * Bulk updates/syncs tags for a given paper.
 * Body: { tag_ids: UUID[] }
 *
 * Authorization: RESEARCHER or SYSTEM_ADMIN.
 */
export const syncPaperTags = async (req, res, next) => {
  try {
    const paramError = validateUUIDParam(req.params.paperId, 'paperId');
    if (paramError) {
      return res.status(400).json({ error: paramError });
    }

    const { tag_ids } = req.body;
    if (!Array.isArray(tag_ids)) {
      return res.status(400).json({ error: 'tag_ids must be an array of UUIDs.' });
    }

    for (const tagId of tag_ids) {
      if (!isValidUUID(tagId)) {
        return res.status(400).json({ error: `Invalid tag ID: ${tagId}` });
      }
    }

    const result = await service.syncPaperTags({
      paperId: req.params.paperId,
      tagIds: tag_ids,
      userId: req.user.id,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleError(error, res, next);
  }
};

