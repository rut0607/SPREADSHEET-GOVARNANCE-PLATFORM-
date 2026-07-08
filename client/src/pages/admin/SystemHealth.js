import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import StatCard from '../../components/shared/StatCard';
import { StatCardGridSkeleton, ListSkeleton } from '../../components/shared/skeletons';
import {
  Activity, Database, Users, FileText, HardDrive, Clock, MemoryStick,
  CheckCircle, XCircle, AlertTriangle, RefreshCw
} from 'lucide-react';

const HEALTH_POLL_INTERVAL_MS = 30 * 1000;
// Matches ecosystem.config.js's max_memory_restart (500MB) — the same
// ceiling PM2 uses to auto-restart a leaking process.
const MEMORY_LIMIT_MB = 500;
const MEMORY_WARNING_PERCENT = 80;

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const formatUptime = (totalSeconds) => {
  if (!totalSeconds && totalSeconds !== 0) return 'N/A';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const StatusRow = ({ label, status, detail }) => {
  const config = {
    healthy: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', text: 'text-green-600', label: 'Healthy' },
    warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-600', label: 'Warning' },
    down: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', text: 'text-red-600', label: 'Down' }
  }[status] || { icon: XCircle, color: 'text-gray-400', bg: 'bg-gray-50', text: 'text-gray-500', label: 'Unknown' };

  const Icon = config.icon;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${config.bg}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} className={config.color} />
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <span className={`text-xs font-medium ${config.text}`}>
        {detail || config.label}
      </span>
    </div>
  );
};

const SystemHealth = () => {
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [storage, setStorage] = useState(null);

  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.get('/health', { skipErrorToast: true });
      setHealth(res.data.data);
      setHealthError(false);
      setLastCheckedAt(new Date());
    } catch (error) {
      // A 503 still carries the detailed body — show it instead of a blank error state.
      if (error.response?.data?.data) {
        setHealth(error.response.data.data);
        setHealthError(false);
      } else {
        setHealthError(true);
      }
      setLastCheckedAt(new Date());
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const [sourcesRes, usersRes] = await Promise.all([
        api.get('/spreadsheets', { skipErrorToast: true }),
        api.get('/users', { skipErrorToast: true })
      ]);

      const fetchedSources = sourcesRes.data.data.sources;
      setSources(fetchedSources);
      setTotalRecords(
        fetchedSources.reduce((sum, source) =>
          sum + (source.worksheets?.reduce((wsSum, ws) => wsSum + (ws.row_count || 0), 0) || 0), 0)
      );
      setTotalUsers(usersRes.data.data.users.length);
    } catch (error) {
      // error toast handled by the axios response interceptor
    }

    try {
      const storageRes = await api.get('/system/storage', { skipErrorToast: true });
      setStorage(storageRes.data.data.storage);
    } catch (error) {
      setStorage(null);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchHealth(), fetchOverview()]);
    setLoading(false);
  }, [fetchHealth, fetchOverview]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const interval = setInterval(fetchHealth, HEALTH_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const googleSheetSources = sources.filter(s => s.source_type === 'google_sheets');

  const memoryPercent = health?.services?.memory
    ? Math.min(100, Math.round((health.services.memory.rss_mb / MEMORY_LIMIT_MB) * 100))
    : null;
  const memoryStatus = memoryPercent !== null
    ? (memoryPercent >= MEMORY_WARNING_PERCENT ? 'warning' : 'healthy')
    : 'down';

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <StatCardGridSkeleton count={3} />
        <ListSkeleton items={3} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">System Health</h1>
          <p className="text-gray-500 mt-1">Live status of core platform services • auto-refreshes every 30 seconds</p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2 rounded-lg transition-colors font-medium text-sm"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Records" value={totalRecords} icon={FileText} color="bg-blue-500" />
        <StatCard title="Total Users" value={totalUsers} icon={Users} color="bg-purple-500" />
        <StatCard
          title="Storage Used"
          value={storage ? formatBytes(storage.total_bytes) : 'N/A'}
          icon={HardDrive}
          color="bg-green-500"
        />
        <StatCard
          title="Server Uptime"
          value={health ? formatUptime(health.uptime_seconds) : 'N/A'}
          icon={Clock}
          color="bg-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Service Status</h2>
            {lastCheckedAt && (
              <span className="text-xs text-gray-400">
                Last checked {lastCheckedAt.toLocaleTimeString()}
              </span>
            )}
          </div>
          {healthError || !health ? (
            <StatusRow label="API Server" status="down" detail="Unreachable" />
          ) : (
            <div className="space-y-3">
              <StatusRow
                label="Database"
                status={health.services.database.status === 'down' ? 'down' : 'healthy'}
                detail={
                  health.services.database.status === 'down'
                    ? 'Unreachable'
                    : `${health.services.database.response_time_ms}ms`
                }
              />
              <StatusRow
                label="Storage"
                status={health.services.storage.status === 'down' ? 'down' : 'healthy'}
                detail={
                  health.services.storage.status === 'down'
                    ? 'Unreachable'
                    : `${health.services.storage.response_time_ms}ms`
                }
              />
              <StatusRow
                label="Memory"
                status={memoryStatus}
                detail={memoryPercent !== null ? `${health.services.memory.rss_mb}MB (${memoryPercent}%)` : 'N/A'}
              />
            </div>
          )}

          {memoryPercent !== null && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span className="flex items-center gap-1"><MemoryStick size={12} /> Memory usage</span>
                <span>{memoryPercent}% of {MEMORY_LIMIT_MB}MB limit</span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${memoryPercent >= MEMORY_WARNING_PERCENT ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${memoryPercent}%` }}
                />
              </div>
              {memoryPercent >= MEMORY_WARNING_PERCENT && (
                <p className="text-xs text-yellow-600 mt-1.5 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Memory usage is above {MEMORY_WARNING_PERCENT}% of the restart limit
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-800">Google Sheets Sync</h2>
          </div>
          {googleSheetSources.length === 0 ? (
            <p className="text-sm text-gray-500">No Google Sheets sources connected</p>
          ) : (
            <div className="space-y-2">
              {googleSheetSources.map(source => (
                <div key={source.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">{source.name}</span>
                  <span className="text-xs text-gray-500">
                    {source.last_synced_at
                      ? new Date(source.last_synced_at).toLocaleString()
                      : 'Never synced'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-800">Storage Details</h2>
        </div>
        {storage ? (
          <p className="text-sm text-gray-600">
            {storage.file_count} file{storage.file_count !== 1 ? 's' : ''} stored, totaling {formatBytes(storage.total_bytes)}
          </p>
        ) : (
          <p className="text-sm text-gray-500">Storage stats unavailable</p>
        )}
      </div>
    </div>
  );
};

export default SystemHealth;
