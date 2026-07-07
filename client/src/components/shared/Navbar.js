import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Bell, LogOut, User, Menu, X, Settings, Wifi, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const dotColors = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500'
};

const getSubmissionDotColor = (summary) => {
  if (!summary) return null;
  if (summary.today_submitted) {
    return summary.today_oe !== null && summary.today_oe > 85 ? 'green' : 'yellow';
  }
  return new Date().getHours() >= 10 ? 'red' : null;
};

const SLOW_LATENCY_MS = 800;

const Navbar = ({ onMenuToggle, sidebarOpen }) => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [submissionSummary, setSubmissionSummary] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [latency, setLatency] = useState(null);

  useEffect(() => {
    if (isAdmin) return;
    let isMounted = true;

    api.get('/production/my-entries', { skipErrorToast: true })
      .then(res => {
        if (isMounted) setSubmissionSummary(res.data.data);
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleLatency = (event) => setLatency(event.detail.ms);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('api:latency', handleLatency);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('api:latency', handleLatency);
    };
  }, [isAdmin]);

  const dotColor = getSubmissionDotColor(submissionSummary);
  const connectionQuality = !isOnline ? 'offline' : (latency !== null && latency > SLOW_LATENCY_MS ? 'slow' : 'good');

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-50 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="bg-accent-gradient bg-clip-text text-transparent font-bold text-sm">AC</span>
          </div>
          <span className="font-semibold text-gray-800 hidden sm:block text-sm">
            Alambre Cables
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!isAdmin && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
              connectionQuality === 'offline' ? 'text-red-600' :
              connectionQuality === 'slow' ? 'text-yellow-600' : 'text-green-600'
            }`}
            title={
              connectionQuality === 'offline' ? 'No internet connection' :
              connectionQuality === 'slow' ? 'Slow connection detected' : 'Connection is good'
            }
          >
            {connectionQuality === 'offline' ? <WifiOff size={16} /> : <Wifi size={16} />}
            {connectionQuality === 'offline' && <span className="hidden sm:inline">Offline</span>}
          </div>
        )}
        <Link
          to="/notifications"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors relative"
        >
          <Bell size={20} className="text-gray-600" />
        </Link>

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="relative w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User size={16} className="text-primary-600" />
              {dotColor && (
                <span
                  className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${dotColors[dotColor]}`}
                  title={
                    dotColor === 'green' ? "Submitted today — great efficiency" :
                    dotColor === 'yellow' ? 'Submitted today — below target efficiency' :
                    "You haven't submitted today's production entry"
                  }
                />
              )}
            </div>
            <span className="text-sm font-medium text-gray-700 hidden md:block">
              {user?.full_name}
            </span>
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 top-12 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-800">{user?.full_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
                    {isAdmin ? 'Admin' : user?.role?.name || 'Employee'}
                  </span>
                </div>
                {isAdmin && (
                  <Link
                    to="/admin/settings"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings size={16} />
                    Settings
                  </Link>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 w-full text-left transition-colors"
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

Navbar.propTypes = {
  onMenuToggle: PropTypes.func.isRequired,
  sidebarOpen: PropTypes.bool.isRequired
};

export default Navbar;