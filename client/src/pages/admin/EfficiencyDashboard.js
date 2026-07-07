import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import StatCard from '../../components/shared/StatCard';
import { StatCardGridSkeleton, ListSkeleton } from '../../components/shared/skeletons';
import { ClipboardList, TrendingUp, AlertTriangle, Bell, Download, CheckCircle2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const statusStyles = {
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-500'
};

const dotStyles = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  gray: 'bg-gray-300'
};

const textStyles = {
  green: 'text-green-600',
  yellow: 'text-yellow-600',
  red: 'text-red-600',
  gray: 'text-gray-400'
};

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

// Fixed OE bands used for employee-level (not per-machine-threshold) efficiency displays.
const getOEBandColor = (oePercent) => {
  if (oePercent === null || oePercent === undefined) return 'gray';
  if (oePercent > 85) return 'green';
  if (oePercent >= 75) return 'yellow';
  return 'red';
};

const EmployeeCard = ({ employee, summary, expanded, onToggleExpand }) => {
  if (!summary) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-10 w-20 bg-gray-200 rounded animate-pulse mt-3" />
      </div>
    );
  }

  if (summary.error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <p className="font-medium text-gray-800">{employee.full_name}</p>
        <p className="text-xs text-gray-500">{employee.role?.name || 'No role'}</p>
        <div className="flex items-center gap-2 mt-3 text-sm text-orange-600">
          <AlertCircle size={14} />
          Couldn't load performance data
        </div>
      </div>
    );
  }

  const { data } = summary;
  const weekBand = getOEBandColor(data.week_average);
  const todayBand = data.today_submitted ? getOEBandColor(data.today_oe) : 'gray';
  const lastFiveDays = data.seven_day_history.slice(-5);
  const entries = data.entries.slice(0, 30);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-800">{employee.full_name}</p>
          <p className="text-xs text-gray-500">{employee.role?.name || 'No role'}</p>
        </div>
        <p className={`text-2xl font-bold ${textStyles[weekBand]}`}>
          {data.week_average !== null ? `${data.week_average.toFixed(0)}%` : 'N/A'}
        </p>
      </div>

      <div className="mt-3">
        {data.today_submitted ? (
          <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusStyles[todayBand]}`}>
            Submitted — {data.today_oe !== null ? `${data.today_oe.toFixed(1)}%` : 'N/A'}
          </span>
        ) : (
          <span className="inline-block px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            Not submitted yet
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-3">
        <span className="text-xs text-gray-400 mr-1">5-day trend</span>
        {lastFiveDays.map(day => (
          <span
            key={day.date}
            title={`${day.date}: ${day.submitted ? `${day.oe_percentage.toFixed(0)}%` : 'No entry'}`}
            className={`w-2.5 h-2.5 rounded-full ${dotStyles[day.submitted ? getOEBandColor(day.oe_percentage) : 'gray']}`}
          />
        ))}
      </div>

      <button
        onClick={onToggleExpand}
        className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 mt-4"
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? 'Hide' : 'View'} last 30 entries
      </button>

      {expanded && (
        <div className="mt-3 border-t border-gray-100 pt-3 max-h-64 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">No entries in the last 30 days</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left font-medium py-1">Date</th>
                  <th className="text-left font-medium py-1">Machine</th>
                  <th className="text-right font-medium py-1">Output</th>
                  <th className="text-right font-medium py-1">OE%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map(entry => {
                  const oe = entry.oe_percentage !== null ? parseFloat(entry.oe_percentage) * 100 : null;
                  return (
                    <tr key={entry.id}>
                      <td className="py-1.5 text-gray-600">{entry.entry_date.split('T')[0]}</td>
                      <td className="py-1.5 text-gray-600">{entry.row?.data?.machine_no || entry.row?.row_identifier}</td>
                      <td className="py-1.5 text-right text-gray-600">{entry.actual_output ?? '—'}</td>
                      <td className={`py-1.5 text-right font-medium ${textStyles[getOEBandColor(oe)]}`}>
                        {oe !== null ? `${oe.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

const EfficiencyDashboard = () => {
  const [tableRows, setTableRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ totalEntries: 0, avgOE: null, belowThreshold: 0, unresolvedAlerts: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportRange, setExportRange] = useState({ startDate: daysAgoISO(7), endDate: todayISO() });
  const [activeTab, setActiveTab] = useState('machines');
  const [employees, setEmployees] = useState([]);
  const [employeeSummaries, setEmployeeSummaries] = useState({});
  const [employeeOverviewLoading, setEmployeeOverviewLoading] = useState(false);
  const [employeeOverviewLoaded, setEmployeeOverviewLoaded] = useState(false);
  const [expandedEmployeeId, setExpandedEmployeeId] = useState(null);

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
          machine_name: m.row.data?.machine_no || m.row.row_identifier,
          process_type: m.row.data?.process || '—',
          worksheet_name: m.worksheet.display_name || m.worksheet.name
        }))
      );

      const rows = allMachines.map(m => {
        const entry = reportMap.get(`${m.row_id}_${m.employee_id}`);
        return {
          key: `${m.row_id}_${m.employee_id}`,
          machine_name: m.machine_name,
          process_type: m.process_type,
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

  const fetchEmployeeOverview = useCallback(async () => {
    if (employeeOverviewLoaded) return;
    setEmployeeOverviewLoading(true);
    try {
      const usersRes = await api.get('/users');
      const nonAdmins = usersRes.data.data.users.filter(u => !u.is_admin);
      setEmployees(nonAdmins);

      const results = await Promise.allSettled(
        nonAdmins.map(emp => api.get('/production/my-entries', { params: { employeeId: emp.id }, skipErrorToast: true }))
      );

      const summaries = {};
      results.forEach((result, idx) => {
        const empId = nonAdmins[idx].id;
        summaries[empId] = result.status === 'fulfilled'
          ? { data: result.value.data.data, error: false }
          : { data: null, error: true };
      });
      setEmployeeSummaries(summaries);
      setEmployeeOverviewLoaded(true);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setEmployeeOverviewLoading(false);
    }
  }, [employeeOverviewLoaded]);

  useEffect(() => {
    if (activeTab === 'employees') fetchEmployeeOverview();
  }, [activeTab, fetchEmployeeOverview]);

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

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('machines')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'machines' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Machine Status
        </button>
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'employees' ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Employee Overview
        </button>
      </div>

      {activeTab === 'machines' && (
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
      )}

      {activeTab === 'employees' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {employeeOverviewLoading ? (
            <ListSkeleton items={4} />
          ) : employees.length === 0 ? (
            <div className="col-span-full bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
              No employees found
            </div>
          ) : (
            employees.map(emp => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                summary={employeeSummaries[emp.id]}
                expanded={expandedEmployeeId === emp.id}
                onToggleExpand={() => setExpandedEmployeeId(id => (id === emp.id ? null : emp.id))}
              />
            ))
          )}
        </div>
      )}

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
