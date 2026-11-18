import api from './api';
export default {
  async list(params, signal) {
    const { data } = await api.get('/posts', { params, signal });
    return data;
  },
  async detail(id, signal) {
    const { data } = await api.get(`/posts/public/${encodeURIComponent(id)}`, {
      signal,
    });
    return data.post;
  },
};
