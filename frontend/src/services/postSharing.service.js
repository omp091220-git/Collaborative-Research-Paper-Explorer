import api from './api';

export const postSharingService = {
  /**
   * Generates or fetches a shareable link token and share count for a post.
   */
  async getShareLink(postId, signal) {
    const response = await api.post(`/posts/${postId}/share`, {}, { signal });
    return response.data;
  },

  /**
   * Resolves a shared link (by share_token or post ID).
   */
  async resolveShareLink(tokenOrId, signal) {
    const response = await api.get(`/posts/share/${tokenOrId}`, { signal });
    return response.data?.post || response.data;
  },

  /**
   * Shares a post to ScholarSphere platform (by reference).
   */
  async shareToPlatform(postId, { commentary, visibility = 'PUBLIC', tags = [] }) {
    const response = await api.post(`/posts/${postId}/repost`, {
      commentary,
      visibility,
      tags,
    });
    return response.data?.post || response.data;
  },

  /**
   * Retrieves safe preview metadata for a post.
   */
  async getPostPreview(tokenOrId, signal) {
    const response = await api.get(`/posts/${tokenOrId}/preview`, { signal });
    return response.data?.preview || response.data;
  },
};

export default postSharingService;
