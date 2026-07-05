import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { StatCardGridSkeleton, ListSkeleton } from '../../components/shared/skeletons';
import { FileSpreadsheet, CheckSquare, Bell, Clock, CheckCircle, XCircle } from 'lucide-react';

const MiniStatCard = ({ label, value, icon: Icon, iconBg, iconColor }) => (
  <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
        <Icon size={20} className={iconColor} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  </div>
);

const MemoMiniStatCard = React.memo(MiniStatCard);

const EmployeeDashboard = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalSheets: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0
  });
  const [recentRequests, setRecentRequests] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [sheetsRes, approvalsRes, notifRes] = await Promise.all([
        api.get('/spreadsheets'),
        api.get('/approvals'),
        api.get('/notifications')
      ]);

      const approvals = approvalsRes.data.data.approvals;
      setStats({
        totalSheets: sheetsRes.data.data.sources.length,
        pendingRequests: approvals.filter(a => a.status === 'pending').length,
        approvedRequests: approvals.filter(a => a.status === 'approved').length,
        rejectedRequests: approvals.filter(a => a.status === 'rejected').length
      });

      setRecentRequests(approvals.slice(0, 5));
      setNotifications(notifRes.data.data.notifications.slice(0, 5));
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <StatCardGridSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ListSkeleton items={4} />
          <ListSkeleton items={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Welcome, {user?.full_name}
        </h1>
        <p className="text-gray-500 mt-1">
          {user?.role?.name || 'Employee'} • {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MemoMiniStatCard label="Data Sheets" value={stats.totalSheets} icon={FileSpreadsheet} iconBg="bg-blue-100" iconColor="text-blue-600" />
        <MemoMiniStatCard label="Pending" value={stats.pendingRequests} icon={Clock} iconBg="bg-orange-100" iconColor="text-orange-600" />
        <MemoMiniStatCard label="Approved" value={stats.approvedRequests} icon={CheckCircle} iconBg="bg-green-100" iconColor="text-green-600" />
        <MemoMiniStatCard label="Rejected" value={stats.rejectedRequests} icon={XCircle} iconBg="bg-red-100" iconColor="text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">My Recent Requests</h2>
            <Link to="/my-approvals" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View all
            </Link>
          </div>
          {recentRequests.length === 0 ? (
            <div className="p-8 text-center">
              <CheckSquare size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No requests yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentRequests.map(req => (
                <div key={req.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {req.worksheet?.name} → {req.column?.display_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(req.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      req.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : req.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Recent Notifications</h2>
            <Link to="/notifications" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
              View all
            </Link>
          </div>
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map(notif => (
                <div key={notif.id} className={`p-4 ${!notif.is_read ? 'bg-blue-50' : ''}`}>
                  <p className={`text-sm ${!notif.is_read ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
                    {notif.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{notif.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(notif.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/data"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
          >
            <FileSpreadsheet size={20} className="text-primary-600" />
            <div>
              <p className="font-medium text-gray-800 text-sm">View Data</p>
              <p className="text-xs text-gray-500">Browse and edit your data</p>
            </div>
          </Link>
          <Link
            to="/my-approvals"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
          >
            <CheckSquare size={20} className="text-primary-600" />
            <div>
              <p className="font-medium text-gray-800 text-sm">My Requests</p>
              <p className="text-xs text-gray-500">Track your change requests</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default EmployeeDashboard;