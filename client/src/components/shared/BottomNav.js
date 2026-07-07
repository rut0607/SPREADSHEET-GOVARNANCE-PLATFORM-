import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Plus, Bell, User, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { to: '/dashboard', icon: Home, label: 'Home' },
  { to: '/production-entry', icon: Plus, label: 'Entry' }
];

const BottomNav = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAccountSheet, setShowAccountSheet] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let isMounted = true;
    api.get('/notifications', { skipErrorToast: true })
      .then(res => {
        if (isMounted) setUnreadCount(res.data.data.unread_count || 0);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
      toast.success('Logged out successfully');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  if (!isMobile) return null;

  return (
    <>
      {showAccountSheet && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-40" onClick={() => setShowAccountSheet(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-5 safe-bottom"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-semibold text-gray-800">{user?.full_name}</p>
            <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
            <span className="inline-block mt-2 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
              {user?.role?.name || 'Employee'}
            </span>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 mt-5 py-3 rounded-xl bg-red-50 text-red-600 font-medium"
              style={{ minHeight: 48 }}
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-stretch safe-bottom">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 ${
                isActive ? 'text-primary-600' : 'text-gray-500'
              }`}
              style={{ minHeight: 56 }}
            >
              <Icon size={22} />
              <span className="text-[11px] font-medium">{label}</span>
            </Link>
          );
        })}

        <Link
          to="/notifications"
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative ${
            location.pathname === '/notifications' ? 'text-primary-600' : 'text-gray-500'
          }`}
          style={{ minHeight: 56 }}
        >
          <span className="relative">
            <Bell size={22} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </span>
          <span className="text-[11px] font-medium">Alerts</span>
        </Link>

        <button
          onClick={() => setShowAccountSheet(true)}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-gray-500"
          style={{ minHeight: 56 }}
        >
          <User size={22} />
          <span className="text-[11px] font-medium">Profile</span>
        </button>
      </nav>
    </>
  );
};

export default BottomNav;
