import { Router } from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
  createGroup,
  getGroups,
  getGroup,
  searchUsers,
  joinGroup,
  leaveGroup,
  reviewJoinRequest,
  sendGroupMessage,
  getGroupMessages,
} from '../controllers/group.controller.js';

const router = Router();

// All group endpoints require an authenticated session
router.use(authenticateToken);

// Search users to add or invite. Registered before /:id.
router.get('/users', searchUsers);

// Create and list groups (list supports ?filter=all|my&search=...)
router.get('/', getGroups);
router.post('/', createGroup);

// FR-34: Group messaging for approved members
router.get('/:id/messages', getGroupMessages);
router.post('/:id/messages', sendGroupMessage);

// FR-33: Join, leave, and admin approval
router.post('/:id/join', joinGroup);
router.post('/:id/leave', leaveGroup);
router.post('/:id/members/:userId/review', reviewJoinRequest);

// Group details and member roster
router.get('/:id', getGroup);

export default router;
