import api from './api';

export const papersService = {
  async getPapers(params = {}, options = {}) {
    const res = await api.get('/papers', { params, ...options });
    return res.data;
  },

  async searchUnified(q, type = 'all', limit = 20, topic = '', page = 1) {
    const res = await api.get('/papers/search', {
      params: { q, type, limit, topic, page },
    });
    return res.data;
  },

  async getPaperById(id) {
    const res = await api.get(`/papers/${id}`);
    return res.data?.paper || res.data || null;
  },

  async uploadPaper(formData, onProgress) {
    const res = await api.post('/papers/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      },
    });
    return res.data;
  },

  async importArxiv(arxivId, visibility = 'PUBLIC') {
    const res = await api.post('/papers/import', { arxiv_id: arxivId, visibility });
    return res.data;
  },

  async getMyPapers(params = {}) {
    const res = await api.get('/papers/my', { params });
    return res.data;
  },

  async updateVisibility(paperId, visibility) {
    const res = await api.patch(`/papers/${paperId}/visibility`, { visibility });
    return res.data;
  },

  async deletePaper(paperId, archive = false) {
    const res = await api.delete(`/papers/${paperId}`, {
      params: archive ? { archive: true } : {},
    });
    return res.data;
  },
};

export default papersService;
