import api from './api';

export const paperTagsService = {
  /**
   * Create a new tag assignment (paper-level or annotation-level)
   * POST /api/paper-tags
   * Body: { paper_id: UUID, tag_id: UUID, annotation_id?: UUID|null }
   */
  async createAssignment({ paper_id, tag_id, annotation_id = null }) {
    const payload = {
      paper_id,
      tag_id,
      annotation_id: annotation_id || null,
    };
    const res = await api.post('/paper-tags', payload);
    return res.data?.assignment || res.data;
  },

  /**
   * List all tag assignments for a given paper, optionally filtered by annotation
   * GET /api/paper-tags/paper/:paperId
   * Query: { annotation_id?: UUID|'null', limit?: number, offset?: number }
   */
  async getAssignmentsForPaper(paperId, params = {}) {
    const res = await api.get(`/paper-tags/paper/${encodeURIComponent(paperId)}`, { params });
    return res.data;
  },

  /**
   * List tags assigned to a specific annotation/section
   * GET /api/paper-tags/annotation/:annotationId
   */
  async getTagsForAnnotation(annotationId) {
    const res = await api.get(`/paper-tags/annotation/${encodeURIComponent(annotationId)}`);
    return res.data?.tags || [];
  },

  /**
   * List papers that have been assigned a given tag
   * GET /api/paper-tags/by-tag/:tagId
   */
  async getPapersByTag(tagId, params = {}) {
    const res = await api.get(`/paper-tags/by-tag/${encodeURIComponent(tagId)}`, { params });
    return res.data?.papers || [];
  },

  /**
   * Retrieve a single assignment by its ID
   * GET /api/paper-tags/:id
   */
  async getAssignmentById(id) {
    const res = await api.get(`/paper-tags/${encodeURIComponent(id)}`);
    return res.data?.assignment || res.data;
  },

  /**
   * Remove a tag assignment by its UUID
   * DELETE /api/paper-tags/:id
   */
  async deleteAssignment(id) {
    const res = await api.delete(`/paper-tags/${encodeURIComponent(id)}`);
    return res.data;
  },

  /**
   * Bulk sync tags for a paper
   * PUT /api/paper-tags/paper/:paperId
   * Body: { tag_ids: UUID[] }
   */
  async syncPaperTags(paperId, tagIds) {
    const res = await api.put(`/paper-tags/paper/${encodeURIComponent(paperId)}`, {
      tag_ids: tagIds,
    });
    return res.data;
  },
};

export default paperTagsService;
