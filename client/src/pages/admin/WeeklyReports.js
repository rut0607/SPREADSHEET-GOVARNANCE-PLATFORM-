import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { BarChart2, Download, Plus, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';
import { ListSkeleton } from '../../components/shared/skeletons';
import { WARNING_THRESHOLD, CRITICAL_THRESHOLD } from '../../constants/thresholds';

const trendIcon = {
  up: <TrendingUp size={14} className="text-green-600" />,
  down: <TrendingDown size={14} className="text-red-600" />,
  stable: <Minus size={14} className="text-gray-400" />,
  new: <Sparkles size={14} className="text-primary-500" />
};

const getOEBandColor = (oePercent) => {
  if (oePercent === null || oePercent === undefined) return 'text-gray-400';
  if (oePercent > WARNING_THRESHOLD) return 'text-green-600';
  if (oePercent >= CRITICAL_THRESHOLD) return 'text-yellow-600';
  return 'text-red-600';
};

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

const WeeklyReports = () => {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exportingId, setExportingId] = useState(null);
  const [generateForm, setGenerateForm] = useState({ startDate: daysAgoISO(7), endDate: todayISO() });

  const fetchReports = useCallback(async () => {
    try {
      const res = await api.get('/reports/weekly');
      setReports(res.data.data.reports);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const openReport = async (id) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/reports/weekly/${id}`);
      setSelectedReport(res.data.data.report);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await api.post('/reports/weekly/generate', generateForm);
      toast.success('Report generated successfully');
      setShowGenerateForm(false);
      await fetchReports();
      setSelectedReport(res.data.data.report);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async (id, weekStart, weekEnd) => {
    setExportingId(id);
    try {
      const res = await api.get(`/reports/weekly/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `weekly_report_${weekStart}_to_${weekEnd}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to export report');
    } finally {
      setExportingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <ListSkeleton items={5} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart2 size={24} className="text-primary-600" />
            Weekly Reports
          </h1>
          <p className="text-gray-500 mt-1">Automated efficiency reports generated every Monday</p>
        </div>
        <button
          onClick={() => setShowGenerateForm(s => !s)}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
        >
          <Plus size={16} />
          Generate Report
        </button>
      </div>

      {showGenerateForm && (
        <form onSubmit={handleGenerate} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              required
              value={generateForm.startDate}
              onChange={e => setGenerateForm({ ...generateForm, startDate: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
            <input
              type="date"
              required
              value={generateForm.endDate}
              onChange={e => setGenerateForm({ ...generateForm, endDate: e.target.value })}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={generating}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 lg:col-span-1">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">All Reports</h2>
          </div>
          <div className="max-h-[36rem] overflow-y-auto divide-y divide-gray-100">
            {reports.map(report => (
              <button
                key={report.id}
                onClick={() => openReport(report.id)}
                className={`w-full text-left p-4 transition-colors ${
                  selectedReport?.id === report.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                }`}
              >
                <p className="text-sm font-medium text-gray-800">
                  {report.week_start?.split('T')[0]} → {report.week_end?.split('T')[0]}
                </p>
                <p className={`text-lg font-bold mt-1 ${getOEBandColor(report.overall?.average_oe)}`}>
                  {report.overall?.average_oe !== null && report.overall?.average_oe !== undefined
                    ? `${report.overall.average_oe.toFixed(1)}%`
                    : 'N/A'} <span className="text-xs font-normal text-gray-400">plant OE</span>
                </p>
              </button>
            ))}
            {reports.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-500">No reports generated yet</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {detailLoading ? (
            <ListSkeleton items={4} />
          ) : !selectedReport ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <BarChart2 size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Select a report to see the full breakdown</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm text-gray-500">
                    {selectedReport.report_data.week_start} → {selectedReport.report_data.week_end}
                  </p>
                  <p className={`text-5xl font-bold mt-1 ${getOEBandColor(selectedReport.report_data.overall?.average_oe)}`}>
                    {selectedReport.report_data.overall?.average_oe !== null && selectedReport.report_data.overall?.average_oe !== undefined
                      ? `${selectedReport.report_data.overall.average_oe.toFixed(1)}%`
                      : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Overall Plant Efficiency</p>
                </div>
                <button
                  onClick={() => handleExport(selectedReport.id, selectedReport.report_data.week_start, selectedReport.report_data.week_end)}
                  disabled={exportingId === selectedReport.id}
                  className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg transition-colors font-medium text-sm"
                >
                  <Download size={16} />
                  {exportingId === selectedReport.id ? 'Exporting...' : 'Export to Excel'}
                </button>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">Machine Breakdown</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Machine</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Process</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Entries</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Avg OE</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Best Day</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Worst Day</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedReport.report_data.machines.map(m => (
                        <tr key={m.row_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium text-gray-800">{m.machine_name}</td>
                          <td className="px-5 py-3 text-sm text-gray-600">{m.process_type}</td>
                          <td className="px-5 py-3 text-sm text-gray-600">{m.total_entries}</td>
                          <td className={`px-5 py-3 text-sm font-medium ${getOEBandColor(m.average_oe)}`}>
                            {m.average_oe !== null ? `${m.average_oe.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-600">
                            {m.best_day ? `${m.best_day.date} (${m.best_day.oe_percentage.toFixed(1)}%)` : '—'}
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-600">
                            {m.worst_day ? `${m.worst_day.date} (${m.worst_day.oe_percentage.toFixed(1)}%)` : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <span className="flex items-center gap-1 text-xs text-gray-600">
                              {trendIcon[m.trend]} {m.trend}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selectedReport.report_data.machines.length === 0 && (
                    <p className="p-6 text-center text-sm text-gray-500">No machine activity this week</p>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">Employee Performance</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Machines</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Avg OE</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Submission Rate</th>
                        <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Days Below Threshold</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedReport.report_data.employees.map(e => (
                        <tr key={e.employee_id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium text-gray-800">{e.employee_name}</td>
                          <td className="px-5 py-3 text-sm text-gray-600">{e.machines_covered}</td>
                          <td className={`px-5 py-3 text-sm font-medium ${getOEBandColor(e.average_oe)}`}>
                            {e.average_oe !== null ? `${e.average_oe.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-600">{e.submission_rate}%</td>
                          <td className="px-5 py-3 text-sm text-gray-600">{e.days_below_threshold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {selectedReport.report_data.employees.length === 0 && (
                    <p className="p-6 text-center text-sm text-gray-500">No employee activity this week</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeeklyReports;
