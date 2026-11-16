import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import * as groupController from '../controllers/group.controller.js';

const router = express.Router();

// Enforce authentication on all group endpoints
router.use(authenticateToken);

// FR-33: Group Discovery & Creation
router.get('/', groupController.listGroups);
router.post('/', groupController.createGroup);
router.get('/:id', groupController.getGroupDetails);

// FR-33: Join, Leave, and Admin Approval Rules
router.post('/:id/join', groupController.joinGroup);
router.post('/:id/leave', groupController.leaveGroup);
router.post('/:id/members/:userId/review', groupController.reviewJoinRequest);

// FR-34: Group Messaging (Access restricted to approved members)
router.get('/:id/messages', groupController.getGroupMessages);
router.post('/:id/messages', groupController.sendGroupMessage);

export default router;
