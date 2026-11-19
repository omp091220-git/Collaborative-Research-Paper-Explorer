import api from '../api.js';

/**
 * Fetch suggestions for a paper.
 */
export const getTagSuggestions = async (paperId, status = 'PENDING') => {
  const params = status ? { status } : {};
  const res = await api.get(`/api/papers/${paperId}/tag-suggestions`, { params });
  return res.data;
};

/**
 * Generate suggestions (POST) – optionally passes title.
 */
export const generateTagSuggestions = async (paperId, title = '') => {
  const payload = title ? { title } : {};
  const res = await api.post(`/api/papers/${paperId}/tag-suggestions/generate`, payload);
  return res.data;
};

/**
 * Accept a suggestion.
 */
export const acceptSuggestion = async (suggestionId, visibility = 'PRIVATE') => {
  const res = await api.post(`/api/papers/tag-suggestions/${suggestionId}/accept`, {
    visibility,
  });
  return res.data;
};

/**
 * Reject a suggestion.
 */
export const rejectSuggestion = async (suggestionId, reason = 'Not needed') => {
  await api.post(`/api/papers/tag-suggestions/${suggestionId}/reject`, {
    reason,
  });
};
