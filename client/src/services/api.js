import axios from 'axios';
import toast from 'react-hot-toast';
import queryCache from './queryCache';

// REACT_APP_API_URL is only trusted when the page itself was loaded from
// localhost. When the app is opened from a LAN IP (e.g. testing on a phone),
// "localhost" in that env var would resolve to the phone itself, so derive
// the API host from the page's own hostname instead.
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
// Falls back to the server's default port (see server/.env's PORT) when neither
// REACT_APP_API_URL applies (LAN testing) nor is set at all — overridable via
// REACT_APP_API_PORT if the backend is ever run on a non-default port.
const API_PORT = process.env.REACT_APP_API_PORT || '8000';
const API_URL = (isLocalhost && process.env.REACT_APP_API_URL)
  || `${window.location.protocol}//${window.location.hostname}:${API_PORT}/api`;

const REQUEST_TIMEOUT_MS = 15000;
const GET_RETRY_DELAYS_MS = [1000, 2000];

const api = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT_MS,
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

    config.metadata = { startTime: Date.now() };

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

const reportLatency = (config) => {
  if (!config?.metadata?.startTime) return;
  const ms = Date.now() - config.metadata.startTime;
  window.dispatchEvent(new CustomEvent('api:latency', { detail: { ms } }));
};

// --- 401 handling: refresh the access token once, replay any requests that
// piled up while the refresh was in flight, and only force a logout if the
// refresh itself fails. `isRefreshing`/`refreshSubscribers` ensure concurrent
// 401s (e.g. several widgets fetching at once) trigger a single refresh call.
let isRefreshing = false;
let refreshSubscribers = [];

const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

const onRefreshComplete = (newToken) => {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
};

// Session state is cleared here independently of AuthContext's clearSession
// (rather than importing it) to avoid a circular dependency, since
// AuthContext itself imports this module for its own API calls.
const handleSessionExpired = (message) => {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  localStorage.removeItem('lastActivity');
  sessionStorage.setItem('sessionExpiredMessage', message);
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
};

const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) throw new Error('No refresh token available');

  // Plain axios call (not the `api` instance) so this never re-enters these
  // same interceptors and can't recurse into itself.
  const response = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken });
  const { token, refresh_token: newRefreshToken } = response.data.data;

  localStorage.setItem('token', token);
  if (newRefreshToken) localStorage.setItem('refresh_token', newRefreshToken);
  return token;
};

const isRetryableGetFailure = (error) => {
  if (error.config?.method !== 'get') return false;
  const isNetworkError = !error.response;
  const is503 = error.response?.status === 503;
  return isNetworkError || is503;
};

api.interceptors.response.use(
  (response) => {
    reportLatency(response.config);

    if (response.config.method === 'get') {
      const cacheKey = response.config.url + JSON.stringify(response.config.params || {});
      const isCacheable = CACHEABLE_URLS.some(url => response.config.url.includes(url));
      // response.data is the JSON body ({ success, data }); the server marks its own
      // cache hits at data.cached, so this avoids re-caching something already served
      // from the server's cache. (Previously checked response.cached, which is never
      // set by anything and was always undefined — this condition was effectively a
      // no-op until the server started nesting `cached` inside `data`.)
      if (isCacheable && !response.data?.data?.cached) {
        queryCache.set(cacheKey, response.data, 120);
      }
    }
    return response;
  },
  async (error) => {
    reportLatency(error.config);
    const config = error.config || {};

    // Auth endpoints themselves are excluded so a failed login/refresh call
    // never tries to "refresh" its way out of a 401.
    const isAuthEndpoint = config.url?.includes('/auth/login') || config.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !isAuthEndpoint && !config._authRetry) {
      config._authRetry = true;

      if (!localStorage.getItem('refresh_token')) {
        handleSessionExpired('Your session has expired');
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (!newToken) return reject(error);
            config.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(config));
          });
        });
      }

      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        onRefreshComplete(newToken);
        config.headers.Authorization = `Bearer ${newToken}`;
        return api(config);
      } catch (refreshError) {
        isRefreshing = false;
        onRefreshComplete(null);
        handleSessionExpired('Your session has expired');
        return Promise.reject(error);
      }
    }

    if (isRetryableGetFailure(error)) {
      config._retryCount = config._retryCount || 0;
      if (config._retryCount < GET_RETRY_DELAYS_MS.length) {
        if (config._retryCount === 0) {
          toast('Retrying connection...', { icon: '🔄', duration: 2000 });
        }
        const delay = GET_RETRY_DELAYS_MS[config._retryCount];
        config._retryCount += 1;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(config);
      }
    }

    if (!config.skipErrorToast) {
      toast.error(error.response?.data?.message || 'Something went wrong. Please try again.');
    }

    return Promise.reject(error);
  }
);

// De-duplicate identical concurrent GET requests (same url + params) so
// callers that happen to fire together share one network round trip.
const pendingGetRequests = new Map();
const originalGet = api.get.bind(api);

api.get = (url, config = {}) => {
  const key = `${url}::${JSON.stringify(config.params || {})}`;

  if (pendingGetRequests.has(key)) {
    return pendingGetRequests.get(key);
  }

  const request = originalGet(url, config).finally(() => {
    pendingGetRequests.delete(key);
  });

  pendingGetRequests.set(key, request);
  return request;
};

export const clearApiCache = () => queryCache.clear();

export default api;
