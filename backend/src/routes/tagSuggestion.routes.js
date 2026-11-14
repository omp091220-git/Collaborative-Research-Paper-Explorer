import express from 'express';
import * as tagSuggestionController from '../controllers/tagSuggestion.controller.js';

const router = express.Router({ mergeParams: true });

// Generate suggestions for a paper (POST /api/papers/:paperId/tag-suggestions/generate)
router.post('/:paperId/tag-suggestions/generate', tagSuggestionController.generateSuggestions);

// List suggestions for a paper
router.get('/:paperId/tag-suggestions', tagSuggestionController.listSuggestions);

// Accept a suggestion
router.post('/tag-suggestions/:id/accept', tagSuggestionController.acceptSuggestion);

// Reject a suggestion
router.post('/tag-suggestions/:id/reject', tagSuggestionController.rejectSuggestion);

export default router;
