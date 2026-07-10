import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import { ListSkeleton } from '../../components/shared/skeletons';
import { BarChart2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import {
  ComposedChart, Bar, Line, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell
} from 'recharts';
import { WARNING_THRESHOLD, CRITICAL_THRESHOLD } from '../../constants/thresholds';

const WEEK_OPTIONS = [4, 8, 12];

const oeBand = (value) => {
  if (value === null || value === undefined) return 'gray';
  if (value > WARNING_THRESHOLD) return 'green';
  if (value >= CRITICAL_THRESHOLD) return 'yellow';
  return 'red';
};

const oeTextClass = {
  green: 'text-green-600',
  yellow: 'text-yellow-600',
  red: 'text-red-600',
  gray: 'text-gray-400'
};

const formatWeekLabel = (weekStart) => weekStart.slice(5);

const TrendAnalysis = () => {
  const [weeks, setWeeks] = useState(4);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [weekTableOpen, setWeekTableOpen] = useState(false);

  const fetchTrend = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/production/trend-analysis', { params: { weeks } });
      setData(res.data.data);
    } catch (error) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [weeks]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  const weekly = useMemo(() => data?.weekly || [], [data]);
  const currentWeek = weekly.length ? weekly[weekly.length - 1] : null;

  const plantChartData = useMemo(() => weekly.map(w => ({
    week: formatWeekLabel(w.week_start),
    target: w.total_target,
    actual: w.total_actual,
    oe: w.plant_oe_percentage
  })), [weekly]);

  const gapChartData = useMemo(() => weekly.map(w => ({
    week: formatWeekLabel(w.week_start),
    gap: w.gap,
    trend: w.gap_trend
  })), [weekly]);

  const periodAverageOE = useMemo(() => {
    const values = weekly.map(w => w.plant_oe_percentage).filter(v => v !== null && v !== undefined);
    return values.length ? parseFloat((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)) : null;
  }, [weekly]);

  const totalGap = useMemo(() => {
    if (!weekly.length) return null;
    return parseFloat(weekly.reduce((s, w) => s + w.gap, 0).toFixed(2));
  }, [weekly]);

  const machineBreakdown = useMemo(() => {
    if (!weekly.length) return [];
    const byRow = new Map();
    weekly.forEach((week, weekIdx) => {
      week.machines.forEach(m => {
        if (!byRow.has(m.row_id)) {
          byRow.set(m.row_id, {
            row_id: m.row_id,
            machine_name: m.machine_name,
            process_type: m.process_type,
            employee_name: m.employee_name,
            total_target: 0,
            total_actual: 0,
            firstOE: null,
            lastOE: null
          });
        }
        const entry = byRow.get(m.row_id);
        entry.total_target += m.target || 0;
        entry.total_actual += m.actual || 0;
        if (weekIdx === 0) entry.firstOE = m.oe_percentage;
        if (weekIdx === weekly.length - 1) entry.lastOE = m.oe_percentage;
      });
    });
    return Array.from(byRow.values()).map(m => {
      const overallOE = m.total_target > 0 ? parseFloat(((m.total_actual / m.total_target) * 100).toFixed(2)) : null;
      let trend = 'stable';
      if (m.firstOE !== null && m.lastOE !== null) {
        if (m.lastOE - m.firstOE > 2) trend = 'up';
        else if (m.firstOE - m.lastOE > 2) trend = 'down';
      }
      return {
        ...m,
        total_target: parseFloat(m.total_target.toFixed(2)),
        total_actual: parseFloat(m.total_actual.toFixed(2)),
        overall_oe: overallOE,
        trend
      };
    });
  }, [weekly]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <BarChart2 size={24} className="text-primary-600" />
          Target vs Actual Trend Analysis
        </h1>
        <p className="text-gray-500 mt-1">Plant-wide production targets against actual output over time</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {WEEK_OPTIONS.map(w => (
          <button
            key={w}
            onClick={() => setWeeks(w)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              weeks === w ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Last {w} weeks
          </button>
        ))}
      </div>

      {loading || !data ? (
        <ListSkeleton items={4} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 font-medium">Current Week OE</p>
              <p className={`text-3xl font-bold mt-1 ${oeTextClass[oeBand(currentWeek?.plant_oe_percentage)]}`}>
                {currentWeek?.plant_oe_percentage !== null && currentWeek?.plant_oe_percentage !== undefined
                  ? `${currentWeek.plant_oe_percentage}%` : 'N/A'}
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 font-medium">vs Last Week</p>
              <div className="flex items-center gap-1 mt-1">
                {currentWeek?.oe_change_vs_previous_week > 0 && <TrendingUp size={20} className="text-green-600" />}
                {currentWeek?.oe_change_vs_previous_week < 0 && <TrendingDown size={20} className="text-red-600" />}
                {(!currentWeek?.oe_change_vs_previous_week || currentWeek.oe_change_vs_previous_week === 0) && <Minus size={20} className="text-gray-400" />}
                <p className="text-3xl font-bold text-gray-800">
                  {currentWeek?.oe_change_vs_previous_week !== null && currentWeek?.oe_change_vs_previous_week !== undefined
                    ? `${currentWeek.oe_change_vs_previous_week > 0 ? '+' : ''}${currentWeek.oe_change_vs_previous_week}%` : 'N/A'}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 font-medium">Period Average OE</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{periodAverageOE !== null ? `${periodAverageOE}%` : 'N/A'}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <p className="text-sm text-gray-500 font-medium">Total Gap ({weeks}w)</p>
              <p className="text-3xl font-bold text-gray-800 mt-1">{totalGap !== null ? totalGap.toLocaleString() : 'N/A'}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Plant Wide Trend</h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={plantChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="target" name="Target" fill="#E5E7EB" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="actual" name="Actual" fill="#1B2B5E" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="oe" name="OE %" stroke="#FF6B35" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Gap Analysis</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gapChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, name, props) => [v.toLocaleString(), `Gap (${props.payload.trend || 'first week'})`]} />
                <Bar dataKey="gap" radius={[4, 4, 0, 0]}>
                  {gapChartData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.trend === 'widening' ? '#DC2626' : entry.trend === 'narrowing' ? '#16A34A' : '#9CA3AF'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Machine Breakdown ({weeks}-week totals)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Machine / Process</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total Target</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total Actual</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">OE %</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {machineBreakdown.map(m => (
                    <tr key={m.row_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-800">
                        {m.machine_name}
                        <span className="block text-xs text-gray-400 font-normal">{m.process_type}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-600">{m.employee_name}</td>
                      <td className="px-5 py-3 text-sm text-gray-600 text-right">{m.total_target.toLocaleString()}</td>
                      <td className="px-5 py-3 text-sm text-gray-600 text-right">{m.total_actual.toLocaleString()}</td>
                      <td className={`px-5 py-3 text-sm font-semibold text-right ${oeTextClass[oeBand(m.overall_oe)]}`}>
                        {m.overall_oe !== null ? `${m.overall_oe}%` : 'N/A'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {m.trend === 'up' && <TrendingUp size={16} className="text-green-600 inline" />}
                        {m.trend === 'down' && <TrendingDown size={16} className="text-red-600 inline" />}
                        {m.trend === 'stable' && <Minus size={16} className="text-gray-400 inline" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {machineBreakdown.length === 0 && (
                <p className="p-8 text-center text-sm text-gray-500">No machines assigned yet</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <button
              onClick={() => setWeekTableOpen(o => !o)}
              className="w-full flex items-center justify-between p-5 text-left"
            >
              <h2 className="font-semibold text-gray-800">Week by Week Summary</h2>
              {weekTableOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {weekTableOpen && (
              <div className="overflow-x-auto border-t border-gray-100">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Week</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actual</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">OE %</th>
                      <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Gap</th>
                      <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Gap Trend</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {weekly.map(w => (
                      <tr key={w.week_start} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 text-sm font-medium text-gray-800">{w.week_start} – {w.week_end}</td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-right">{w.total_target.toLocaleString()}</td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-right">{w.total_actual.toLocaleString()}</td>
                        <td className={`px-5 py-3 text-sm font-semibold text-right ${oeTextClass[oeBand(w.plant_oe_percentage)]}`}>
                          {w.plant_oe_percentage !== null ? `${w.plant_oe_percentage}%` : 'N/A'}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 text-right">{w.gap.toLocaleString()}</td>
                        <td className="px-5 py-3 text-center text-xs">
                          {w.gap_trend === 'widening' && <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">Widening</span>}
                          {w.gap_trend === 'narrowing' && <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">Narrowing</span>}
                          {w.gap_trend === 'unchanged' && <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-500 font-medium">Unchanged</span>}
                          {!w.gap_trend && <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TrendAnalysis;
