import React, { createContext, useContext, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('token');

    if (storedUser && storedToken) {
      if (isSessionExpired()) {
        clearSession();
      } else {
        setUser(JSON.parse(storedUser));
        updateLastActivity();
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
    return user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearSession();
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
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