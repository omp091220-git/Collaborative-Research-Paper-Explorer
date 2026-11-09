import api from './api';

export const notificationsService = {
  getNotifications: async () => {
    const res = await api.get('/notifications');
    return res.data;
  },

  markAllAsRead: async () => {
    const res = await api.patch('/notifications/read-all');
    return res.data;
  },

  markAsRead: async (id) => {
    const res = await api.patch(`/notifications/${id}/read`);
    return res.data;
  },
};

export default notificationsService;
