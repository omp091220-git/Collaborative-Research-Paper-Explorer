import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import { authorizeRoles } from '../middleware/authorize.js';
import { ROLES } from '../utils/roles.js';
import * as tagController from '../controllers/tag.controller.js';

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

const ADMIN_ROLE = [ROLES.SYSTEM_ADMIN];

// All tag routes require authentication
router.use(authenticateToken);

// Full hierarchy tree (placed before /:id to prevent matching 'tree' as an ID)
router.get(
  '/tree',
  authorizeRoles(...ALL_ROLES),
  tagController.getTree
);

// List tags with optional filtering and pagination
router.get(
  '/',
  authorizeRoles(...ALL_ROLES),
  tagController.listTags
);

// Create a new topic tag (root or child)
router.post(
  '/',
  authorizeRoles(...EDIT_ROLES),
  tagController.createTag
);

// Retrieve a single tag by ID with parent, children, ancestors, and canonical path
router.get(
  '/:id',
  authorizeRoles(...ALL_ROLES),
  tagController.getTagById
);

// Immediate children of a tag
router.get(
  '/:id/children',
  authorizeRoles(...ALL_ROLES),
  tagController.getChildren
);

// Subtree rooted at a specific tag
router.get(
  '/:id/tree',
  authorizeRoles(...ALL_ROLES),
  tagController.getTree
);

// Update tag properties or reparent tag
router.patch(
  '/:id',
  authorizeRoles(...EDIT_ROLES),
  tagController.updateTag
);

// Delete tag (only allowed if tag has no children)
router.delete(
  '/:id',
  authorizeRoles(...ADMIN_ROLE),
  tagController.deleteTag
);

export default router;
