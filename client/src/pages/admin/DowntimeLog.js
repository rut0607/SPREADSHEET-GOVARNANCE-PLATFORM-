import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import StatCard from '../../components/shared/StatCard';
import { ListSkeleton } from '../../components/shared/skeletons';
import { AlertTriangle, Clock, Cpu, Tag, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const CATEGORY_COLORS = {
  'Machine Issues': '#DC2626',
  'Material Issues': '#F59E0B',
  'Power Issues': '#7B2FBE',
  'Operational Issues': '#1B2B5E',
  Other: '#9CA3AF'
};

const statusStyles = {
  submitted: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700'
};

const DowntimeLog = () => {
  const [range, setRange] = useState({ startDate: daysAgoISO(7), endDate: todayISO() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/downtime/summary', { params: range });
      setData(res.data.data);
    } catch (error) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleResolve = async (id) => {
    setResolvingId(id);
    try {
      await api.put(`/downtime/${id}/resolve`);
      toast.success('Downtime record resolved');
      fetchSummary();
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setResolvingId(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/downtime/export-excel', { params: range, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `downtime_log_${range.startDate}_to_${range.endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Downtime log downloaded');
    } catch (error) {
      toast.error('Failed to export downtime log');
    } finally {
      setExporting(false);
    }
  };

  const mostAffectedMachine = data?.by_machine?.[0]?.machine_name || 'None';
  const mostCommonCategory = data?.by_category?.[0]?.category || 'None';
  const mostCommonReason = data?.most_common_reason?.reason || 'None';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <AlertTriangle size={24} className="text-primary-600" />
            Downtime Log
          </h1>
          <p className="text-gray-500 mt-1">Machine downtime records across the plant</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={range.startDate}
            onChange={e => setRange({ ...range, startDate: e.target.value })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <input
            type="date"
            value={range.endDate}
            onChange={e => setRange({ ...range, endDate: e.target.value })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {loading || !data ? (
        <ListSkeleton items={4} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Downtime Hours" value={`${data.total_hours}h`} icon={Clock} color="bg-red-500" link="/admin/downtime" />
            <StatCard title="Most Affected Machine" value={mostAffectedMachine} icon={Cpu} color="bg-orange-500" link="/admin/downtime" />
            <StatCard title="Most Common Category" value={mostCommonCategory} icon={Tag} color="bg-primary-600" link="/admin/downtime" />
            <StatCard title="Most Common Reason" value={mostCommonReason} icon={AlertTriangle} color="bg-purple-500" link="/admin/downtime" />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Downtime Hours by Category</h2>
            {data.by_category.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">No downtime logged in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.by_category}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}h`} />
                  <Bar dataKey="total_hours" name="Hours" radius={[4, 4, 0, 0]}>
                    {data.by_category.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={CATEGORY_COLORS[entry.category] || '#9CA3AF'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Downtime Records</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Machine</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Shift</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.records.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-gray-600">{r.date}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-800">{r.employee_name}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{r.machine_name}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{r.category}</td>
                      <td className="px-5 py-3 text-sm text-gray-600">{r.reason}</td>
                      <td className="px-5 py-3 text-sm text-gray-600 text-right">{r.duration_hours}h</td>
                      <td className="px-5 py-3 text-sm text-gray-600 capitalize">{r.shift}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {r.status !== 'resolved' && (
                          <button
                            onClick={() => handleResolve(r.id)}
                            disabled={resolvingId === r.id}
                            className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 rounded-lg transition-colors"
                          >
                            {resolvingId === r.id ? 'Resolving...' : 'Resolve'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.records.length === 0 && (
                <p className="p-8 text-center text-sm text-gray-500">No downtime records in this period</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DowntimeLog;
