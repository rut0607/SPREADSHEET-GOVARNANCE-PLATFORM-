import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import dataCache from '../services/dataCache';

const AuthContext = createContext(null);

const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000;

const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  localStorage.removeItem('lastActivity');
};

const updateLastActivity = () => {
  localStorage.setItem('lastActivity', Date.now().toString());
};

const isSessionExpired = () => {
  const lastActivity = parseInt(localStorage.getItem('lastActivity'), 10);
  return !!lastActivity && (Date.now() - lastActivity > SESSION_TIMEOUT_MS);
};

// Warms the cache immediately after login (or session restore) so the
// dashboard/production-entry/notifications screens can render from cache
// instead of showing a spinner on the very first paint.
const preloadCriticalData = async (userObj, setPreload) => {
  if (!userObj) return;
  setPreload(prev => ({ ...prev, loading: true }));

  try {
    const unreadPromise = dataCache.fetchWithCache('notifications:unread', async () => {
      const res = await api.get('/notifications');
      return res.data.data.unread_count;
    }, 30000);

    if (userObj.is_admin) {
      const unreadCount = await unreadPromise;
      setPreload({ assignments: null, todayEntries: null, unreadCount, loading: false });
      return;
    }

    const assignmentsPromise = dataCache.fetchWithCache(`machines:employee:${userObj.id}`, async () => {
      const res = await api.get(`/machines/employee/${userObj.id}`);
      return res.data.data.assignments;
    }, 60000);

    const entriesPromise = dataCache.fetchWithCache('production:my-entries', async () => {
      const res = await api.get('/production/my-entries');
      return res.data.data;
    }, 30000);

    const [unreadCount, assignments, todayEntries] = await Promise.all([unreadPromise, assignmentsPromise, entriesPromise]);
    setPreload({ assignments, todayEntries, unreadCount, loading: false });
  } catch (error) {
    setPreload(prev => ({ ...prev, loading: false }));
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preload, setPreload] = useState({ assignments: null, todayEntries: null, unreadCount: null, loading: false });
  const location = useLocation();

  useEffect(() => {
    // Set by api.js when a 401 survives a token-refresh attempt — surfaced
    // here (rather than in api.js, a plain module with no toast context tied
    // to the app's mount lifecycle) since this runs right as the redirect to
    // /login lands.
    const expiredMessage = sessionStorage.getItem('sessionExpiredMessage');
    if (expiredMessage) {
      sessionStorage.removeItem('sessionExpiredMessage');
      toast.error(expiredMessage);
    }

    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
      if (isSessionExpired()) {
        clearSession();
      } else {
        const restoredUser = JSON.parse(storedUser);
        setUser(restoredUser);
        updateLastActivity();
        preloadCriticalData(restoredUser, setPreload);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;

    if (isSessionExpired()) {
      clearSession();
      setUser(null);
      toast.error('Session expired, please login again');
    } else {
      updateLastActivity();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { token, refresh_token, user } = response.data.data;
    localStorage.setItem('token', token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('user', JSON.stringify(user));
    updateLastActivity();
    setUser(user);
    preloadCriticalData(user, setPreload);
    return user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearSession();
      dataCache.clear();
      setUser(null);
      setPreload({ assignments: null, todayEntries: null, unreadCount: null, loading: false });
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    preload,
    isAdmin: user?.is_admin || false,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};