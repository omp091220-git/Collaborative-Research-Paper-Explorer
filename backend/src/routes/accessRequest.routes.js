/**
 * accessRequest.routes.js
 * Endpoints for managing paper access requests.
 */

import express from 'express';
import { authenticateToken } from '../middleware/authenticate.js';
import {
  createRequest,
  getMyRequests,
  getReceivedRequests,
  getRequestById,
  approveRequest,
  rejectRequest,
  cancelRequest,
} from '../controllers/accessRequest.controller.js';

const router = express.Router();

router.use(authenticateToken);

// POST /api/access-requests - Submit access request
router.post('/', createRequest);

// GET /api/access-requests/my - List requests submitted by user
router.get('/my', getMyRequests);

// GET /api/access-requests/received - List requests received by owner
router.get('/received', getReceivedRequests);

// GET /api/access-requests/:id - Get request by ID
router.get('/:id', getRequestById);

// POST /api/access-requests/:id/approve - Approve request
router.post('/:id/approve', approveRequest);

// POST /api/access-requests/:id/reject - Reject request
router.post('/:id/reject', rejectRequest);

// POST /api/access-requests/:id/cancel - Cancel request (requester only)
router.post('/:id/cancel', cancelRequest);
router.delete('/:id', cancelRequest);

export default router;
