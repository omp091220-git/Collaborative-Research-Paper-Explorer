import api from './api';

export const discussionsService = {
  getPaperDiscussions: async (paperId) => {
    const res = await api.get(`/papers/${paperId}/discussions`);
    return res.data;
  },

  createThread: async (paperId, threadData) => {
    const res = await api.post(`/papers/${paperId}/discussions`, threadData);
    return res.data;
  },

  getThread: async (paperId, threadId) => {
    const res = await api.get(`/papers/${paperId}/discussions/${threadId}`);
    return res.data;
  },

  postReply: async (paperId, threadId, content, parentMessageId = null) => {
    const res = await api.post(
      `/papers/${paperId}/discussions/${threadId}/messages`,
      { content, parent_message_id: parentMessageId }
    );
    return res.data;
  },

  updateThread: async (paperId, threadId, updates) => {
    const res = await api.patch(
      `/papers/${paperId}/discussions/${threadId}`,
      updates
    );
    return res.data;
  },

  deleteMessage: async (paperId, threadId, messageId) => {
    const res = await api.delete(
      `/papers/${paperId}/discussions/${threadId}/messages/${messageId}`
    );
    return res.data;
  },

  deleteThread: async (paperId, threadId) => {
    const res = await api.delete(`/papers/${paperId}/discussions/${threadId}`);
    return res.data;
  },
};

export default discussionsService;
