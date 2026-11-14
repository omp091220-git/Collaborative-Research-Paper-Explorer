import api from '../api.js';

/**
 * Fetch suggestions for a paper.
 */
export const getTagSuggestions = async (paperId) => {
  const res = await api.get(`/api/papers/${paperId}/tag-suggestions`);
  return res.data;
};

/**
 * Generate suggestions (POST) – expects title and createdBy.
 */
export const generateTagSuggestions = async (paperId, title, createdBy) => {
  const res = await api.post(`/api/papers/${paperId}/tag-suggestions/generate`, {
    title,
    createdBy,
  });
  return res.data;
};

/**
 * Accept a suggestion.
 */
export const acceptSuggestion = async (suggestionId, reviewerId, visibility) => {
  await api.post(`/api/tag-suggestions/${suggestionId}/accept`, {
    reviewerId,
    visibility,
  });
};

/**
 * Reject a suggestion.
 */
export const rejectSuggestion = async (suggestionId, reviewerId, reason) => {
  await api.post(`/api/tag-suggestions/${suggestionId}/reject`, {
    reviewerId,
    reason,
  });
};
