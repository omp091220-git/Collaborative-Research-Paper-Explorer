import api from './api';

export const papersService = {
  async getPapers(params = {}) {
    const res = await api.get('/papers', { params });
    return res.data?.papers || res.data || [];
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

  async importArxiv(arxivId) {
    const res = await api.post('/papers/import', { arxiv_id: arxivId });
    return res.data;
  },
};

export default papersService;
