import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import StatCard from '../../components/shared/StatCard';
import { StatCardGridSkeleton, ListSkeleton } from '../../components/shared/skeletons';
import {
  Users, FileSpreadsheet, CheckSquare,
  Activity, TrendingUp, Clock, CheckCircle, XCircle
} from 'lucide-react';

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalSpreadsheets: 0,
    pendingApprovals: 0,
    totalRoles: 0
  });
  const [recentApprovals, setRecentApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [usersRes, spreadsheetsRes, approvalsRes, rolesRes] = await Promise.all([
        api.get('/users'),
        api.get('/spreadsheets'),
        api.get('/approvals/pending'),
        api.get('/roles')
      ]);

      setStats({
        totalUsers: usersRes.data.data.users.length,
        totalSpreadsheets: spreadsheetsRes.data.data.sources.length,
        pendingApprovals: approvalsRes.data.data.approvals.length,
        totalRoles: rolesRes.data.data.roles.length
      });

      setRecentApprovals(approvalsRes.data.data.approvals.slice(0, 5));
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <StatCardGridSkeleton count={4} />
        <ListSkeleton items={5} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your platform</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          color="bg-blue-500"
          link="/admin/users"
        />
        <StatCard
          title="Spreadsheets"
          value={stats.totalSpreadsheets}
          icon={FileSpreadsheet}
          color="bg-green-500"
          link="/admin/spreadsheets"
        />
        <StatCard
          title="Pending Approvals"
          value={stats.pendingApprovals}
          icon={CheckSquare}
          color="bg-orange-500"
          link="/admin/approvals"
        />
        <StatCard
          title="Total Roles"
          value={stats.totalRoles}
          icon={Activity}
          color="bg-purple-500"
          link="/admin/roles"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Pending Approvals</h2>
            <Link to="/admin/approvals" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View all
            </Link>
          </div>
        </div>

        {recentApprovals.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle size={40} className="text-green-400 mx-auto mb-3" />
            <p className="text-gray-500">No pending approvals</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentApprovals.map(approval => (
              <div key={approval.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {approval.requester?.full_name} requested change in{' '}
                    <span className="text-primary-600">{approval.worksheet?.name}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Field: {approval.column?.display_name} • {' '}
                    {new Date(approval.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                    Pending
                  </span>
                  <Link
                    to="/admin/approvals"
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Review
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to="/admin/users"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
            >
              <Users size={18} className="text-primary-600" />
              <span className="text-sm font-medium text-gray-700">Add New User</span>
            </Link>
            <Link
              to="/admin/spreadsheets"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
            >
              <FileSpreadsheet size={18} className="text-primary-600" />
              <span className="text-sm font-medium text-gray-700">Upload Spreadsheet</span>
            </Link>
            <Link
              to="/admin/roles"
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors"
            >
              <Activity size={18} className="text-primary-600" />
              <span className="text-sm font-medium text-gray-700">Manage Roles</span>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Platform Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-sm text-gray-700">Database</span>
              </div>
              <span className="text-xs font-medium text-green-600">Connected</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-sm text-gray-700">Authentication</span>
              </div>
              <span className="text-xs font-medium text-green-600">Active</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-500" />
                <span className="text-sm text-gray-700">File Storage</span>
              </div>
              <span className="text-xs font-medium text-green-600">Ready</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;