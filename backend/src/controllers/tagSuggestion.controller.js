import * as tagSuggestionService from '../services/tagSuggestion.service.js';
import { TagError } from '../services/tag.service.js';
import * as tagSuggestionRepo from '../repositories/tagSuggestion.repository.js';

/**
 * POST /api/papers/:paperId/tag-suggestions/generate
 * Body: { title: string }
 */
export const generateSuggestions = async (req, res) => {
  try {
    const { paperId } = req.params;
    const { title, createdBy } = req.body; // createdBy is the user making request
    const suggestions = await tagSuggestionService.generateSuggestionsForPaper(paperId, title, createdBy);
    res.status(201).json({ suggestions });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
};

/**
 * POST /api/tag-suggestions/:id/accept
 * Body: { reviewerId, visibility }
 */
export const acceptSuggestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewerId, visibility } = req.body;
    const newTag = await tagSuggestionService.acceptSuggestion(id, reviewerId, visibility);
    res.status(201).json({ tag: newTag });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
};

/**
 * POST /api/tag-suggestions/:id/reject
 * Body: { reviewerId, reason }
 */
export const rejectSuggestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewerId, reason } = req.body;
    await tagSuggestionService.rejectSuggestion(id, reviewerId, reason);
    res.status(204).send();
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
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
    res.json({ suggestions });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
};
