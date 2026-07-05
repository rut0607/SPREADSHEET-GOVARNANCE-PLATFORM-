import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import StatCard from '../../components/shared/StatCard';
import { StatCardGridSkeleton, ListSkeleton } from '../../components/shared/skeletons';
import { ClipboardList, TrendingUp, AlertTriangle, Bell, Download, CheckCircle2 } from 'lucide-react';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const statusStyles = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-500'
};

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const EfficiencyDashboard = () => {
  const [tableRows, setTableRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ totalEntries: 0, avgOE: null, belowThreshold: 0, unresolvedAlerts: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportRange, setExportRange] = useState({ startDate: daysAgoISO(7), endDate: todayISO() });

  const fetchDashboardData = useCallback(async () => {
    try {
      const today = todayISO();
      const [assignmentsRes, reportRes, alertsRes] = await Promise.all([
        api.get('/machines/assignments'),
        api.get(`/production/daily-report?date=${today}`),
        api.get('/production/alerts')
      ]);

      const report = reportRes.data.data.report;
      const reportMap = new Map(report.map(r => [`${r.row_id}_${r.employee_id}`, r]));

      const allMachines = assignmentsRes.data.data.assignments.flatMap(group =>
        group.machines.map(m => ({
          row_id: m.row.id,
          employee_id: group.employee.id,
          employee_name: group.employee.full_name,
          machine_name: m.row.row_identifier,
          worksheet_name: m.worksheet.display_name || m.worksheet.name
        }))
      );

      const rows = allMachines.map(m => {
        const entry = reportMap.get(`${m.row_id}_${m.employee_id}`);
        return {
          key: `${m.row_id}_${m.employee_id}`,
          machine_name: m.machine_name,
          process_type: entry?.process_type || '—',
          employee_name: m.employee_name,
          target: entry?.target_output ?? null,
          actual: entry?.actual_output ?? null,
          oe_percentage: entry?.oe_percentage ?? null,
          status: entry?.status || 'gray'
        };
      });

      const oeValues = report.map(r => r.oe_percentage).filter(v => v !== null && v !== undefined);
      const avgOE = oeValues.length ? oeValues.reduce((s, v) => s + v, 0) / oeValues.length : null;

      setTableRows(rows);
      setAlerts(alertsRes.data.data.alerts);
      setStats({
        totalEntries: report.length,
        avgOE,
        belowThreshold: report.filter(r => r.status === 'red').length,
        unresolvedAlerts: alertsRes.data.data.alerts.length
      });
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleResolveAlert = async (alertId) => {
    try {
      await api.put(`/production/alerts/${alertId}/resolve`);
      toast.success('Alert resolved');
      fetchDashboardData();
    } catch (error) {
      // error toast handled by the axios response interceptor
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/production/export-excel', {
        params: exportRange,
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `production_efficiency_${exportRange.startDate}_to_${exportRange.endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (error) {
      toast.error('Failed to export report');
    } finally {
      setExporting(false);
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
        <ListSkeleton items={5} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <TrendingUp size={24} className="text-primary-600" />
            Efficiency Dashboard
          </h1>
          <p className="text-gray-500 mt-1">Live production efficiency across all machines • auto-refreshes every 5 minutes</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={exportRange.startDate}
            onChange={e => setExportRange({ ...exportRange, startDate: e.target.value })}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
          <input
            type="date"
            value={exportRange.endDate}
            onChange={e => setExportRange({ ...exportRange, endDate: e.target.value })}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Total Entries" value={stats.totalEntries} icon={ClipboardList} color="bg-blue-500" link="/admin/efficiency" />
        <StatCard title="Average OE Today" value={stats.avgOE !== null ? `${stats.avgOE.toFixed(1)}%` : 'N/A'} icon={TrendingUp} color="bg-green-500" link="/admin/efficiency" />
        <StatCard title="Machines Below Threshold" value={stats.belowThreshold} icon={AlertTriangle} color="bg-red-500" link="/admin/efficiency" />
        <StatCard title="Unresolved Alerts" value={stats.unresolvedAlerts} icon={Bell} color="bg-orange-500" link="/admin/efficiency" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Machine Status — Today</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Machine</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Process</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Output</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">OE %</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tableRows.map(row => (
                <tr key={row.key} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm font-medium text-gray-800">{row.machine_name}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{row.process_type}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{row.employee_name}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{row.target ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">{row.actual ?? '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600">
                    {row.oe_percentage !== null ? `${row.oe_percentage.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyles[row.status]}`}>
                      {row.status === 'gray' ? 'No entry' : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tableRows.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-500">No machines assigned yet</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Unresolved Alerts</h2>
        </div>
        {alerts.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 size={32} className="text-green-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No unresolved alerts</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {alerts.map(alert => (
              <div key={alert.id} className="p-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {alert.row?.row_identifier} — {alert.employee?.full_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    OE: {alert.actual_value ? (parseFloat(alert.actual_value) * 100).toFixed(1) : 'N/A'}% •
                    {' '}{alert.entry?.entry_date ? new Date(alert.entry.entry_date).toLocaleDateString() : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleResolveAlert(alert.id)}
                  className="px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EfficiencyDashboard;
