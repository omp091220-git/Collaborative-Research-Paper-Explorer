/**
 * Service layer for FR-11 Paper Tag Assignments.
 * Encapsulates business rules, existence checks, and authorization guards.
 */

import pool from '../config/database.js';
import * as repo from '../repositories/paperTagAssignment.repository.js';
import { notifyStarrersPaperTagChange } from './notification.service.js';

/**
 * Application-level error with an HTTP status code.
 */
export class AssignmentError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=400]
   */
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AssignmentError';
    this.statusCode = statusCode;
  }
}

/**
 * Creates a new tag assignment after verifying all referenced entities exist
 * and the combination is not a duplicate.
 *
 * Business rules:
 *   - paper_id must reference an existing paper.
 *   - tag_id must reference an existing topic tag.
 *   - When annotation_id is provided it must belong to the same paper.
 *   - Duplicate (paper_id, annotation_id, tag_id) is rejected with 409.
 *
 * @param {{ paperId: string, tagId: string, annotationId?: string|null, assignedBy?: string|null }} params
 * @returns {Promise<object>} Newly created assignment row.
 * @throws {AssignmentError}
 */
export const createAssignment = async ({
  paperId,
  tagId,
  annotationId = null,
  assignedBy = null,
}) => {
  // 1. Verify paper exists
  const paperOk = await repo.paperExists(paperId);
  if (!paperOk) {
    throw new AssignmentError('Paper not found.', 404);
  }

  // 2. Verify tag exists
  const tagOk = await repo.tagExists(tagId);
  if (!tagOk) {
    throw new AssignmentError('Topic tag not found.', 404);
  }

  // 3. When annotation_id is supplied verify it exists and belongs to the paper
  if (annotationId !== null) {
    const annot = await repo.findAnnotationById(annotationId);
    if (!annot) {
      throw new AssignmentError('Annotation not found.', 404);
    }
    if (annot.paper_id !== paperId) {
      throw new AssignmentError(
        'Annotation does not belong to the specified paper.',
        400
      );
    }
  }

  // 4. Duplicate check
  const existing = await repo.findDuplicateAssignment({
    paperId,
    tagId,
    annotationId,
  });
  if (existing) {
    throw new AssignmentError(
      'This tag is already assigned to the specified paper/annotation.',
      409
    );
  }

  const created = await repo.createAssignment({
    paperId,
    tagId,
    annotationId,
    assignedBy,
  });

  // Notify paper starrers of added tag
  try {
    let tagName = null;
    let canonicalPath = null;
    const tagRes = await pool.query('SELECT name, slug FROM topic_tags WHERE id = $1', [tagId]);
    if (tagRes.rows[0]?.name) {
      tagName = tagRes.rows[0].name;
      canonicalPath = tagRes.rows[0].slug;
    }
    let annotation = null;
    if (annotationId) {
      annotation = await repo.findAnnotationById(annotationId);
    }
    await notifyStarrersPaperTagChange({
      paperId,
      actorUser: { id: assignedBy },
      action: 'ADDED',
      tagName,
      tagId,
      canonicalPath,
      annotationId,
      annotation,
    });
  } catch (notifyErr) {
    console.error('Failed to dispatch tag added notification:', notifyErr.message);
  }

  return created;
};

/**
 * Retrieves a single assignment by ID, throwing 404 if not found.
 *
 * @param {string} id
 * @returns {Promise<object>}
 * @throws {AssignmentError}
 */
export const getAssignmentById = async (id) => {
  const assignment = await repo.findAssignmentById(id);
  if (!assignment) {
    throw new AssignmentError('Assignment not found.', 404);
  }
  return assignment;
};

/**
 * Lists tag assignments for a paper with optional annotation filter and pagination.
 *
 * @param {{ paperId: string, annotationId?: string|null, limit?: number, offset?: number }} params
 * @returns {Promise<{ assignments: object[], total: number, limit: number, offset: number }>}
 * @throws {AssignmentError}
 */
export const listAssignmentsForPaper = async ({
  paperId,
  annotationId = undefined,
  limit = 50,
  offset = 0,
}) => {
  // Verify paper exists so we can return 404 (not an empty list) for unknown papers
  const paperOk = await repo.paperExists(paperId);
  if (!paperOk) {
    throw new AssignmentError('Paper not found.', 404);
  }

  const [assignments, total] = await Promise.all([
    repo.listAssignmentsForPaper({ paperId, annotationId, limit, offset }),
    repo.countAssignmentsForPaper({ paperId, annotationId }),
  ]);

  return { assignments, total, limit, offset };
};

/**
 * Lists tags assigned to a specific annotation/section.
 *
 * @param {string} annotationId
 * @returns {Promise<object[]>}
 * @throws {AssignmentError}
 */
export const listTagsForAnnotation = async (annotationId) => {
  const annot = await repo.findAnnotationById(annotationId);
  if (!annot) {
    throw new AssignmentError('Annotation not found.', 404);
  }
  return repo.listTagsForAnnotation(annotationId);
};

/**
 * Lists papers that have been assigned a given tag.
 *
 * @param {{ tagId: string, limit?: number, offset?: number }} params
 * @returns {Promise<object[]>}
 * @throws {AssignmentError}
 */
