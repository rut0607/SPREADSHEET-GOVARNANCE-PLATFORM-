import React from 'react';
import PropTypes from 'prop-types';
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
  Database,
  Eye,
  History,
  Settings,
  Cpu,
  TrendingUp,
  ClipboardList
} from 'lucide-react';

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/roles', icon: Shield, label: 'Roles & Permissions' },
  { to: '/admin/spreadsheets', icon: FileSpreadsheet, label: 'Spreadsheets' },
  { to: '/admin/versions', icon: History, label: 'Version Management' },
  { to: '/admin/columns', icon: Settings, label: 'Column Config' },
  { to: '/admin/machines', icon: Cpu, label: 'Machine Assignment' },
  { to: '/admin/efficiency', icon: TrendingUp, label: 'Efficiency Dashboard' },
  { to: '/admin/approvals', icon: CheckSquare, label: 'Approvals' },
  { to: '/admin/activity', icon: Activity, label: 'Activity Feed' },
  { to: '/admin/audit', icon: Database, label: 'Audit Logs' },
  { to: '/admin/system', icon: Activity, label: 'System Health' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
];

const employeeLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/production-entry', icon: ClipboardList, label: 'Production Entry' },
  { to: '/data', icon: Eye, label: 'View Data' },
  { to: '/my-approvals', icon: CheckSquare, label: 'My Requests' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
];

const Sidebar = ({ isOpen, onClose }) => {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const links = isAdmin ? adminLinks : employeeLinks;

  return (
    <aside className={`fixed left-0 top-14 h-full bg-white border-r border-gray-200 transition-all duration-300 z-40 ${isOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
      <nav className="p-4 space-y-1 overflow-y-auto h-full pb-20">
        {links.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              onClick={onClose}
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

Sidebar.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default Sidebar;