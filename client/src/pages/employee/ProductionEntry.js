import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import {
  WifiOff, Loader2, CheckCircle2, ChevronDown, ChevronUp, Flame, RefreshCw, Send, Edit3,
  AlertTriangle, Wrench, Package, Zap, Users as UsersIcon, MoreHorizontal, X
} from 'lucide-react';

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

const generateUUID = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  // Fallback for older browsers / non-secure contexts where crypto.randomUUID is unavailable.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Persists one idempotency key per (machine, day) across reloads, so a
// submit that's in flight when the page refreshes/crashes replays as the
// exact same request instead of creating a duplicate entry. Cleared once the
// server confirms success, so a later edit on the same day gets a fresh key.
const idempotencyStorageKey = (rowId, entryDate) => `idempotency:${rowId}:${entryDate}`;

const getIdempotencyKey = (rowId, entryDate) => {
  const storageKey = idempotencyStorageKey(rowId, entryDate);
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = generateUUID();
    localStorage.setItem(storageKey, key);
  }
  return key;
};

const clearIdempotencyKey = (rowId, entryDate) => {
  localStorage.removeItem(idempotencyStorageKey(rowId, entryDate));
};

const DEFAULT_THRESHOLD = 85;

// Mirrors server/src/controllers/downtimeController.js's DOWNTIME_CATEGORIES —
// kept in sync manually since client and server don't share a code module.
const DOWNTIME_CATEGORIES = [
  { name: 'Machine Issues', icon: Wrench },
  { name: 'Material Issues', icon: Package },
  { name: 'Power Issues', icon: Zap },
  { name: 'Operational Issues', icon: UsersIcon },
  { name: 'Other', icon: MoreHorizontal }
];

const DOWNTIME_REASONS = {
  'Machine Issues': ['Machine Breakdown', 'Routine Maintenance', 'Electrical Fault', 'Mechanical Fault'],
  'Material Issues': ['Raw Material Shortage', 'Material Quality Rejection', 'Waiting for Material'],
  'Power Issues': ['Power Cut', 'Load Shedding', 'Generator Failure'],
  'Operational Issues': ['Operator Absent', 'Shift Change Delay', 'Safety Inspection'],
  Other: ['Other']
};

const MIN_DOWNTIME_HOURS = 0.5;
const MAX_DOWNTIME_HOURS = 12;

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

