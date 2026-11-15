import api from './api';

export const collaborationsService = {
  getMyInvitations: async () => {
    const res = await api.get('/invitations/my-invitations');
    return res.data;
  },

  acceptInvitation: async (invitationId) => {
    const res = await api.post(`/invitations/${invitationId}/accept`);
    return res.data;
  },

  declineInvitation: async (invitationId) => {
    const res = await api.post(`/invitations/${invitationId}/decline`);
    return res.data;
  },

  getPaperCollaborators: async (paperId) => {
    const res = await api.get(`/papers/${paperId}/collaborators`);
    return res.data;
  },

  inviteCollaborator: async (paperId, email, role = 'COMMENT') => {
    const res = await api.post(`/papers/${paperId}/collaborators/invite`, {
      email,
      role,
    });
    return res.data;
  },

  updateCollaboratorRole: async (paperId, userId, role) => {
    const res = await api.patch(`/papers/${paperId}/collaborators/${userId}`, {
      role,
    });
    return res.data;
  },

  removeCollaborator: async (paperId, userId) => {
    const res = await api.delete(`/papers/${paperId}/collaborators/${userId}`);
    return res.data;
  },

  revokeInvitation: async (paperId, invitationId) => {
    const res = await api.delete(
      `/papers/${paperId}/collaborators/invitations/${invitationId}`
    );
    return res.data;
  },
};

export default collaborationsService;
