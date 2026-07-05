import axios from 'axios';
import toast from 'react-hot-toast';
import queryCache from './queryCache';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' }
});

const CACHEABLE_URLS = [
  '/roles',
  '/spreadsheets',
];

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.method === 'get') {
      const cacheKey = config.url + JSON.stringify(config.params || {});
      const isCacheable = CACHEABLE_URLS.some(url => config.url.includes(url));
      if (isCacheable) {
        const cached = queryCache.get(cacheKey);
        if (cached) {
          config.adapter = () => Promise.resolve({
            data: cached,
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: {}
          });
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    if (response.config.method === 'get') {
      const cacheKey = response.config.url + JSON.stringify(response.config.params || {});
      const isCacheable = CACHEABLE_URLS.some(url => response.config.url.includes(url));
      if (isCacheable && !response.cached) {
        queryCache.set(cacheKey, response.data, 120);
      }
    }
    return response;
  },
  async (error) => {
    if (!error.config?.skipErrorToast) {
      toast.error(error.response?.data?.message || 'Something went wrong. Please try again.');
    }

    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const clearApiCache = () => queryCache.clear();

export default api;