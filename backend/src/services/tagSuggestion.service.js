import * as tagSuggestionRepo from '../repositories/tagSuggestion.repository.js';
import * as tagRepo from '../repositories/tag.repository.js';
import * as dedupService from './tagDeduplication.service.js';
import { TagError } from './tag.service.js';

/**
 * Generate tag suggestions for a paper.
 * This is a simplified placeholder that extracts nouns from the paper title
 * (real implementation would use a LLM or more complex heuristics).
 */
export const generateSuggestionsForPaper = async (paperId, paperTitle, createdBy, client = null) => {
  // Very naive token extraction – split on whitespace, lowercase, remove punctuation
  const tokens = paperTitle
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  // Create a set of candidate tags (unique tokens)
  const candidateNames = Array.from(new Set(tokens));

  const suggestions = [];
  for (const name of candidateNames) {
    const suggestedSlug = name.replace(/_/g, '-');
    // Run deduplication to see if a similar tag already exists (global + user's private)
    const duplicateInfo = await dedupService.checkTagDeduplication({
      name,
      slug: suggestedSlug,
      userId: createdBy,
    });
    const status = duplicateInfo.isDuplicate ? 'POTENTIAL_DUPLICATE' : 'CLEAN';
    const matchedTagId = duplicateInfo.matchedTag?.id || null;
    const similarityScore = duplicateInfo.score || null;

    const suggestion = await tagSuggestionRepo.createSuggestion({
      paperId,
      suggestedName: name,
      suggestedSlug,
      suggestedParentId: null,
      visibilityPreference: 'PRIVATE', // default to private; UI can change
      confidence: duplicateInfo.confidence || 0.5,
      reasoning: duplicateInfo.reason || null,
    }, client);

    // Update with deduplication metadata
    await tagSuggestionRepo.updateSuggestion(suggestion.id, {
      duplicate_check_status: status,
      matched_tag_id: matchedTagId,
      similarity_score: similarityScore,
    }, client);

    suggestions.push({ ...suggestion, duplicate_check_status: status, matched_tag_id: matchedTagId, similarity_score: similarityScore });
  }

  return suggestions;
};

/**
 * Accept a suggestion – creates the actual tag (private or global depending on visibility).
 */
export const acceptSuggestion = async (suggestionId, reviewerId, visibility = 'PRIVATE', client = null) => {
  const suggestion = await tagSuggestionRepo.findSuggestionById(suggestionId, client);
  if (!suggestion) {
    throw new TagError('Suggestion not found.', 404);
  }
  if (suggestion.status !== 'PENDING') {
    throw new TagError('Suggestion is not pending.', 400);
  }

  // Create the real tag using tag.service (which already enforces privacy rules)
  const { createTag } = await import('./tag.service.js');
  const newTag = await createTag({
    name: suggestion.suggested_name,
    slug: suggestion.suggested_slug,
    parentId: suggestion.suggested_parent_id,
    description: suggestion.reasoning,
    createdBy: visibility === 'PRIVATE' ? reviewerId : null,
    isPrivate: visibility === 'PRIVATE',
  });

  // Mark suggestion as accepted
  await tagSuggestionRepo.updateSuggestion(suggestionId, { status: 'ACCEPTED', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }, client);
  return newTag;
};

/**
 * Reject a suggestion.
 */
export const rejectSuggestion = async (suggestionId, reviewerId, reason = null, client = null) => {
  const suggestion = await tagSuggestionRepo.findSuggestionById(suggestionId, client);
  if (!suggestion) {
    throw new TagError('Suggestion not found.', 404);
  }
  await tagSuggestionRepo.updateSuggestion(suggestionId, {
    status: 'REJECTED',
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    rejection_reason: reason,
  }, client);
  return true;
};
