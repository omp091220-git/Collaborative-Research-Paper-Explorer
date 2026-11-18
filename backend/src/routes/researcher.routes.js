import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize.js';
import { ROLES } from '../utils/roles.js';
import * as controller from '../controllers/publicationDiscovery.controller.js';
import * as profileController from '../controllers/researcherProfile.controller.js';

const router = express.Router();

const ALL_ROLES = [
  ROLES.SYSTEM_ADMIN,
  ROLES.RESEARCHER,
  ROLES.STUDENT,
];

// All researcher routes require authentication
router.use(authenticateToken);

// FR-37 — Search researchers by name
// GET /api/researchers/search?q=<name>&limit=20
router.get(
  '/search',
  authorizeRoles(...ALL_ROLES),
  profileController.searchResearchers
);

// FR-38 — Get a researcher's public profile
// GET /api/researchers/:id/profile
router.get(
  '/:id/profile',
  authorizeRoles(...ALL_ROLES),
  profileController.getResearcherProfile
);

// Trigger external discovery across arXiv & CrossRef (FR-39)
router.post(
  '/:id/publications/discover',
  authorizeRoles(...ALL_ROLES),
  controller.discoverPublications
);

// Get current researcher publications (FR-39 / FR-38 profile view)
router.get(
  '/:id/publications',
  authorizeRoles(...ALL_ROLES),
  controller.getPublications
);

export default router;
