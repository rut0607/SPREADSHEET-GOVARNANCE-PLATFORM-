import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Database, Search, Filter } from 'lucide-react';
import toast from 'react-hot-toast';

const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await api.get('/approvals?limit=100');
      setLogs(res.data.data.approvals);
    } catch (error) {
      toast.error('Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const filtered = logs.filter(log =>
    log.requester?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    log.worksheet?.name?.toLowerCase().includes(search.toLowerCase()) ||
    log.column?.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Audit Logs</h1>
        <p className="text-gray-500 mt-1">Complete history of all changes and requests</p>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by user, sheet or field..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
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
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sheet</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Field</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Previous</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">New Value</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {log.requester?.full_name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{log.worksheet?.name}</td>
                  <td className="px-4 py-3 text-gray-600">{log.column?.display_name}</td>
                  <td className="px-4 py-3 text-red-500 line-through">
                    {log.previous_value || '(empty)'}
                  </td>
                  <td className="px-4 py-3 text-green-600 font-medium">
                    {log.requested_value}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      log.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : log.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;