import api from './api';

export const tagsService = {
  /**
   * Fetch complete hierarchical tag tree or subtree rooted at id
   * GET /api/tags/tree or GET /api/tags/:id/tree
   */
  async getTagTree(id = null) {
    const url = id ? `/tags/${id}/tree` : '/tags/tree';
    const res = await api.get(url);
    return res.data?.tree || [];
  },

  /**
   * List tags with optional filtering (parentId, search) and pagination
   * GET /api/tags
   */
  async listTags(params = {}) {
    const res = await api.get('/tags', { params });
    return res.data;
  },

  /**
   * Get single tag details by ID with parent, children, ancestors, canonical path
   * GET /api/tags/:id
   */
  async getTagById(id) {
    const res = await api.get(`/tags/${id}`);
    return res.data?.tag || res.data;
  },

  /**
   * Get immediate children of a tag
   * GET /api/tags/:id/children
   */
  async getChildren(id) {
    const res = await api.get(`/tags/${id}/children`);
    return res.data?.children || [];
  },

  /**
   * Create a new topic tag (root or child)
   * POST /api/tags
   * Body: { name, slug, parentId, description }
   */
  async createTag(tagData) {
    const res = await api.post('/tags', tagData);
    return res.data?.tag || res.data;
  },

  /**
   * Update tag properties or reparent tag
   * PATCH /api/tags/:id
   * Body: { name, slug, parentId, description }
   */
  async updateTag(id, updates) {
    const res = await api.patch(`/tags/${id}`, updates);
    return res.data?.tag || res.data;
  },

  /**
   * Delete tag (Admin only; blocked if child tags exist)
   * DELETE /api/tags/:id
   */
  async deleteTag(id) {
    const res = await api.delete(`/tags/${id}`);
    return res.data;
  },
};

export default tagsService;
