import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import StatCard from '../../components/shared/StatCard';
import { ListSkeleton } from '../../components/shared/skeletons';
import {
  TrendingUp, TrendingDown, Minus, CheckSquare, AlertTriangle, Clock, Search
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell
} from 'recharts';
import { DEFAULT_EFFICIENCY_THRESHOLD, WARNING_THRESHOLD, CRITICAL_THRESHOLD } from '../../constants/thresholds';

const DEFAULT_THRESHOLD = DEFAULT_EFFICIENCY_THRESHOLD;
const DAY_OPTIONS = [30, 60, 90];

const trendMeta = {
  improving: { label: 'Improving', icon: TrendingUp, className: 'bg-green-50 text-green-700 border-green-200' },
  declining: { label: 'Declining', icon: TrendingDown, className: 'bg-red-50 text-red-700 border-red-200' },
  stable: { label: 'Stable', icon: Minus, className: 'bg-gray-50 text-gray-600 border-gray-200' }
};

const oeColor = (value) => {
  if (value === null || value === undefined) return '#9CA3AF';
  if (value > WARNING_THRESHOLD) return '#16A34A';
  if (value >= CRITICAL_THRESHOLD) return '#CA8A04';
  return '#DC2626';
};

const EmployeePerformance = () => {
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [days, setDays] = useState(30);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const res = await api.get('/users');
        const nonAdmins = res.data.data.users.filter(u => !u.is_admin);
        setEmployees(nonAdmins);
        if (nonAdmins.length > 0) setSelectedEmployeeId(nonAdmins[0].id);
      } catch (error) {
        // error toast handled by the axios response interceptor
      } finally {
        setEmployeesLoading(false);
      }
    };
    fetchEmployees();
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!selectedEmployeeId) return;
    setLoading(true);
    try {
      const res = await api.get(`/production/performance-history/${selectedEmployeeId}`, { params: { days } });
      setHistory(res.data.data);
    } catch (error) {
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }, [selectedEmployeeId, days]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.trim().toLowerCase();
    return employees.filter(e => e.full_name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q));
  }, [employees, search]);

  const chartData = useMemo(() => {
    if (!history) return [];
    return history.daily_oe.map(p => ({
      date: p.date.slice(5),
      oe: p.oe_percentage
    }));
  }, [history]);

  const weeklyChartData = useMemo(() => {
    if (!history) return [];
    return history.weekly_averages.map(w => ({
      week: w.week_start.slice(5),
      oe: w.average_oe
    }));
  }, [history]);

  const downtimeByCategory = useMemo(() => {
    if (!history?.downtime_by_category) return [];
    return history.downtime_by_category;
  }, [history]);

  const trend = history ? (trendMeta[history.trend] || trendMeta.stable) : trendMeta.stable;
  const TrendIcon = trend.icon;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <TrendingUp size={24} className="text-primary-600" />
          Employee Performance History
        </h1>
        <p className="text-gray-500 mt-1">Track individual OE trends, submission reliability, and downtime over time</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {DAY_OPTIONS.map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              days === d ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:col-span-1 h-fit">
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          {employeesLoading ? (
            <ListSkeleton items={5} />
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filteredEmployees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => setSelectedEmployeeId(emp.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    selectedEmployeeId === emp.id
                      ? 'bg-primary-50 text-primary-700 border border-primary-200 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <p className="font-medium">{emp.full_name}</p>
                  <p className="text-xs text-gray-400">{emp.role?.name || 'No role'}</p>
                </button>
              ))}
              {filteredEmployees.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No employees found</p>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-6">
          {loading || !history ? (
            <ListSkeleton items={4} />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title="Average OE"
                  value={history.overall_average_oe !== null ? `${history.overall_average_oe.toFixed(1)}%` : 'N/A'}
                  icon={TrendingUp}
                  color="bg-primary-600"
                  link="/admin/performance"
                />
                <StatCard
                  title="Submission Rate"
                  value={history.submission_rate !== null ? `${history.submission_rate.toFixed(0)}%` : 'N/A'}
                  icon={CheckSquare}
                  color="bg-blue-500"
                  link="/admin/performance"
                />
                <StatCard
                  title="Days Below Threshold"
                  value={history.days_below_threshold}
                  icon={AlertTriangle}
                  color={history.days_below_threshold > 0 ? 'bg-red-500' : 'bg-green-500'}
                  link="/admin/performance"
                />
                <StatCard
                  title="Total Downtime Hours"
                  value={`${history.total_downtime_hours}h`}
                  icon={Clock}
                  color="bg-orange-500"
                  link="/admin/performance"
                />
              </div>

              <div className={`rounded-xl border p-4 flex items-center gap-3 ${trend.className}`}>
                <TrendIcon size={20} />
                <div>
                  <p className="font-semibold text-sm">{trend.label} performance trend</p>
                  <p className="text-xs opacity-80">
                    Comparing the first half to the second half of the last {history.days} days
                    {history.comparison_to_plant !== null && (
                      <> • {history.comparison_to_plant >= 0 ? '+' : ''}{history.comparison_to_plant}% vs plant average</>
                    )}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-800 mb-4">OE Trend</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip formatter={(v) => (v === null ? 'No entry' : `${v}%`)} />
                    <ReferenceLine y={DEFAULT_THRESHOLD} stroke="#9CA3AF" strokeDasharray="4 4" label={{ value: 'Threshold', fontSize: 11, fill: '#9CA3AF', position: 'insideTopRight' }} />
                    <Line
                      type="monotone"
                      dataKey="oe"
                      stroke="#1B2B5E"
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload, index } = props;
                        if (payload.oe === null || payload.oe === undefined) return null;
                        return <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill={oeColor(payload.oe)} stroke="none" />;
                      }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-800 mb-4">Weekly Averages</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weeklyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
                    <Tooltip formatter={(v) => (v === null ? 'No data' : `${v}%`)} />
                    <ReferenceLine y={DEFAULT_THRESHOLD} stroke="#9CA3AF" strokeDasharray="4 4" />
                    <Bar dataKey="oe" radius={[4, 4, 0, 0]}>
                      {weeklyChartData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={oeColor(entry.oe)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {weeklyChartData.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-4">No weekly data available</p>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-800 mb-4">Performance Stats</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Best day</span>
                    <span className="font-medium text-gray-800">
                      {history.best_day ? `${history.best_day.date} (${history.best_day.oe_percentage}%)` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Worst day</span>
                    <span className="font-medium text-gray-800">
                      {history.worst_day ? `${history.worst_day.date} (${history.worst_day.oe_percentage}%)` : 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Most common downtime reason</span>
                    <span className="font-medium text-gray-800">{history.most_common_downtime_reason || 'None'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Plant average (same period)</span>
                    <span className="font-medium text-gray-800">
                      {history.plant_average_oe !== null ? `${history.plant_average_oe}%` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-800 mb-1">Downtime Summary</h2>
                <p className="text-sm text-gray-500 mb-4">{history.total_downtime_hours} total hours logged in this period</p>
                {downtimeByCategory.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No downtime logged in this period</p>
                ) : (
                  <div className="space-y-2">
                    {downtimeByCategory.map(cat => (
                      <div key={cat.category} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-36 shrink-0">{cat.category}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-orange-500 h-full rounded-full"
                            style={{ width: `${Math.min(100, (cat.hours / history.total_downtime_hours) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-14 text-right">{cat.hours}h</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeePerformance;
