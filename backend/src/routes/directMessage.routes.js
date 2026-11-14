import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
  initiateConversation,
  getUserConversations,
  getConversationMessages,
  postMessage,
  searchUsers,
} from '../controllers/directMessage.controller.js';

const router = express.Router();

// Enforce authentication on all direct messaging routes
router.use(authenticateToken);

// Search users to initiate a conversation with
router.get('/users', searchUsers);

// Retrieve conversations for current user
router.get('/conversations', getUserConversations);

// Initiate or retrieve conversation with another user
router.post('/conversations', initiateConversation);

// Retrieve message history for a specific conversation
router.get('/conversations/:conversationId/messages', getConversationMessages);

// Post a new direct message
router.post('/conversations/:conversationId/messages', postMessage);

export default router;
