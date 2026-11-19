import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize.js';
import { ROLES } from '../utils/roles.js';
import * as tagSuggestionController from '../controllers/tagSuggestion.controller.js';

const router = express.Router({ mergeParams: true });

const ALL_ROLES = [
  ROLES.SYSTEM_ADMIN,
  ROLES.RESEARCHER,
  ROLES.STUDENT,
];

const EDIT_ROLES = [
  ROLES.SYSTEM_ADMIN,
  ROLES.RESEARCHER,
];

// All tag suggestion routes require authentication
router.use(authenticateToken);

// Generate suggestions for a paper (POST /api/papers/:paperId/tag-suggestions/generate)
router.post(
  '/:paperId/tag-suggestions/generate',
  authorizeRoles(...EDIT_ROLES),
  tagSuggestionController.generateSuggestions
);

// List suggestions for a paper (GET /api/papers/:paperId/tag-suggestions)
router.get(
  '/:paperId/tag-suggestions',
  authorizeRoles(...ALL_ROLES),
  tagSuggestionController.listSuggestions
);

// Accept a suggestion (POST /api/papers/tag-suggestions/:id/accept)
router.post(
  '/tag-suggestions/:id/accept',
  authorizeRoles(...EDIT_ROLES),
  tagSuggestionController.acceptSuggestion
);

// Reject a suggestion (POST /api/papers/tag-suggestions/:id/reject)
router.post(
  '/tag-suggestions/:id/reject',
  authorizeRoles(...EDIT_ROLES),
  tagSuggestionController.rejectSuggestion
);

export default router;
