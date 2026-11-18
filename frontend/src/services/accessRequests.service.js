import api from './api';

export const accessRequestsService = {
  /**
   * Submit an access request for VIEW, ANNOTATE, or EDIT permission.
   */
  async createRequest({ paperId, requestedPermission, reason }) {
    const res = await api.post('/access-requests', {
      paper_id: paperId,
      requested_permission: requestedPermission,
      reason,
    });
    return res.data;
  },

  /**
   * Get all requests made by the current user.
   */
  async getMyRequests(params = {}) {
    const res = await api.get('/access-requests/my', { params });
    return res.data;
  },

  /**
   * Get all requests received by the current user for papers they own.
   */
  async getReceivedRequests(params = {}) {
    const res = await api.get('/access-requests/received', { params });
    return res.data;
  },

  /**
   * Approve an access request (Owner or Admin only).
   */
  async approveRequest(requestId) {
    const res = await api.post(`/access-requests/${requestId}/approve`);
    return res.data;
  },

  /**
   * Reject an access request (Owner or Admin only).
   */
  async rejectRequest(requestId, rejectionReason = '') {
    const res = await api.post(`/access-requests/${requestId}/reject`, {
      rejection_reason: rejectionReason,
    });
    return res.data;
  },

  /**
   * Cancel a pending access request (Requester only).
   */
  async cancelRequest(requestId) {
    const res = await api.delete(`/access-requests/${requestId}`);
    return res.data;
  },

  /**
   * Check if current user has an active pending request on a paper.
   */
  async getMyPendingRequestForPaper(paperId) {
    const res = await api.get('/access-requests/my', {
      params: { paper_id: paperId, status: 'PENDING', limit: 1 },
    });
    return res.data?.requests?.[0] || null;
  },

  /**
   * Get audit log history for a paper.
   */
  async getPaperAuditHistory(paperId, limit = 50) {
    const res = await api.get(`/access-requests/paper/${paperId}/audit`, {
      params: { limit },
    });
    return res.data;
  },
};

export default accessRequestsService;
