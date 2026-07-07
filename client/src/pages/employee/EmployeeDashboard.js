import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { StatCardGridSkeleton, ListSkeleton } from '../../components/shared/skeletons';
import { FileSpreadsheet, CheckSquare, Bell, Clock, CheckCircle, XCircle, AlertTriangle, ClipboardList } from 'lucide-react';
import usePushNotifications from '../../hooks/usePushNotifications';

const NotificationsToggle = () => {
  const { isPushEnabled, isSupported, loading, enablePush, disablePush } = usePushNotifications();

  if (!isSupported) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Bell size={18} className="text-primary-600" />
        </div>
        <div>
          <p className="font-medium text-gray-800 text-sm">Push Notifications</p>
          <p className="text-xs text-gray-500">Get notified even when the app is closed</p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={isPushEnabled}
        disabled={loading}
        onClick={() => (isPushEnabled ? disablePush() : enablePush())}
        className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${
          isPushEnabled ? 'bg-primary-600' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
            isPushEnabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
};

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

const OE_COLORS = {
  green: '#16a34a',
  yellow: '#f59e0b',
  red: '#dc2626',
  gray: '#9ca3af'
};

const getOEBandColor = (oePercent) => {
  if (oePercent === null || oePercent === undefined) return 'gray';
  if (oePercent > 85) return 'green';
  if (oePercent >= 75) return 'yellow';
  return 'red';
};

const getMotivationalMessage = (weekAverage) => {
  if (weekAverage === null || weekAverage === undefined) {
    return { text: 'Submit your first entry this week to see your efficiency trend.', color: 'gray' };
  }
  if (weekAverage > 95) return { text: 'Excellent work this week — keep it up!', color: 'green' };
  if (weekAverage > 85) return { text: 'Good performance — you are meeting targets.', color: 'green' };
  if (weekAverage >= 75) return { text: 'You are close to target — focus on improvement.', color: 'yellow' };
  return { text: 'Your efficiency needs attention — please speak with your supervisor.', color: 'red' };
};

const EfficiencyRing = ({ percent }) => {
  const band = getOEBandColor(percent);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent ?? 0));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative w-44 h-44 sm:w-36 sm:h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={radius} fill="none"
          stroke={OE_COLORS[band]}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-800">
          {percent !== null && percent !== undefined ? `${percent.toFixed(0)}%` : 'N/A'}
        </span>
        <span className="text-xs text-gray-500">This Week</span>
      </div>
    </div>
  );
};

const SevenDayChart = ({ history }) => {
  const CHART_HEIGHT = 96;
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-end justify-between sm:justify-between gap-3 min-w-[360px] sm:min-w-0" style={{ height: CHART_HEIGHT + 40 }}>
        {history.map(day => {
          const band = day.submitted ? getOEBandColor(day.oe_percentage) : 'gray';
          const barHeight = day.submitted
            ? Math.max(6, Math.min(100, day.oe_percentage) / 100 * CHART_HEIGHT)
            : 4;
          const date = new Date(`${day.date}T00:00:00.000Z`);
          return (
            <div key={day.date} className="flex-1 flex flex-col items-center justify-end flex-shrink-0" style={{ height: CHART_HEIGHT + 40, minWidth: 40 }}>
              <span className="text-[11px] font-medium text-gray-600 mb-1">
                {day.submitted ? `${day.oe_percentage.toFixed(0)}%` : '—'}
              </span>
              <div
                className="w-full rounded-t-md"
                style={{ height: barHeight, backgroundColor: OE_COLORS[band], minWidth: 12, maxWidth: 32, margin: '0 auto' }}
              />
              <span className="text-[11px] text-gray-500 mt-1.5">
                {date.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })} {date.getUTCDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const EfficiencyWidget = ({ efficiency, loading, error }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="h-36 w-36 mx-auto bg-gray-100 rounded-full animate-pulse" />
        <div className="h-20 bg-gray-100 rounded-lg animate-pulse mt-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center">
        <AlertTriangle size={28} className="text-orange-400 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Couldn't load your efficiency data right now.</p>
      </div>
    );
  }

  const message = getMotivationalMessage(efficiency.week_average);
  const messageStyles = {
    green: 'bg-green-50 text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-gray-50 text-gray-600'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <EfficiencyRing percent={efficiency.week_average} />

      <div className="grid grid-cols-3 gap-3 mt-6 text-center">
        <div>
          <p className="text-xs text-gray-500">Today's Status</p>
          {efficiency.today_submitted ? (
            <p className={`text-lg font-bold mt-0.5 ${
              getOEBandColor(efficiency.today_oe) === 'green' ? 'text-green-600' :
              getOEBandColor(efficiency.today_oe) === 'yellow' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {efficiency.today_oe !== null ? `${efficiency.today_oe.toFixed(1)}%` : 'N/A'}
            </p>
          ) : (
            <p className="text-sm font-semibold text-orange-600 mt-1.5">Not Submitted Yet</p>
          )}
        </div>
        <div>
          <p className="text-xs text-gray-500">This Week Average</p>
          <p className="text-lg font-bold text-gray-800 mt-0.5">
            {efficiency.week_average !== null ? `${efficiency.week_average.toFixed(1)}%` : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Last Week Average</p>
          <p className="text-lg font-bold text-gray-800 mt-0.5">
            {efficiency.last_week_average !== null ? `${efficiency.last_week_average.toFixed(1)}%` : 'N/A'}
          </p>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-100">
        <SevenDayChart history={efficiency.seven_day_history} />
      </div>

      <div className={`mt-5 rounded-lg px-4 py-3 text-sm font-medium text-center ${messageStyles[message.color]}`}>
        {message.text}
      </div>
    </div>
  );
};

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
  const [efficiency, setEfficiency] = useState(null);
  const [efficiencyLoading, setEfficiencyLoading] = useState(true);
  const [efficiencyError, setEfficiencyError] = useState(false);

  useEffect(() => {
    fetchDashboardData();
    fetchEfficiency();
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

  const fetchEfficiency = async () => {
    try {
      const res = await api.get('/production/my-entries', { skipErrorToast: true });
      setEfficiency(res.data.data);
    } catch (error) {
      setEfficiencyError(true);
    } finally {
      setEfficiencyLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <EfficiencyWidget efficiency={efficiency} loading={efficiencyLoading} error={efficiencyError} />
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
      <EfficiencyWidget efficiency={efficiency} loading={efficiencyLoading} error={efficiencyError} />

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

      <NotificationsToggle />

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

      <Link
        to="/production-entry"
        className="fixed bottom-20 md:bottom-6 right-4 z-30 w-14 h-14 rounded-full bg-primary-600 hover:bg-primary-700 text-white shadow-lg flex items-center justify-center transition-colors"
        aria-label="Go to production entry"
      >
        <ClipboardList size={24} />
      </Link>
    </div>
  );
};

export default EmployeeDashboard;