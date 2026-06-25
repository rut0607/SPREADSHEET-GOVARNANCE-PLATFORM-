import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Shield,
  FileSpreadsheet,
  CheckSquare,
  Bell,
  Activity,
  Settings,
  Database,
  Eye
} from 'lucide-react';

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/roles', icon: Shield, label: 'Roles & Permissions' },
  { to: '/admin/spreadsheets', icon: FileSpreadsheet, label: 'Spreadsheets' },
  { to: '/admin/approvals', icon: CheckSquare, label: 'Approvals' },
  { to: '/admin/activity', icon: Activity, label: 'Activity Feed' },
  { to: '/admin/audit', icon: Database, label: 'Audit Logs' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
];

const employeeLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/data', icon: Eye, label: 'View Data' },
  { to: '/my-approvals', icon: CheckSquare, label: 'My Requests' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
];

const Sidebar = ({ isOpen }) => {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const links = isAdmin ? adminLinks : employeeLinks;

  return (
    <aside className={`fixed left-0 top-14 h-full bg-white border-r border-gray-200 transition-all duration-300 z-40 ${isOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
      <nav className="p-4 space-y-1">
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                isActive
                  ? 'bg-primary-50 text-primary-700 border border-primary-200'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;