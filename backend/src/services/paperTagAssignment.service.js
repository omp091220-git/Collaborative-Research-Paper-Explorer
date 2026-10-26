/**
 * Service layer for FR-11 Paper Tag Assignments.
 * Encapsulates business rules, existence checks, and authorization guards.
 */

import * as repo from '../repositories/paperTagAssignment.repository.js';

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

  return repo.createAssignment({ paperId, tagId, annotationId, assignedBy });
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

  return repo.deleteAssignment(id);
};
