import * as tagSuggestionService from '../services/tagSuggestion.service.js';
import * as tagSuggestionRepo from '../repositories/tagSuggestion.repository.js';
import { findPaperById } from '../repositories/paper.repository.js';

/**
 * POST /api/papers/:paperId/tag-suggestions/generate
 * Optional Body: { title?: string }
 */
export const generateSuggestions = async (req, res) => {
  try {
    const { paperId } = req.params;
    let paperTitle = req.body?.title;
    const createdBy = req.user?.id || req.body?.createdBy;

    if (!paperTitle) {
      const paper = await findPaperById(paperId);
      if (!paper) {
        return res.status(404).json({ error: 'Paper not found.' });
      }
      paperTitle = paper.title;
    }

    const suggestions = await tagSuggestionService.generateSuggestionsForPaper(paperId, paperTitle, createdBy);
    return res.status(201).json({ suggestions });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
};

/**
 * POST /api/papers/tag-suggestions/:id/accept
 * Body: { visibility?: 'PRIVATE' | 'GLOBAL' }
 */
export const acceptSuggestion = async (req, res) => {
  try {
    const { id } = req.params;
    const reviewerId = req.user?.id || req.body?.reviewerId;
    const visibility = req.body?.visibility || 'PRIVATE';
    const newTag = await tagSuggestionService.acceptSuggestion(id, reviewerId, visibility);
    return res.status(201).json({ tag: newTag });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
};

/**
 * POST /api/papers/tag-suggestions/:id/reject
 * Body: { reason?: string }
 */
export const rejectSuggestion = async (req, res) => {
  try {
    const { id } = req.params;
    const reviewerId = req.user?.id || req.body?.reviewerId;
    const reason = req.body?.reason || null;
    await tagSuggestionService.rejectSuggestion(id, reviewerId, reason);
    return res.status(204).send();
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
};

/**
 * GET /api/papers/:paperId/tag-suggestions
 * Optional query ?status=PENDING
 */
export const listSuggestions = async (req, res) => {
  try {
    const { paperId } = req.params;
    const { status } = req.query;
    const suggestions = await tagSuggestionRepo.listSuggestions(paperId, status);
    return res.json({ suggestions });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
};
