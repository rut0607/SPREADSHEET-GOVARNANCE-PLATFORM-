import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { Database, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { TableSkeleton } from '../../components/shared/skeletons';

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'direct_edit', label: 'Direct Edit' },
  { value: 'approved_edit', label: 'Approved Edit' }
];

const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({ action_type: '', user_id: '', startDate: '', endDate: '' });
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/users').then(res => setUsers(res.data.data.users)).catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: pagination.limit };
      if (filters.action_type) params.action_type = filters.action_type;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const res = await api.get('/audit/logs', { params });
      setLogs(res.data.data.logs);
      setPagination(res.data.data.pagination);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  }, [page, filters, pagination.limit]);

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters]);

  const handleFilterChange = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (filters.action_type) params.action_type = filters.action_type;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const res = await api.get('/audit/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-log-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setExporting(false);
    }
  };

  const filtered = logs.filter(log =>
    log.user?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    log.worksheet?.name?.toLowerCase().includes(search.toLowerCase()) ||
    log.worksheet?.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    log.column?.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading && logs.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <TableSkeleton rows={8} columns={8} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Audit Logs</h1>
          <p className="text-gray-500 mt-1">Complete history of all direct edits and approved changes</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <Download size={18} />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by user, sheet or field..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            maxLength={255}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
          />
        </div>
        <select
          value={filters.action_type}
          onChange={e => handleFilterChange('action_type', e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        >
          {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <select
          value={filters.user_id}
          onChange={e => handleFilterChange('user_id', e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">All Users</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <input
          type="date"
          value={filters.startDate}
          onChange={e => handleFilterChange('startDate', e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        />
        <input
          type="date"
          value={filters.endDate}
          onChange={e => handleFilterChange('endDate', e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Database size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No logs found</h3>
          <p className="text-gray-500 mt-1">Audit logs will appear as employees make changes</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Timestamp</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Action Type</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Sheet</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Field</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Previous Value</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{log.user?.full_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{log.user?.role?.name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.action_type === 'approved_edit' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {log.action_type === 'approved_edit' ? 'Approved Edit' : 'Direct Edit'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.worksheet?.display_name || log.worksheet?.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{log.column?.display_name || '—'}</td>
                    <td className="px-4 py-3 text-red-500 line-through">{log.previous_value || '(empty)'}</td>
                    <td className="px-4 py-3 text-green-600 font-medium">{log.new_value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-500">
            <span>
              Page {pagination.page} of {pagination.total_pages || 1} • {pagination.total} total records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(pagination.total_pages || 1, p + 1))}
                disabled={pagination.page >= (pagination.total_pages || 1)}
                className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;
