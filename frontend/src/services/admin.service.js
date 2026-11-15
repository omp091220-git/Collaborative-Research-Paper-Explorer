import api from './api';

export const adminService = {
  async getOverview() {
    const res = await api.get('/admin/monitoring/overview');
    return res.data;
  },

  async getStorage() {
    const res = await api.get('/admin/monitoring/storage');
    return res.data;
  },

  async getRedis() {
    const res = await api.get('/admin/monitoring/redis');
    return res.data;
  },

  async getGenAI(period = '30d') {
    const res = await api.get(`/admin/monitoring/genai?period=${period}`);
    return res.data;
  },

  async recordGenAI(record) {
    const res = await api.post('/admin/monitoring/genai/record', record);
    return res.data;
  },
};
