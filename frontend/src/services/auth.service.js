import api from './api';

export const authService = {
  async register(data) {
    const res = await api.post('/auth/register', data);
    return res.data;
  },

  async login(email, password) {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },

  async logout() {
    const res = await api.post('/auth/logout');
    return res.data;
  },

  async getCurrentUser() {
    const res = await api.get('/auth/me');
    return res.data;
  },

  async updateProfile(profileData) {
    const res = await api.put('/auth/profile', profileData);
    return res.data;
  },

  async forgotPassword(email) {
    const res = await api.post('/auth/forgot-password', { email });
    return res.data;
  },

  async resetPassword(token, password) {
    const res = await api.post('/auth/reset-password', { token, password });
    return res.data;
  },

  async verifyEmail(token) {
    const res = await api.post('/auth/verify-email', { token });
    return res.data;
  },

  async resendVerification(email) {
    const res = await api.post('/auth/resend-verification', { email });
    return res.data;
  },

  async getSsoConfig() {
    const res = await api.get('/auth/sso/config');
    return res.data;
  },

  async checkUploadPermission() {
    const res = await api.post('/auth/papers/check-upload-permission');
    return res.data;
  },

  async updateUserRole(userId, role) {
    const res = await api.put(`/auth/users/${userId}/role`, { role });
    return res.data;
  },
};
