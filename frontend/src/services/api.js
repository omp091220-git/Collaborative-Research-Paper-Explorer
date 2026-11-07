import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to normalize URLs and prevent duplicate '/api/api/...'
api.interceptors.request.use((config) => {
  if (config.url && typeof config.url === 'string') {
    // If the request URL already starts with /api/, strip the leading /api
    // because baseURL is already '/api'
    if (config.url.startsWith('/api/')) {
      config.url = config.url.replace(/^\/api\//, '/');
    }
  }
  return config;
});

export const getApiErrorMessage = (error, defaultMsg = 'An unexpected error occurred.') => {
  if (!error) return defaultMsg;
  if (error.response?.data?.error) return error.response.data.error;
  if (error.response?.data?.message) return error.response.data.message;
  if (error.message) return error.message;
  return defaultMsg;
};

export default api;
