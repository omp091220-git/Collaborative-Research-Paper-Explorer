/**
 * accessRequest.controller.js
 * HTTP handler for access request endpoints.
 */

import * as accessRequestService from '../services/accessRequest.service.js';
import * as accessRequestRepo from '../repositories/accessRequest.repository.js';
import { AccessRequestError } from '../services/accessRequest.service.js';

const handleServiceError = (err, res, next) => {
  if (err instanceof AccessRequestError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return next(err);
};

const isValidUUID = (val) =>
  typeof val === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

/**
 * POST /api/access-requests
 * Submit a new access request.
 */
export async function createRequest(req, res, next) {
  try {
    const { paper_id, requested_permission, reason } = req.body;

    if (!paper_id || !isValidUUID(paper_id)) {
      return res.status(400).json({ error: 'paper_id must be a valid UUID.' });
    }

    if (!requested_permission || typeof requested_permission !== 'string') {
      return res.status(400).json({ error: 'requested_permission is required.' });
    }

    const request = await accessRequestService.submitAccessRequest({
      paperId: paper_id,
      requestedPermission: requested_permission,
      reason,
      user: req.user,
    });

    return res.status(201).json({
      message: 'Access request submitted successfully.',
      request,
    });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
}

/**
 * GET /api/access-requests/my
 * List access requests submitted by authenticated user.
 */
export async function getMyRequests(req, res, next) {
  try {
    const { paper_id, status, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    if (paper_id && !isValidUUID(paper_id)) {
      return res.status(400).json({ error: 'paper_id must be a valid UUID.' });
    }

    const { requests, total } = await accessRequestRepo.findRequestsByRequester({
      requesterId: req.user.id,
      paperId: paper_id || null,
      status: status?.toUpperCase() || null,
      limit: limitNum,
      offset,
    });

    return res.status(200).json({
      requests,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
}

/**
 * GET /api/access-requests/received
 * List access requests received by the authenticated owner.
 */
export async function getReceivedRequests(req, res, next) {
  try {
    const { paper_id, status, permission, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    if (paper_id && !isValidUUID(paper_id)) {
      return res.status(400).json({ error: 'paper_id must be a valid UUID.' });
    }

    const { requests, total } = await accessRequestRepo.findRequestsForOwner({
      ownerId: req.user.id,
      paperId: paper_id || null,
      status: status?.toUpperCase() || null,
      requestedPermission: permission?.toUpperCase() || null,
      limit: limitNum,
      offset,
    });

    return res.status(200).json({
      requests,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
}

/**
 * GET /api/access-requests/:id
 * Retrieve a single request by ID.
 */
export async function getRequestById(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid request ID.' });
    }

    const request = await accessRequestRepo.findAccessRequestById(id);
    if (!request) {
      return res.status(404).json({ error: 'Access request not found.' });
    }

    // Requester, owner, or SYSTEM_ADMIN can view
    const isRequester = request.requester_id === req.user.id;
    const isOwner = request.owner_id === req.user.id;
    const isAdmin = req.user.role === 'SYSTEM_ADMIN' || req.user.role === 'SYSTEM ADMIN';

    if (!isRequester && !isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You are not authorized to view this request.' });
    }

    return res.status(200).json({ request });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
}

/**
 * POST /api/access-requests/:id/approve
 * Approve request and grant collaborator permission.
 */
export async function approveRequest(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid request ID.' });
    }

    const result = await accessRequestService.approveAccessRequest({
      requestId: id,
      user: req.user,
    });

    return res.status(200).json(result);
  } catch (err) {
    return handleServiceError(err, res, next);
  }
}

/**
 * POST /api/access-requests/:id/reject
 * Reject request with optional reason.
 */
export async function rejectRequest(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid request ID.' });
    }

    const { rejection_reason } = req.body;

    const result = await accessRequestService.rejectAccessRequest({
      requestId: id,
      rejectionReason: rejection_reason,
      user: req.user,
    });

    return res.status(200).json(result);
  } catch (err) {
    return handleServiceError(err, res, next);
  }
}

/**
 * POST /api/access-requests/:id/cancel
 * Cancel a pending request by the requester.
 */
export async function cancelRequest(req, res, next) {
  try {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid request ID.' });
    }

    const result = await accessRequestService.cancelAccessRequest({
      requestId: id,
      user: req.user,
    });

    return res.status(200).json({
      message: 'Access request cancelled successfully.',
      request: result,
    });
  } catch (err) {
    return handleServiceError(err, res, next);
  }
}