// Mobile-native bottom sheet: slides up via a CSS transform transition
// (translateY(100%) -> translateY(0)) rather than mount/unmount, so both the
// open and close animations play. `machine` stays set for a beat after
// `visible` flips false, purely to let the close transition finish.
const DowntimeSheet = ({ machine, visible, onClose, onSubmitted }) => {
  const [category, setCategory] = useState(null);
  const [reason, setReason] = useState(null);
  const [customReason, setCustomReason] = useState('');
  const [duration, setDuration] = useState(1);
  const [shift, setShift] = useState('day');
  const [notes, setNotes] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!machine) return;
    setCategory(null);
    setReason(null);
    setCustomReason('');
    setDuration(1);
    setShift('day');
    setNotes('');
    setNotesOpen(false);
    setSubmitting(false);
    setSubmitted(false);
  }, [machine]);

  if (!machine) return null;

  const canSubmit = category && (category === 'Other' ? customReason.trim().length > 0 : !!reason);

  const adjustDuration = (delta) => {
    setDuration(prev => Math.min(MAX_DOWNTIME_HOURS, Math.max(MIN_DOWNTIME_HOURS, parseFloat((prev + delta).toFixed(1)))));
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await api.post('/downtime', {
        row_id: machine.row_id,
        worksheet_id: machine.worksheet_id,
        downtime_date: todayISO(),
        category,
        reason: category === 'Other' ? 'Other' : reason,
        custom_reason: category === 'Other' ? customReason.trim() : undefined,
        duration_hours: duration,
        shift,
        notes: notes || undefined
      });
      setSubmitted(true);
      if (navigator.vibrate) navigator.vibrate(50);
      setTimeout(() => {
        onSubmitted?.();
        onClose();
      }, 2000);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black z-40 transition-opacity duration-300 ${visible ? 'bg-opacity-50' : 'bg-opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[92vh] overflow-y-auto safe-bottom"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.3s ease' }}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between p-4 border-b border-gray-100 rounded-t-3xl">
          <h2 className="text-lg font-bold text-gray-900">Log Downtime for {machine.machine_name}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
            style={{ minHeight: 44, minWidth: 44 }}
          >
            <X size={22} />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <p className="text-lg font-bold text-gray-900">Downtime Logged</p>
            <p className="text-sm text-gray-500 mt-1">Your admin has been notified.</p>
          </div>
        ) : (
          <div className="p-4 space-y-5">
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Step 1 · Select Category</p>
              <div className="space-y-2">
                {DOWNTIME_CATEGORIES.map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { setCategory(name); setReason(null); }}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors ${
                      category === name ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-200 text-gray-700'
                    }`}
                    style={{ minHeight: 60 }}
                  >
                    <Icon size={22} />
                    <span className="font-semibold">{name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={`transition-all duration-300 overflow-hidden ${category ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
              <p className="text-sm font-semibold text-gray-700 mb-2">Step 2 · Select Reason</p>
              {category === 'Other' ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Describe the issue</label>
                  <textarea
                    value={customReason}
                    onChange={e => setCustomReason(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="What happened?"
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(DOWNTIME_REASONS[category] || []).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-colors ${
                        reason === r ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-200 text-gray-700'
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Step 3 · Hours of Downtime</p>
              <div className="flex items-center justify-center gap-4 bg-gray-50 rounded-2xl p-3">
                <button
                  type="button"
                  onClick={() => adjustDuration(-0.5)}
                  disabled={duration <= MIN_DOWNTIME_HOURS}
                  className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30 font-bold text-xl"
                >
                  −
                </button>
                <div className="text-center" style={{ minWidth: 80 }}>
                  <p className="text-3xl font-bold text-gray-900">{duration}</p>
                  <p className="text-xs text-gray-500">hours</p>
                </div>
                <button
                  type="button"
                  onClick={() => adjustDuration(0.5)}
                  disabled={duration >= MAX_DOWNTIME_HOURS}
                  className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30 font-bold text-xl"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Step 4 · Shift</p>
              <div className="grid grid-cols-2 gap-2">
                {['day', 'night'].map(shiftOption => (
                  <button
                    key={shiftOption}
                    type="button"
                    onClick={() => setShift(shiftOption)}
                    className={`py-3 rounded-xl text-sm font-semibold capitalize transition-colors ${
                      shift === shiftOption ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                    style={{ minHeight: 44 }}
                  >
                    {shiftOption}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setNotesOpen(o => !o)}
                className="flex items-center gap-1 text-sm text-gray-500 font-medium py-2"
                style={{ minHeight: 44 }}
              >
                {notesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                Add notes (optional)
              </button>
              {notesOpen && (
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Any additional details..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              )}
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="w-full bg-primary-600 disabled:bg-primary-300 text-white text-lg font-bold rounded-xl flex items-center justify-center gap-2 py-4"
              style={{ minHeight: 56 }}
            >
              {submitting ? <Loader2 size={20} className="animate-spin" /> : <AlertTriangle size={20} />}
              {submitting ? 'Logging...' : 'Log Downtime'}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const SWIPE_REVEAL_PX = 84;

const MachineCard = ({ machine, form, onChange, onSubmit, submitting, result, onLogDowntime }) => {
  const [notesOpen, setNotesOpen] = useState(!!form.notes);
  const [swipeX, setSwipeX] = useState(0);
  const outputInputRef = useRef(null);
  const touchStartX = useRef(null);
  const dragging = useRef(false);

  const handleTouchStart = (e) => {
    if (!result) return;
    touchStartX.current = e.touches[0].clientX;
    dragging.current = true;
  };

  const handleTouchMove = (e) => {
    if (!result || !dragging.current || touchStartX.current === null) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    setSwipeX(Math.max(-SWIPE_REVEAL_PX, Math.min(0, delta)));
  };

  const handleTouchEnd = () => {
    if (!result) return;
    dragging.current = false;
    setSwipeX(prev => (prev < -SWIPE_REVEAL_PX / 2 ? -SWIPE_REVEAL_PX : 0));
  };

  const handleEditTap = () => {
    setSwipeX(0);
    outputInputRef.current?.focus();
    outputInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="relative rounded-2xl overflow-hidden">
      {result && (
        <div className="absolute inset-y-0 right-0 flex items-center" style={{ width: SWIPE_REVEAL_PX }}>
          <button
            type="button"
            onClick={handleEditTap}
            className="w-full h-full flex flex-col items-center justify-center gap-1 bg-primary-600 text-white text-xs font-medium"
          >
            <Edit3 size={18} />
            Edit
          </button>
        </div>
      )}
      <div
        className="relative bg-white rounded-2xl shadow-sm border border-gray-200 p-4"
        style={{ transform: `translateX(${swipeX}px)`, transition: dragging.current ? 'none' : 'transform 0.2s ease' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{machine.machine_name}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{machine.process_type}</p>
        </div>
        {result && (
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
            result.pending ? 'text-yellow-700 bg-yellow-50' : 'text-green-700 bg-green-50'
          }`}>
            {result.pending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            {result.pending ? 'Syncing...' : 'Submitted'}
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
          ref={outputInputRef}
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
            maxLength={500}
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

      <button
        type="button"
        onClick={() => onLogDowntime(machine)}
        className="w-full mt-2 border-2 border-orange-200 bg-orange-50 text-orange-700 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
        style={{ minHeight: 44 }}
      >
        <AlertTriangle size={16} />
        Log Downtime
      </button>

      {result && (
        <div className={`mt-4 border rounded-xl p-4 text-center ${result.pending ? statusStyles.gray : (statusStyles[result.status] || statusStyles.gray)}`}>
          <p className="text-xs font-medium uppercase tracking-wide">Your Efficiency</p>
          <p className="text-3xl font-bold mt-1">
            {result.pending
              ? <Loader2 size={24} className="animate-spin inline" />
              : (result.oe_percentage !== null && result.oe_percentage !== undefined ? `${result.oe_percentage.toFixed(1)}%` : 'N/A')}
          </p>
        </div>
      )}
      </div>
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
  const [dirtyRows, setDirtyRows] = useState(() => new Set());
  const [submittingAll, setSubmittingAll] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [downtimeMachine, setDowntimeMachine] = useState(null);
  const [downtimeSheetVisible, setDowntimeSheetVisible] = useState(false);
  const processingQueue = useRef(false);
  const pullStartY = useRef(null);

  const openDowntimeSheet = (machine) => {
    setDowntimeMachine(machine);
    requestAnimationFrame(() => setDowntimeSheetVisible(true));
  };

  const closeDowntimeSheet = () => {
    setDowntimeSheetVisible(false);
    setTimeout(() => setDowntimeMachine(null), 300);
  };

  const updateForm = (rowId, patch) => {
    setFormState(prev => ({ ...prev, [rowId]: { ...prev[rowId], ...patch } }));
    if (patch.actual_output !== undefined) {
      setDirtyRows(prev => new Set(prev).add(rowId));
    }
  };

  const vibrateOnSuccess = () => {
    if (navigator.vibrate) navigator.vibrate(50);
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
          const res = await api.post('/production/entry', item.payload, {
            headers: item.idempotencyKey ? { 'Idempotency-Key': item.idempotencyKey } : {}
          });
          setResults(prev => ({ ...prev, [item.payload.row_id]: res.data.data }));
          setDirtyRows(prev => {
            const next = new Set(prev);
            next.delete(item.payload.row_id);
            return next;
          });
          if (item.idempotencyKey) clearIdempotencyKey(item.payload.row_id, item.payload.entry_date);
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

    const entryDate = todayISO();
    const idempotencyKey = getIdempotencyKey(machine.row_id, entryDate);

    const payload = {
      row_id: machine.row_id,
      worksheet_id: machine.worksheet_id,
      actual_output: form.actual_output,
      entry_date: entryDate,
      shift: form.shift,
      notes: form.notes
    };

    if (!navigator.onLine) {
      const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      queue.push({ payload, machine_name: machine.machine_name, queuedAt: Date.now(), idempotencyKey });
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      toast.success('Saved offline. It will be sent when connection is restored.');
      return;
    }

    // Optimistic update: show the card as submitted (with a pending/syncing
    // indicator) immediately, so slow connections don't feel like a hang.
    // Rolled back to whatever was there before if the request fails.
    const previousResult = results[machine.row_id];
    setResults(prev => ({ ...prev, [machine.row_id]: { pending: true } }));

    setSubmittingRowId(machine.row_id);
    try {
      const res = await api.post('/production/entry', payload, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });
      setResults(prev => ({ ...prev, [machine.row_id]: res.data.data }));
      setDirtyRows(prev => {
        const next = new Set(prev);
        next.delete(machine.row_id);
        return next;
      });
      clearIdempotencyKey(machine.row_id, entryDate);
      vibrateOnSuccess();
      toast.success('Entry submitted successfully');
    } catch (error) {
      setResults(prev => {
        const next = { ...prev };
        if (previousResult) next[machine.row_id] = previousResult;
        else delete next[machine.row_id];
        return next;
      });
      // error toast handled by the axios response interceptor
    } finally {
      setSubmittingRowId(null);
    }
  };

  const pendingMachines = machines.filter(m => dirtyRows.has(m.row_id) && formState[m.row_id]?.actual_output);

  const handleSubmitAll = async () => {
    setSubmittingAll(true);
    try {
      for (const machine of pendingMachines) {
        // eslint-disable-next-line no-await-in-loop
        await handleSubmit(machine);
      }
      toast.success('All pending entries submitted');
    } finally {
      setSubmittingAll(false);
    }
  };

  const PULL_THRESHOLD = 70;

  const handlePullStart = (e) => {
    if (window.scrollY > 0) return;
    pullStartY.current = e.touches[0].clientY;
  };

  const handlePullMove = (e) => {
    if (pullStartY.current === null) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) {
      setPullDistance(Math.min(delta, PULL_THRESHOLD * 1.5));
    }
  };

  const handlePullEnd = async () => {
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      await fetchData();
      setRefreshing(false);
    }
    setPullDistance(0);
    pullStartY.current = null;
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
    <div
      className="max-w-md mx-auto pb-8 no-pull-refresh scroll-smooth"
      onTouchStart={handlePullStart}
      onTouchMove={handlePullMove}
      onTouchEnd={handlePullEnd}
    >
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center text-primary-600 overflow-hidden transition-all"
          style={{ height: refreshing ? 40 : pullDistance }}
        >
          <RefreshCw size={20} className={refreshing || pullDistance >= PULL_THRESHOLD ? 'animate-spin' : ''} />
        </div>
      )}

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
              onLogDowntime={openDowntimeSheet}
            />
          ))
        )}
      </div>

      {pendingMachines.length > 0 && (
        <div className="fixed bottom-20 md:bottom-4 left-0 right-0 flex justify-center px-4 z-30 safe-bottom">
          <button
            onClick={handleSubmitAll}
            disabled={submittingAll}
            className="flex items-center gap-2 bg-primary-600 disabled:bg-primary-300 text-white font-semibold px-5 py-3 rounded-full shadow-lg"
            style={{ minHeight: 48 }}
          >
            {submittingAll ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {submittingAll ? 'Submitting...' : `Submit All (${pendingMachines.length})`}
          </button>
        </div>
      )}

      <DowntimeSheet
        machine={downtimeMachine}
        visible={downtimeSheetVisible}
        onClose={closeDowntimeSheet}
      />
    </div>
  );
};

export default ProductionEntry;
