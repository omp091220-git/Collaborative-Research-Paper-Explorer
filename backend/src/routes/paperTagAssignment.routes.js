import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize.js';
import { ROLES } from '../utils/roles.js';
import * as controller from '../controllers/paperTagAssignment.controller.js';

const router = express.Router();

const ALL_ROLES = [
  ROLES.SYSTEM_ADMIN,
  ROLES.RESEARCHER,
  ROLES.STUDENT,
];

const EDIT_ROLES = [
  ROLES.SYSTEM_ADMIN,
  ROLES.RESEARCHER,
];

// All paper-tag routes require authentication
router.use(authenticateToken);

// ---------------------------------------------------------------------------
// Tag Assignment CRUD & Query Endpoints
// ---------------------------------------------------------------------------

// Create a new tag assignment (paper-level or annotation-level)
router.post(
  '/',
  authorizeRoles(...EDIT_ROLES),
  controller.createAssignment
);

// List assignments by paper ID (RESTful path param)
router.get(
  '/paper/:paperId',
  authorizeRoles(...ALL_ROLES),
  controller.listAssignments
);

// List tags assigned to a specific section/annotation
router.get(
  '/section/:sectionId',
  authorizeRoles(...ALL_ROLES),
  controller.listTagsForSection
);

router.get(
  '/annotation/:annotationId',
  authorizeRoles(...ALL_ROLES),
  controller.listTagsForSection
);

// List papers assigned a specific tag
router.get(
  '/by-tag/:tagId',
  authorizeRoles(...ALL_ROLES),
  controller.listPapersByTag
);

// List assignments using query parameters (?paper_id=...&annotation_id=...)
router.get(
  '/',
  authorizeRoles(...ALL_ROLES),
  controller.listAssignments
);

// Retrieve a single assignment by ID
router.get(
  '/:id',
  authorizeRoles(...ALL_ROLES),
  controller.getAssignment
);

// Delete an assignment (Admin or creator)
router.delete(
  '/:id',
  authorizeRoles(...EDIT_ROLES),
  controller.deleteAssignment
);

// Bulk synchronize tags for a paper
router.put(
  '/paper/:paperId',
  authorizeRoles(...EDIT_ROLES),
  controller.syncPaperTags
);

export default router;
