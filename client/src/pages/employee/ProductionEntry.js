import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { WifiOff, Loader2, CheckCircle2, ChevronDown, ChevronUp, Flame } from 'lucide-react';

const TARGET_KEY_CANDIDATES = ['capacity', 'target_output', 'target', 'daily_capacity'];
const PROCESS_KEY_CANDIDATES = ['process_type', 'process', 'machine_type'];
const QUEUE_KEY = 'offlineProductionEntries';

const findColumnValue = (columns, row, candidates) => {
  if (!columns || !row) return null;
  for (const candidate of candidates) {
    const col = columns.find(c =>
      c.column_key?.toLowerCase().includes(candidate) ||
      c.display_name?.toLowerCase().replace(/\s+/g, '_').includes(candidate)
    );
    if (col && row.data?.[col.column_key] !== undefined && row.data[col.column_key] !== '') {
      return row.data[col.column_key];
    }
  }
  return null;
};

const todayISO = () => new Date().toISOString().split('T')[0];

const DEFAULT_THRESHOLD = 85;

const getEfficiencyStatus = (oePercent, thresholdPercent) => {
  if (oePercent === null || oePercent === undefined) return 'gray';
  if (oePercent >= thresholdPercent) return 'green';
  if (oePercent >= thresholdPercent - 5) return 'yellow';
  return 'red';
};