export const listPapersForTag = async ({ tagId, limit = 50, offset = 0 }) => {
  const tagOk = await repo.tagExists(tagId);
  if (!tagOk) {
    throw new AssignmentError('Topic tag not found.', 404);
  }
  return repo.listPapersForTag({ tagId, limit, offset });
};

/**
 * Deletes an assignment by ID.
 *
 * Authorization rules (enforced by controller):
 *   - SYSTEM_ADMIN may delete any assignment.
 *   - RESEARCHER may delete only assignments they created.
 *   - STUDENT may not delete assignments.
 *
 * @param {string} id - Assignment UUID.
 * @param {{ userId: string, role: string }} caller
 * @returns {Promise<object>} The deleted assignment.
 * @throws {AssignmentError}
 */
export const deleteAssignment = async (id, { userId, role }) => {
  const assignment = await repo.findAssignmentById(id);
  if (!assignment) {
    throw new AssignmentError('Assignment not found.', 404);
  }

  const isAdmin = role === 'SYSTEM_ADMIN';
  const isOwner = assignment.assigned_by === userId;

  if (!isAdmin && !isOwner) {
    throw new AssignmentError(
      'Forbidden. You can only remove assignments you created.',
      403
    );
  }

  const deleted = await repo.deleteAssignment(id);

  // Notify paper starrers of removed tag
  try {
    await notifyStarrersPaperTagChange({
      paperId: assignment.paper_id,
      actorUser: { id: userId },
      action: 'REMOVED',
      tagName: assignment.tag_name,
      tagId: assignment.tag_id,
      annotationId: assignment.annotation_id,
    });
  } catch (notifyErr) {
    console.error('Failed to dispatch tag removed notification:', notifyErr.message);
  }

  return deleted;
};

/**
 * Synchronizes tags for a paper (bulk assignment/removal).
 * Computes difference: if same tags are submitted, does NOT generate notifications.
 *
 * @param {object} params
 * @param {string} params.paperId
 * @param {string[]} params.tagIds - Desired set of topic tag UUIDs
 * @param {string} params.userId
 * @returns {Promise<object>}
 */
export const syncPaperTags = async ({ paperId, tagIds, userId }) => {
  const paperOk = await repo.paperExists(paperId);
  if (!paperOk) {
    throw new AssignmentError('Paper not found.', 404);
  }

  // Fetch current paper-level assignments
  const currentResult = await pool.query(
    `SELECT pta.id, pta.tag_id, tt.name AS tag_name
     FROM paper_tag_assignments pta
     JOIN topic_tags tt ON tt.id = pta.tag_id
     WHERE pta.paper_id = $1 AND pta.annotation_id IS NULL`,
    [paperId]
  );

  const currentRows = currentResult.rows || [];
  const currentTagMap = new Map(currentRows.map((r) => [r.tag_id, r.tag_name]));
  const currentTagIds = new Set(currentTagMap.keys());
  const requestedTagIds = new Set(tagIds || []);

  const toAdd = [...requestedTagIds].filter((id) => !currentTagIds.has(id));
  const toRemove = [...currentTagIds].filter((id) => !requestedTagIds.has(id));

  // If no change, return without notifications
  if (toAdd.length === 0 && toRemove.length === 0) {
    return {
      message: 'No tag changes detected.',
      updated: false,
      tags: currentRows,
    };
  }

  // Verify all new tags exist
  if (toAdd.length > 0) {
    const validTagsRes = await pool.query(
      `SELECT id, name FROM topic_tags WHERE id = ANY($1::uuid[])`,
      [toAdd]
    );
    if ((validTagsRes.rows || []).length !== toAdd.length) {
      throw new AssignmentError('One or more specified topic tags do not exist.', 400);
    }
  }

  const addedTagNames = [];
  const removedTagNames = [];

  // Remove removed tags
  if (toRemove.length > 0) {
    for (const tagId of toRemove) {
      removedTagNames.push(currentTagMap.get(tagId) || 'tag');
      await pool.query(
        `DELETE FROM paper_tag_assignments
         WHERE paper_id = $1 AND tag_id = $2 AND annotation_id IS NULL`,
        [paperId, tagId]
      );
    }
  }

  // Add new tags
  if (toAdd.length > 0) {
    for (const tagId of toAdd) {
      const res = await pool.query(
        `INSERT INTO paper_tag_assignments (paper_id, tag_id, assigned_by)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [paperId, tagId, userId]
      );
      const tagInfo = await pool.query('SELECT name FROM topic_tags WHERE id = $1', [tagId]);
      addedTagNames.push(tagInfo.rows[0]?.name || 'tag');
    }
  }

  // Notify starrers with exact names of added and removed tags
  try {
    await notifyStarrersPaperTagChange({
      paperId,
      actorUser: { id: userId },
      action: 'BULK_UPDATE',
      addedTags: addedTagNames,
      removedTags: removedTagNames,
    });
  } catch (notifyErr) {
    console.error('Failed to notify starrers on bulk tag update:', notifyErr.message);
  }

  return {
    message: 'Paper tags synchronized successfully.',
    updated: true,
    added_tags: addedTagNames,
    removed_tags: removedTagNames,
  };
};
