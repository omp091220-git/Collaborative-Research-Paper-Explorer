import api from './api';

export const tagsService = {
  getTagTree: async () => {
    const res = await api.get('/tags/tree');
    return res.data;
  },

  listTags: async (params = {}) => {
    const res = await api.get('/tags', { params });
    return res.data;
  },

  getTagById: async (id) => {
    const res = await api.get(`/tags/${id}`);
    return res.data;
  },

  createTag: async (tagData) => {
    const res = await api.post('/tags', tagData);
    return res.data;
  },
};

export default tagsService;
