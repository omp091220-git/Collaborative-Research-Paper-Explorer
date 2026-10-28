import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize.js';
import { ROLES } from '../utils/roles.js';
import * as recController from '../controllers/recommendation.controller.js';

const router = express.Router();

const ALL_ROLES = [
  ROLES.SYSTEM_ADMIN,
  ROLES.RESEARCHER,
  ROLES.STUDENT,
];

// All recommendation routes require authenticated session
router.use(authenticateToken);

// Seed sample papers with sections and tags for testing/demo
router.post(
  '/seed-sample',
  authorizeRoles(...ALL_ROLES),
  recController.seedSampleData
);

// Get ranked AI recommendations for ad-hoc section text or tags
router.post(
  '/section',
  authorizeRoles(...ALL_ROLES),
  recController.getSectionRecommendations
);

// Get ranked AI recommendations for a specific research paper
router.get(
  '/papers/:id',
  authorizeRoles(...ALL_ROLES),
  recController.getPaperRecommendations
);

export default router;
