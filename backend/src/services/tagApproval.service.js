import * as tagRepo from '../repositories/tag.repository.js';
import { TagError } from './tag.service.js';

/**
 * Approve a pending global tag.
 * @param {string} tagId - UUID of the tag to approve.
 * @param {string} reviewerId - UUID of the researcher or admin performing approval.
 */
export const approveGlobalTag = async (tagId, reviewerId) => {
  // Verify tag exists and is pending approval
  const tag = await tagRepo.findTagById(tagId);
  if (!tag) {
    throw new TagError('Tag not found.', 404);
  }
  if (tag.status !== 'PENDING_APPROVAL') {
    throw new TagError('Tag is not pending approval.', 400);
  }
  // Only global tags can be approved
  if (tag.is_private) {
    throw new TagError('Private tags do not require approval.', 400);
  }

  const result = await tagRepo.updateTag(tagId, {
    status: 'APPROVED',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  });
  return result;
};

/**
 * Reject a pending global tag.
 * @param {string} tagId - UUID of the tag to reject.
 * @param {string} reviewerId - UUID of the reviewer.
 * @param {string} reason - Optional textual reason for rejection.
 */
export const rejectGlobalTag = async (tagId, reviewerId, reason = null) => {
  const tag = await tagRepo.findTagById(tagId);
  if (!tag) {
    throw new TagError('Tag not found.', 404);
  }
  if (tag.status !== 'PENDING_APPROVAL') {
    throw new TagError('Tag is not pending approval.', 400);
  }
  if (tag.is_private) {
    throw new TagError('Private tags cannot be rejected via approval flow.', 400);
  }

  const result = await tagRepo.updateTag(tagId, {
    status: 'REJECTED',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    rejection_reason: reason,
  });
  return result;
};
