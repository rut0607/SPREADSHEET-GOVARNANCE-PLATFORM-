import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import StatCard from '../../components/shared/StatCard';
import { StatCardGridSkeleton, ListSkeleton } from '../../components/shared/skeletons';
import {
  Activity, Database, Users, FileText, HardDrive,
  CheckCircle, XCircle, RefreshCw
} from 'lucide-react';

const formatBytes = (bytes) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

const StatusRow = ({ label, ok, okLabel = 'Connected', errorLabel = 'Error' }) => (
  <div className={`flex items-center justify-between p-3 rounded-lg ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
    <div className="flex items-center gap-2">
      {ok ? (
        <CheckCircle size={16} className="text-green-500" />
      ) : (
        <XCircle size={16} className="text-red-500" />
      )}
      <span className="text-sm text-gray-700">{label}</span>
    </div>
    <span className={`text-xs font-medium ${ok ? 'text-green-600' : 'text-red-600'}`}>
      {ok ? okLabel : errorLabel}
    </span>
  </div>
);

const SystemHealth = () => {
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk] = useState(false);
  const [dbOk, setDbOk] = useState(false);
  const [sources, setSources] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [storage, setStorage] = useState(null);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    setLoading(true);

    try {
      const res = await api.get('/health', { skipErrorToast: true });
      setApiOk(!!res.data?.success);
    } catch (error) {
      setApiOk(false);
    }

    try {
      const [sourcesRes, usersRes] = await Promise.all([
        api.get('/spreadsheets', { skipErrorToast: true }),
        api.get('/users', { skipErrorToast: true })
      ]);
      setDbOk(true);

      const fetchedSources = sourcesRes.data.data.sources;
      setSources(fetchedSources);
      setTotalRecords(
        fetchedSources.reduce((sum, source) =>
          sum + (source.worksheets?.reduce((wsSum, ws) => wsSum + (ws.row_count || 0), 0) || 0), 0)
      );
      setTotalUsers(usersRes.data.data.users.length);
    } catch (error) {
      setDbOk(false);
    }

    try {
      const storageRes = await api.get('/system/storage', { skipErrorToast: true });
      setStorage(storageRes.data.data.storage);
    } catch (error) {
      setStorage(null);
    }

    setLoading(false);
  };

  const googleSheetSources = sources.filter(s => s.source_type === 'google_sheets');

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
          <p className="text-gray-500 mt-1">Live status of core platform services</p>
        </div>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2 rounded-lg transition-colors font-medium text-sm"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Records" value={totalRecords} icon={FileText} color="bg-blue-500" />
        <StatCard title="Total Users" value={totalUsers} icon={Users} color="bg-purple-500" />
        <StatCard
          title="Storage Used"
          value={storage ? formatBytes(storage.total_bytes) : 'N/A'}
          icon={HardDrive}
          color="bg-green-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Service Status</h2>
          <div className="space-y-3">
            <StatusRow label="API Server" ok={apiOk} />
            <StatusRow label="Database" ok={dbOk} />
          </div>
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
