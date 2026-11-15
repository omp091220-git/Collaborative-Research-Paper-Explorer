import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
  createGroup,
  getGroups,
  getGroup,
  searchUsers,
} from '../controllers/group.controller.js';

const router = Router();

// All group endpoints require an authenticated session
router.use(authenticateToken);

// Create a new group
router.post('/', createGroup);

// List groups (supports ?filter=all|my&search=...)
router.get('/', getGroups);

// Search users to add/invite to groups
router.get('/users', searchUsers);

// Retrieve details and member roster of a group
router.get('/:groupId', getGroup);

export default router;