const statusStyles = {
  green: 'bg-green-50 text-green-700 border-green-200',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  gray: 'bg-gray-50 text-gray-600 border-gray-200'
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const pillStyles = {
  green: 'bg-green-50 text-green-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  red: 'bg-red-50 text-red-700',
  gray: 'bg-gray-100 text-gray-500'
};

const StatPill = ({ label, value, band }) => (
  <div className={`flex-1 rounded-xl px-2 py-2 text-center ${pillStyles[band] || pillStyles.gray}`}>
    <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</p>
    <p className="text-base font-bold mt-0.5">{value}</p>
  </div>
);

const EfficiencySummaryBanner = ({ summary }) => {
  if (!summary) return null;

  const todayBand = summary.today_submitted ? getEfficiencyStatus(summary.today_oe, DEFAULT_THRESHOLD) : 'gray';
  const weekBand = getEfficiencyStatus(summary.week_average, DEFAULT_THRESHOLD);

  return (
    <div className="flex gap-2 mt-3">
      <StatPill
        label="Today"
        value={summary.today_submitted ? `${summary.today_oe?.toFixed(0) ?? 'N/A'}%` : '—'}
        band={todayBand}
      />
      <StatPill
        label="Week"
        value={summary.week_average !== null ? `${summary.week_average.toFixed(0)}%` : '—'}
        band={weekBand}
      />
      <div className="flex-1 rounded-xl px-2 py-2 text-center bg-orange-50 text-orange-700">
        <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">Streak</p>
        <p className="text-base font-bold mt-0.5 flex items-center justify-center gap-1">
          <Flame size={13} />
          {summary.streak_days ?? 0}
        </p>
      </div>
    </div>
  );
};

const MachineCard = ({ machine, form, onChange, onSubmit, submitting, result }) => {
  const [notesOpen, setNotesOpen] = useState(!!form.notes);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{machine.machine_name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{machine.process_type}</p>
        </div>
        {result && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full whitespace-nowrap">
            <CheckCircle2 size={12} />
            Submitted
          </span>
        )}
      </div>

      <div className="mt-3 bg-gray-50 rounded-xl px-3 py-2 inline-block">
        <p className="text-xs text-gray-500">Target / Capacity</p>
        <p className="text-lg font-semibold text-gray-800">{machine.target ?? 'Not set'}</p>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Today's Output</label>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={form.actual_output}
          onChange={e => onChange(machine.row_id, { actual_output: e.target.value })}
          placeholder="Enter output"
          className="w-full text-2xl font-semibold px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
          style={{ minHeight: 56 }}
        />
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Shift</label>
        <div className="grid grid-cols-2 gap-2">
          {['day', 'night'].map(shiftOption => (
            <button
              key={shiftOption}
              type="button"
              onClick={() => onChange(machine.row_id, { shift: shiftOption })}
              className={`py-3 rounded-xl text-sm font-semibold capitalize transition-colors ${
                form.shift === shiftOption
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
              style={{ minHeight: 44 }}
            >
              {shiftOption}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setNotesOpen(o => !o)}
          className="flex items-center gap-1 text-sm text-gray-500 font-medium py-2"
          style={{ minHeight: 44 }}
        >
          {notesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Add a note (optional)
        </button>
        {notesOpen && (
          <textarea
            value={form.notes}
            onChange={e => onChange(machine.row_id, { notes: e.target.value })}
            placeholder="Any issues or comments..."
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => onSubmit(machine)}
        disabled={submitting || !form.actual_output}
        className="w-full mt-4 bg-primary-600 disabled:bg-primary-300 text-white text-lg font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
        style={{ minHeight: 52 }}
      >
        {submitting ? <Loader2 size={20} className="animate-spin" /> : null}
        {submitting ? 'Submitting...' : result ? 'Update Entry' : 'Submit'}
      </button>

      {result && (
        <div className={`mt-4 border rounded-xl p-4 text-center ${statusStyles[result.status] || statusStyles.gray}`}>
          <p className="text-xs font-medium uppercase tracking-wide">Your Efficiency</p>
          <p className="text-3xl font-bold mt-1">
            {result.oe_percentage !== null && result.oe_percentage !== undefined ? `${result.oe_percentage.toFixed(1)}%` : 'N/A'}
          </p>
        </div>
      )}
    </div>
  );
};

const ProductionEntry = () => {
  const { user } = useAuth();
  const [machines, setMachines] = useState([]);
  const [formState, setFormState] = useState({});
  const [results, setResults] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submittingRowId, setSubmittingRowId] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const processingQueue = useRef(false);

  const updateForm = (rowId, patch) => {
    setFormState(prev => ({ ...prev, [rowId]: { ...prev[rowId], ...patch } }));
  };

  const processQueue = useCallback(async () => {
    if (processingQueue.current || !navigator.onLine) return;
    processingQueue.current = true;
    try {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      if (queue.length === 0) return;

      const remaining = [];
      for (const item of queue) {
        try {
          const res = await api.post('/production/entry', item.payload);
          setResults(prev => ({ ...prev, [item.payload.row_id]: res.data.data }));
          toast.success(`Queued entry for ${item.machine_name} submitted successfully`);
        } catch (error) {
          remaining.push(item);
        }
      }
      localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    } finally {
      processingQueue.current = false;
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [assignmentsRes, entriesRes, thresholdsRes] = await Promise.all([
        api.get(`/machines/employee/${user.id}`),
        api.get('/production/my-entries'),
        api.get('/machines/thresholds')
      ]);

      const machineList = assignmentsRes.data.data.assignments.map(a => ({
        row_id: a.row.id,
        worksheet_id: a.worksheet.id,
        machine_name: a.row.data?.machine_no || a.row.row_identifier || 'Machine',
        target: findColumnValue(a.worksheet.column_definitions, a.row, TARGET_KEY_CANDIDATES),
        process_type: findColumnValue(a.worksheet.column_definitions, a.row, PROCESS_KEY_CANDIDATES) || 'General'
      }));
      setMachines(machineList);

      const today = todayISO();
      const initialForm = {};
      const initialResults = {};
      machineList.forEach(m => {
        initialForm[m.row_id] = { actual_output: '', shift: 'day', notes: '' };
      });

      entriesRes.data.data.entries.forEach(entry => {
        if (entry.entry_date.split('T')[0] === today) {
          initialForm[entry.row_id] = {
            actual_output: entry.actual_output?.toString() || '',
            shift: entry.shift,
            notes: entry.notes || ''
          };
          const oePercent = entry.oe_percentage !== null ? parseFloat(entry.oe_percentage) * 100 : null;
          const machine = machineList.find(m => m.row_id === entry.row_id);
          const threshold = thresholdsRes.data.data.thresholds.find(
            t => t.worksheet_id === entry.worksheet_id && t.process_type === machine?.process_type
          );
          const thresholdPercent = threshold ? parseFloat(threshold.min_threshold) : DEFAULT_THRESHOLD;
          initialResults[entry.row_id] = { oe_percentage: oePercent, status: getEfficiencyStatus(oePercent, thresholdPercent) };
        }
      });

      setFormState(initialForm);
      setResults(initialResults);
      setSummary({
        today_submitted: entriesRes.data.data.today_submitted,
        today_oe: entriesRes.data.data.today_oe,
        week_average: entriesRes.data.data.week_average,
        streak_days: entriesRes.data.data.streak_days
      });
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    processQueue();
    const handleOnline = () => { setIsOffline(false); processQueue(); };
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processQueue]);

  const handleSubmit = async (machine) => {
    const form = formState[machine.row_id];
    if (!form?.actual_output) {
      toast.error("Enter today's output first");
      return;
    }

    const payload = {
      row_id: machine.row_id,
      worksheet_id: machine.worksheet_id,
      actual_output: form.actual_output,
      entry_date: todayISO(),
      shift: form.shift,
      notes: form.notes
    };

    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({ payload, machine_name: machine.machine_name, queuedAt: Date.now() });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      toast.success('Saved offline. It will be sent when connection is restored.');
      return;
    }

    setSubmittingRowId(machine.row_id);
    try {
      const res = await api.post('/production/entry', payload);
      setResults(prev => ({ ...prev, [machine.row_id]: res.data.data }));
      toast.success('Entry submitted successfully');
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setSubmittingRowId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 max-w-md mx-auto space-y-4">
        <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
        <div className="h-32 bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-8">
      {isOffline && (
        <div className="bg-orange-500 text-white text-sm font-medium px-4 py-2.5 flex items-center gap-2">
          <WifiOff size={16} />
          You are offline. Your submission will be sent when connection is restored.
        </div>
      )}

      <div className="p-4">
        <h1 className="text-xl font-bold text-gray-900">{getGreeting()}, {user?.full_name?.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
        <EfficiencySummaryBanner summary={summary} />
      </div>

      <div className="px-4 space-y-4">
        {machines.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No machines assigned to you yet. Contact your admin.</p>
          </div>
        ) : (
          machines.map(machine => (
            <MachineCard
              key={machine.row_id}
              machine={machine}
              form={formState[machine.row_id] || { actual_output: '', shift: 'day', notes: '' }}
              onChange={updateForm}
              onSubmit={handleSubmit}
              submitting={submittingRowId === machine.row_id}
              result={results[machine.row_id]}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ProductionEntry;
