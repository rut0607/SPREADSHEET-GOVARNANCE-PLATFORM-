const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');
const XLSX = require('xlsx');
const { getGoogleSheetsClient } = require('../config/googleSheets');
const { notifyUser, notifyAdmins } = require('../services/pushService');

const DEFAULT_THRESHOLD = 85.00;

const TARGET_KEY_CANDIDATES = ['capacity', 'target_output', 'target', 'daily_capacity'];
const PROCESS_KEY_CANDIDATES = ['process_type', 'process', 'machine_type'];

// Worksheet columns are user-defined per spreadsheet, so machine attributes like
// capacity/process type are matched heuristically by column key/display name
// rather than a fixed schema.
const findColumnValue = (columns, row, candidates) => {
  if (!columns || !row) return null;
  for (const candidate of candidates) {
    const col = columns.find(c =>
      c.column_key.toLowerCase().includes(candidate) ||
      c.display_name.toLowerCase().replace(/\s+/g, '_').includes(candidate)
    );
    if (col && row.data?.[col.column_key] !== undefined && row.data[col.column_key] !== '') {
      return row.data[col.column_key];
    }
  }
  return null;
};

const formatDateDDMMYYYY = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const columnIndexToLetter = (index) => {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
};

const getEfficiencyStatus = (oePercent, thresholdPercent) => {
  if (oePercent === null || oePercent === undefined) return 'gray';
  if (oePercent >= thresholdPercent) return 'green';
  if (oePercent >= thresholdPercent - 5) return 'yellow';
  return 'red';
};

const toDateKey = (date) => date.toISOString().split('T')[0];

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

// Monday-anchored week boundary, computed in UTC to match how entry_date is stored
// (see submitDailyEntry: `${entry_date}T00:00:00.000Z`) and how the client computes "today".
const startOfWeekUTC = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
};

// Working week is Monday-Saturday (Sunday off), matching the 6-day week used
// elsewhere for capacity/target calculations.
const isWorkingDay = (date) => date.getUTCDay() !== 0;

const workingDaysInRange = (start, end) => {
  let count = 0;
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (isWorkingDay(d)) count++;
  }
  return count;
};

// Shared by the performance-history endpoints: `points` is [{ date, oe_percentage }],
// one entry per calendar day in the period (oe_percentage null on days with no data).
const groupPointsByWeek = (points) => {
  const weeks = new Map();
  for (const point of points) {
    if (point.oe_percentage === null) continue;
    const monday = startOfWeekUTC(new Date(`${point.date}T00:00:00.000Z`));
    const key = toDateKey(monday);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(point.oe_percentage);
  }
  return Array.from(weeks.entries())
    .map(([week_start, values]) => ({ week_start, average_oe: parseFloat(average(values).toFixed(2)) }))
    .sort((a, b) => a.week_start.localeCompare(b.week_start));
};

const groupPointsByMonth = (points) => {
  const months = new Map();
  for (const point of points) {
    if (point.oe_percentage === null) continue;
    const monthKey = point.date.slice(0, 7);
    if (!months.has(monthKey)) months.set(monthKey, []);
    months.get(monthKey).push(point.oe_percentage);
  }
  return Array.from(months.entries())
    .map(([month, values]) => ({ month, average_oe: parseFloat(average(values).toFixed(2)) }))
    .sort((a, b) => a.month.localeCompare(b.month));
};

// First-half-vs-second-half comparison across the non-null points in the period.
const computeTrendFromPoints = (points) => {
  const values = points.filter((p) => p.oe_percentage !== null).map((p) => p.oe_percentage);
  if (values.length < 2) return 'stable';
  const midpoint = Math.floor(values.length / 2);
  const firstAvg = average(values.slice(0, midpoint || 1));
  const secondAvg = average(values.slice(midpoint || 1));
  if (secondAvg - firstAvg > 2) return 'improving';
  if (firstAvg - secondAvg > 2) return 'declining';
  return 'stable';
};

const buildEfficiencySummary = (aggregateEntries) => {
  const byDay = new Map();
  for (const e of aggregateEntries) {
    if (e.oe_percentage === null) continue;
    const key = toDateKey(e.entry_date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(parseFloat(e.oe_percentage) * 100);
  }
  const dayAverage = (key) => (byDay.has(key) ? average(byDay.get(key)) : null);

  const today = new Date();
  const todayKey = toDateKey(today);
  const monday = startOfWeekUTC(today);
  const lastMonday = new Date(monday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const lastSunday = new Date(monday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);

  const weekValues = [];
  for (let d = new Date(monday); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const avg = dayAverage(toDateKey(d));
    if (avg !== null) weekValues.push(avg);
  }

  const lastWeekValues = [];
  for (let d = new Date(lastMonday); d <= lastSunday; d.setUTCDate(d.getUTCDate() + 1)) {
    const avg = dayAverage(toDateKey(d));
    if (avg !== null) lastWeekValues.push(avg);
  }

  const sevenDayHistory = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = toDateKey(d);
    sevenDayHistory.push({ date: key, oe_percentage: dayAverage(key), submitted: byDay.has(key) });
  }

  let streakDays = 0;
  const cursor = new Date(today);
  if (!byDay.has(todayKey)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (byDay.has(toDateKey(cursor))) {
    streakDays++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return {
    today_submitted: byDay.has(todayKey),
    today_oe: dayAverage(todayKey),
    week_average: average(weekValues),
    last_week_average: average(lastWeekValues),
    streak_days: streakDays,
    seven_day_history: sevenDayHistory
  };
};

const syncEntryToGoogleSheets = async (entry, row, worksheetId) => {
  try {
    const worksheet = await prisma.worksheet.findUnique({
      where: { id: worksheetId },
      include: { source: true }
    });

    if (!worksheet || worksheet.source.source_type !== 'google_sheets' || !worksheet.source.google_sheet_id) {
      await prisma.dailyProductionEntry.update({
        where: { id: entry.id },
        data: { sync_status: 'not_applicable' }
      });
      return;
    }

    const { sheets } = await getGoogleSheetsClient();
    const spreadsheetId = worksheet.source.google_sheet_id;

    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${worksheet.name}!1:1`
    });

    const headers = headerResponse.data.values?.[0] || [];
    const todayStr = formatDateDDMMYYYY(new Date());
    const dateColIndex = headers.findIndex(h => h && h.toString().trim() === todayStr);

    if (dateColIndex === -1) {
      console.error(`Sync skipped: no column for ${todayStr} found in sheet ${worksheet.name}`);
      await prisma.dailyProductionEntry.update({
        where: { id: entry.id },
        data: { sync_status: 'failed' }
      });
      return;
    }

    const sheetRowNumber = row.row_index + 2;
    const cellRange = `${worksheet.name}!${columnIndexToLetter(dateColIndex)}${sheetRowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: cellRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[entry.actual_output.toString()]] }
    });

    await prisma.dailyProductionEntry.update({
      where: { id: entry.id },
      data: { sync_status: 'synced' }
    });
  } catch (error) {
    console.error('Google Sheets sync error (database save was already committed):', error.message);
    await prisma.dailyProductionEntry.update({
      where: { id: entry.id },
      data: { sync_status: 'failed' }
    }).catch(() => {});
  }
};

const submitDailyEntry = async (req, res) => {
  try {
    const { row_id, worksheet_id, actual_output, entry_date, shift, notes } = req.body;

    if (!row_id || !worksheet_id || actual_output === undefined || actual_output === null || !entry_date) {
      return res.status(400).json({
        success: false,
        message: 'row_id, worksheet_id, actual_output and entry_date are required'
      });
    }

    const parsedOutput = parseFloat(actual_output);
    if (isNaN(parsedOutput) || parsedOutput < 0) {
      return res.status(400).json({ success: false, message: 'actual_output must be a valid non-negative number' });
    }

    const assignment = await prisma.machineAssignment.findFirst({
      where: { employee_id: req.user.id, row_id, is_active: true }
    });

    if (!assignment) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this machine' });
    }

    const worksheet = await prisma.worksheet.findUnique({
      where: { id: worksheet_id },
      include: { column_definitions: { where: { is_active: true } } }
    });

    const row = await prisma.rowData.findUnique({ where: { id: row_id } });

    if (!worksheet || !row) {
      return res.status(404).json({ success: false, message: 'Machine row or worksheet not found' });
    }

    const targetRaw = findColumnValue(worksheet.column_definitions, row, TARGET_KEY_CANDIDATES);
    const targetOutput = targetRaw !== null ? parseFloat(targetRaw) : null;
    const processType = findColumnValue(worksheet.column_definitions, row, PROCESS_KEY_CANDIDATES) || 'default';

    const oeRatio = (targetOutput && targetOutput > 0) ? parsedOutput / targetOutput : null;

    const entryDate = new Date(`${entry_date}T00:00:00.000Z`);
    const normalizedShift = (shift || 'day').toLowerCase() === 'night' ? 'night' : 'day';

    const existingEntry = await prisma.dailyProductionEntry.findUnique({
      where: {
        employee_id_row_id_entry_date: {
          employee_id: req.user.id,
          row_id,
          entry_date: entryDate
        }
      }
    });

    const entryData = {
      employee_id: req.user.id,
      row_id,
      worksheet_id,
      entry_date: entryDate,
      actual_output: parsedOutput,
      target_output: targetOutput,
      oe_percentage: oeRatio,
      shift: normalizedShift,
      notes: notes || null
    };

    const entry = existingEntry
      ? await prisma.dailyProductionEntry.update({
          where: { id: existingEntry.id },
          data: { ...entryData, status: 'edited' }
        })
      : await prisma.dailyProductionEntry.create({
          data: { ...entryData, status: 'submitted' }
        });

    const threshold = await prisma.efficiencyThreshold.findUnique({
      where: { worksheet_id_process_type: { worksheet_id, process_type: processType } }
    });

    const thresholdPercent = threshold ? parseFloat(threshold.min_threshold) : DEFAULT_THRESHOLD;
    const oePercent = oeRatio !== null ? oeRatio * 100 : null;
    const isBelowThreshold = threshold?.alert_enabled !== false && oePercent !== null && oePercent < thresholdPercent;

    if (isBelowThreshold) {
      await prisma.efficiencyAlert.create({
        data: {
          entry_id: entry.id,
          employee_id: req.user.id,
          worksheet_id,
          row_id,
          alert_type: 'below_threshold',
          threshold_value: thresholdPercent,
          actual_value: oeRatio,
          is_resolved: false
        }
      });
    }

    const oeDisplay = oePercent !== null ? oePercent.toFixed(1) : 'N/A';
    await prisma.notification.create({
      data: {
        user_id: req.user.id,
        title: 'Production Entry Recorded',
        message: `Your output of ${parsedOutput} was recorded with an efficiency of ${oeDisplay}%.`,
        type: isBelowThreshold ? 'warning' : 'info'
      }
    });

    if (isBelowThreshold) {
      const admins = await prisma.userProfile.findMany({
        where: { is_admin: true, is_active: true },
        select: { id: true }
      });
      if (admins.length > 0) {
        await prisma.notification.createMany({
          data: admins.map(admin => ({
            user_id: admin.id,
            title: 'Efficiency Below Threshold',
            message: `${req.user.full_name} recorded ${oeDisplay}% OE on ${row.row_identifier || 'a machine'}, below the ${thresholdPercent}% threshold.`,
            type: 'warning'
          }))
        });
      }
    }

    const todayColumnKey = formatDateDDMMYYYY(new Date());
    const updatedRowJson = { ...row.data, [todayColumnKey]: parsedOutput.toString() };
    await prisma.rowData.update({
      where: { id: row_id },
      data: { data: updatedRowJson }
    });

    syncEntryToGoogleSheets(entry, row, worksheet_id).catch(() => {});

    notifyUser(req.user.id, {
      title: 'Production Entry Recorded',
      body: `Your output of ${parsedOutput} was recorded with an efficiency of ${oeDisplay}%.`
    }).catch(() => {});

    notifyAdmins({
      title: 'New Production Entry',
      body: `${req.user.full_name} submitted ${parsedOutput} on ${row.row_identifier || 'a machine'} (${oeDisplay}% OE).`
    }).catch(() => {});

    res.status(existingEntry ? 200 : 201).json({
      success: true,
      message: existingEntry ? 'Entry updated successfully' : 'Entry submitted successfully',
      data: {
        entry,
        oe_percentage: oePercent,
        threshold_percentage: thresholdPercent,
        status: getEfficiencyStatus(oePercent, thresholdPercent)
      }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Submit daily entry error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit production entry' });
  }
};

const getMyEntries = async (req, res) => {
  try {
    const { employeeId } = req.query;
    let targetEmployeeId = req.user.id;

    if (employeeId && employeeId !== req.user.id) {
      if (!req.user.is_admin) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
      targetEmployeeId = employeeId;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const entries = await prisma.dailyProductionEntry.findMany({
      where: { employee_id: targetEmployeeId, entry_date: { gte: thirtyDaysAgo } },
      include: {
        row: { select: { id: true, row_identifier: true, data: true } },
        worksheet: { select: { id: true, name: true, display_name: true } }
      },
      orderBy: { entry_date: 'desc' }
    });

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const aggregateEntries = await prisma.dailyProductionEntry.findMany({
      where: { employee_id: targetEmployeeId, entry_date: { gte: ninetyDaysAgo } },
      select: { entry_date: true, oe_percentage: true }
    });

    res.json({ success: true, data: { entries, ...buildEfficiencySummary(aggregateEntries) } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get my entries error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch entries' });
  }
};

const getDailyReport = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date query parameter is required' });
    }

    const targetDate = new Date(`${date}T00:00:00.000Z`);
    const entries = await prisma.dailyProductionEntry.findMany({
      where: { entry_date: targetDate },
      include: {
        employee: { select: { id: true, full_name: true } },
        row: { select: { id: true, row_identifier: true, data: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    const thresholds = await prisma.efficiencyThreshold.findMany();

    const report = entries.map(entry => {
      const processType = entry.row.data?.process || 'default';
      const threshold = thresholds.find(t => t.worksheet_id === entry.worksheet_id && t.process_type === processType);
      const thresholdPercent = threshold ? parseFloat(threshold.min_threshold) : DEFAULT_THRESHOLD;
      const oePercent = entry.oe_percentage !== null ? parseFloat(entry.oe_percentage) * 100 : null;

      return {
        entry_id: entry.id,
        employee_id: entry.employee.id,
        employee_name: entry.employee.full_name,
        row_id: entry.row_id,
        machine_name: entry.row.data?.machine_no || entry.row.row_identifier,
        process_type: processType,
        target_output: entry.target_output,
        actual_output: entry.actual_output,
        oe_percentage: oePercent,
        threshold_percentage: thresholdPercent,
        status: getEfficiencyStatus(oePercent, thresholdPercent),
        shift: entry.shift
      };
    });

    const downtimeRecords = await prisma.machineDowntime.findMany({
      where: { downtime_date: targetDate },
      include: {
        employee: { select: { id: true, full_name: true } },
        row: { select: { id: true, row_identifier: true, data: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    const downtime = downtimeRecords.map(d => ({
      id: d.id,
      employee_id: d.employee.id,
      employee_name: d.employee.full_name,
      row_id: d.row_id,
      machine_name: d.row.data?.machine_no || d.row.row_identifier,
      category: d.category,
      reason: d.category === 'Other' ? (d.custom_reason || 'Other') : d.reason,
      duration_hours: parseFloat(d.duration_hours),
      status: d.status
    }));

    res.json({ success: true, data: { date, report, downtime } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get daily report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch daily report' });
  }
};

const getEfficiencyReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate query parameters are required' });
    }

    const entries = await prisma.dailyProductionEntry.findMany({
      where: {
        entry_date: {
          gte: new Date(`${startDate}T00:00:00.000Z`),
          lte: new Date(`${endDate}T23:59:59.999Z`)
        }
      },
      include: {
        employee: { select: { id: true, full_name: true } },
        row: { select: { id: true, row_identifier: true, data: true } },
        worksheet: { select: { id: true, name: true } }
      },
      orderBy: { entry_date: 'asc' }
    });

    const thresholds = await prisma.efficiencyThreshold.findMany();
    const groups = {};

    for (const entry of entries) {
      const key = `${entry.row_id}_${entry.employee_id}`;
      if (!groups[key]) {
        groups[key] = {
          machine_name: entry.row.data?.machine_no || entry.row.row_identifier,
          employee_name: entry.employee.full_name,
          worksheet_id: entry.worksheet_id,
          entries: []
        };
      }
      groups[key].entries.push(entry);
    }

    const summary = Object.values(groups).map(group => {
      const oeValues = group.entries.map(e => (e.oe_percentage !== null ? parseFloat(e.oe_percentage) * 100 : 0));
      const avgOE = oeValues.reduce((sum, v) => sum + v, 0) / oeValues.length;

      const midpoint = Math.floor(oeValues.length / 2);
      const firstHalf = oeValues.slice(0, midpoint || 1);
      const secondHalf = oeValues.slice(midpoint || 1);
      const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
      const secondAvg = secondHalf.length ? secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length : firstAvg;

      let trend = 'stable';
      if (secondAvg - firstAvg > 2) trend = 'up';
      else if (firstAvg - secondAvg > 2) trend = 'down';

      const daysBelow = group.entries.filter(e => {
        const threshold = thresholds.find(t => t.worksheet_id === e.worksheet_id);
        const thresholdPercent = threshold ? parseFloat(threshold.min_threshold) : DEFAULT_THRESHOLD;
        return e.oe_percentage !== null && parseFloat(e.oe_percentage) * 100 < thresholdPercent;
      }).length;

      return {
        machine_name: group.machine_name,
        employee_name: group.employee_name,
        average_oe: parseFloat(avgOE.toFixed(2)),
        trend,
        days_submitted: group.entries.length,
        days_below_threshold: daysBelow
      };
    });

    res.json({ success: true, data: { startDate, endDate, summary } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get efficiency report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch efficiency report' });
  }
};

const getAlerts = async (req, res) => {
  try {
    const alerts = await prisma.efficiencyAlert.findMany({
      where: { is_resolved: false },
      include: {
        employee: { select: { id: true, full_name: true } },
        row: { select: { id: true, row_identifier: true } },
        worksheet: { select: { id: true, name: true, display_name: true } },
        entry: { select: { id: true, entry_date: true, actual_output: true, target_output: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    res.json({ success: true, data: { alerts } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get alerts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

const resolveAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const alert = await prisma.efficiencyAlert.findUnique({ where: { id } });
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    await prisma.efficiencyAlert.update({ where: { id }, data: { is_resolved: true } });
    res.json({ success: true, message: 'Alert resolved successfully' });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Resolve alert error:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve alert' });
  }
};

const exportExcel = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate query parameters are required' });
    }

    const entries = await prisma.dailyProductionEntry.findMany({
      where: {
        entry_date: {
          gte: new Date(`${startDate}T00:00:00.000Z`),
          lte: new Date(`${endDate}T23:59:59.999Z`)
        }
      },
      include: {
        employee: { select: { full_name: true } },
        row: { select: { row_identifier: true, data: true } }
      },
      orderBy: { entry_date: 'asc' }
    });

    const dailyRows = entries.map(entry => {
      const processType = entry.row.data?.process || 'default';
      return {
        Date: entry.entry_date.toISOString().split('T')[0],
        Machine: entry.row.data?.machine_no || entry.row.row_identifier,
        Process: processType,
        Employee: entry.employee.full_name,
        Target: entry.target_output ? parseFloat(entry.target_output) : '',
        'Actual Output': entry.actual_output ? parseFloat(entry.actual_output) : '',
        'OE %': entry.oe_percentage ? parseFloat((parseFloat(entry.oe_percentage) * 100).toFixed(2)) : '',
        Shift: entry.shift,
        Status: entry.status,
        Notes: entry.notes || ''
      };
    });

    const groups = {};
    for (const entry of entries) {
      const machineName = entry.row.data?.machine_no || entry.row.row_identifier;
      const key = `${machineName}_${entry.employee.full_name}`;
      if (!groups[key]) {
        groups[key] = {
          machine: machineName,
          process: entry.row.data?.process || 'default',
          employee: entry.employee.full_name,
          oeValues: [],
          thresholdBreaches: 0
        };
      }
      const oePercent = entry.oe_percentage !== null ? parseFloat(entry.oe_percentage) * 100 : null;
      if (oePercent !== null) groups[key].oeValues.push(oePercent);
      if (oePercent !== null && oePercent < DEFAULT_THRESHOLD) groups[key].thresholdBreaches++;
    }

    const summaryRows = Object.values(groups).map(g => ({
      Machine: g.machine,
      Process: g.process,
      Employee: g.employee,
      'Average OE %': g.oeValues.length ? parseFloat((g.oeValues.reduce((s, v) => s + v, 0) / g.oeValues.length).toFixed(2)) : '',
      'Days Submitted': g.oeValues.length,
      'Days Below Threshold': g.thresholdBreaches,
      'Best Day %': g.oeValues.length ? parseFloat(Math.max(...g.oeValues).toFixed(2)) : '',
      'Worst Day %': g.oeValues.length ? parseFloat(Math.min(...g.oeValues).toFixed(2)) : ''
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dailyRows), 'Daily Production Data');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Efficiency Summary');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=production_efficiency_${startDate}_to_${endDate}.xlsx`);
    res.send(buffer);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Export Excel error:', error);
    res.status(500).json({ success: false, message: 'Failed to export Excel report' });
  }
};

const getEmployeePerformanceHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!req.user.is_admin && req.user.id !== employeeId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const employee = await prisma.userProfile.findUnique({
      where: { id: employeeId },
      select: { id: true, full_name: true, email: true, role: { select: { id: true, name: true } } }
    });

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const periodEnd = new Date();
    periodEnd.setUTCHours(0, 0, 0, 0);
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - (days - 1));

    const entries = await prisma.dailyProductionEntry.findMany({
      where: { employee_id: employeeId, entry_date: { gte: periodStart, lte: periodEnd } },
      include: { row: { select: { data: true, row_identifier: true } } },
      orderBy: { entry_date: 'asc' }
    });

    const thresholds = await prisma.efficiencyThreshold.findMany();

    const byDay = new Map();
    for (const entry of entries) {
      if (entry.oe_percentage === null) continue;
      const key = toDateKey(entry.entry_date);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(parseFloat(entry.oe_percentage) * 100);
    }

    const dailyPoints = [];
    for (const d = new Date(periodStart); d <= periodEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = toDateKey(d);
      const values = byDay.get(key);
      dailyPoints.push({ date: key, oe_percentage: values ? parseFloat(average(values).toFixed(2)) : null });
    }

    const nonNullPoints = dailyPoints.filter((p) => p.oe_percentage !== null);
    const overallAverage = nonNullPoints.length
      ? parseFloat(average(nonNullPoints.map((p) => p.oe_percentage)).toFixed(2))
      : null;

    const bestDay = nonNullPoints.length
      ? nonNullPoints.reduce((a, b) => (b.oe_percentage > a.oe_percentage ? b : a))
      : null;
    const worstDay = nonNullPoints.length
      ? nonNullPoints.reduce((a, b) => (b.oe_percentage < a.oe_percentage ? b : a))
      : null;

    const totalWorkingDays = workingDaysInRange(periodStart, periodEnd);
    const daysSubmittedSet = new Set(entries.map((e) => toDateKey(e.entry_date)));
    const daysSubmitted = daysSubmittedSet.size;
    const submissionRate = totalWorkingDays > 0 ? parseFloat(((daysSubmitted / totalWorkingDays) * 100).toFixed(1)) : null;

    const belowThresholdDays = new Set();
    for (const entry of entries) {
      if (entry.oe_percentage === null) continue;
      const processType = entry.row.data?.process || 'default';
      const threshold = thresholds.find((t) => t.worksheet_id === entry.worksheet_id && t.process_type === processType);
      const thresholdPercent = threshold ? parseFloat(threshold.min_threshold) : DEFAULT_THRESHOLD;
      if (parseFloat(entry.oe_percentage) * 100 < thresholdPercent) {
        belowThresholdDays.add(toDateKey(entry.entry_date));
      }
    }

    const downtimeRecords = await prisma.machineDowntime.findMany({
      where: { employee_id: employeeId, downtime_date: { gte: periodStart, lte: periodEnd } }
    });
    const totalDowntimeHours = parseFloat(
      downtimeRecords.reduce((sum, r) => sum + parseFloat(r.duration_hours), 0).toFixed(2)
    );
    const reasonCounts = new Map();
    for (const r of downtimeRecords) {
      const label = r.category === 'Other' ? (r.custom_reason || 'Other') : r.reason;
      reasonCounts.set(label, (reasonCounts.get(label) || 0) + 1);
    }
    const mostCommonDowntimeReason = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const categoryHours = new Map();
    for (const r of downtimeRecords) {
      categoryHours.set(r.category, (categoryHours.get(r.category) || 0) + parseFloat(r.duration_hours));
    }
    const downtimeByCategory = Array.from(categoryHours.entries())
      .map(([category, hours]) => ({ category, hours: parseFloat(hours.toFixed(2)) }))
      .sort((a, b) => b.hours - a.hours);

    const plantEntries = await prisma.dailyProductionEntry.findMany({
      where: { entry_date: { gte: periodStart, lte: periodEnd }, oe_percentage: { not: null } },
      select: { oe_percentage: true }
    });
    const plantValues = plantEntries.map((e) => parseFloat(e.oe_percentage) * 100);
    const plantAverage = plantValues.length ? parseFloat(average(plantValues).toFixed(2)) : null;

    res.json({
      success: true,
      data: {
        employee,
        days,
        period: { start: toDateKey(periodStart), end: toDateKey(periodEnd) },
        daily_oe: dailyPoints,
        weekly_averages: groupPointsByWeek(dailyPoints),
        monthly_averages: groupPointsByMonth(dailyPoints),
        overall_average_oe: overallAverage,
        trend: computeTrendFromPoints(dailyPoints),
        best_day: bestDay,
        worst_day: worstDay,
        days_submitted: daysSubmitted,
        total_working_days: totalWorkingDays,
        submission_rate: submissionRate,
        total_downtime_hours: totalDowntimeHours,
        most_common_downtime_reason: mostCommonDowntimeReason,
        downtime_by_category: downtimeByCategory,
        days_below_threshold: belowThresholdDays.size,
        plant_average_oe: plantAverage,
        comparison_to_plant: (overallAverage !== null && plantAverage !== null)
          ? parseFloat((overallAverage - plantAverage).toFixed(2))
          : null
      }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get employee performance history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employee performance history' });
  }
};

const getPlantPerformanceHistory = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const periodEnd = new Date();
    periodEnd.setUTCHours(0, 0, 0, 0);
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodStart.getUTCDate() - (days - 1));

    const entries = await prisma.dailyProductionEntry.findMany({
      where: { entry_date: { gte: periodStart, lte: periodEnd } },
      include: { row: { select: { data: true, row_identifier: true } } },
      orderBy: { entry_date: 'asc' }
    });

    const byDay = new Map();
    const byMachine = new Map();

    for (const entry of entries) {
      if (entry.oe_percentage === null) continue;
      const oe = parseFloat(entry.oe_percentage) * 100;

      const dayKey = toDateKey(entry.entry_date);
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(oe);

      const machineName = entry.row.data?.machine_no || entry.row.row_identifier;
      if (!byMachine.has(machineName)) byMachine.set(machineName, []);
      byMachine.get(machineName).push(oe);
    }

    const dailyPoints = [];
    for (const d = new Date(periodStart); d <= periodEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = toDateKey(d);
      const values = byDay.get(key);
      dailyPoints.push({ date: key, oe_percentage: values ? parseFloat(average(values).toFixed(2)) : null });
    }

    const machineAverages = Array.from(byMachine.entries())
      .map(([machine_name, values]) => ({
        machine_name,
        average_oe: parseFloat(average(values).toFixed(2)),
        entries: values.length
      }))
      .sort((a, b) => b.average_oe - a.average_oe);

    const allValues = entries.filter((e) => e.oe_percentage !== null).map((e) => parseFloat(e.oe_percentage) * 100);
    const overallAverage = allValues.length ? parseFloat(average(allValues).toFixed(2)) : null;

    res.json({
      success: true,
      data: {
        days,
        period: { start: toDateKey(periodStart), end: toDateKey(periodEnd) },
        daily_oe: dailyPoints,
        weekly_averages: groupPointsByWeek(dailyPoints),
        machine_averages: machineAverages,
        best_machine: machineAverages[0] || null,
        worst_machine: machineAverages.length ? machineAverages[machineAverages.length - 1] : null,
        overall_average_oe: overallAverage,
        trend: computeTrendFromPoints(dailyPoints)
      }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get plant performance history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch plant performance history' });
  }
};

const getTargetVsActualTrend = async (req, res) => {
  try {
    const weeksParam = Math.min(12, Math.max(1, parseInt(req.query.weeks, 10) || 4));

    const assignments = await prisma.machineAssignment.findMany({
      where: { is_active: true },
      include: {
        employee: { select: { id: true, full_name: true } },
        row: { select: { id: true, row_identifier: true, data: true } },
        worksheet: { select: { id: true, name: true, display_name: true, column_definitions: { where: { is_active: true } } } }
      }
    });

    const machines = [];
    const seenRowIds = new Set();
    for (const a of assignments) {
      if (seenRowIds.has(a.row_id)) continue;
      seenRowIds.add(a.row_id);
      const targetRaw = findColumnValue(a.worksheet.column_definitions, a.row, TARGET_KEY_CANDIDATES);
      const processType = findColumnValue(a.worksheet.column_definitions, a.row, PROCESS_KEY_CANDIDATES) || 'default';
      machines.push({
        row_id: a.row_id,
        machine_name: a.row.data?.machine_no || a.row.row_identifier,
        process_type: processType,
        employee_name: a.employee.full_name,
        daily_capacity: targetRaw !== null ? parseFloat(targetRaw) : null
      });
    }

    // Working week is Monday-Saturday (6 days), so each week's window is [Monday, Saturday].
    const currentWeekStart = startOfWeekUTC(new Date());
    const weeks = [];
    for (let i = weeksParam - 1; i >= 0; i--) {
      const start = new Date(currentWeekStart);
      start.setUTCDate(start.getUTCDate() - i * 7);
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 5);
      weeks.push({ week_start: toDateKey(start), week_end: toDateKey(end), start, end });
    }

    const entries = machines.length
      ? await prisma.dailyProductionEntry.findMany({
          where: { entry_date: { gte: weeks[0].start, lte: weeks[weeks.length - 1].end } },
          select: { row_id: true, entry_date: true, actual_output: true }
        })
      : [];

    const weekIndexByStart = new Map(weeks.map((w, idx) => [w.week_start, idx]));
    const actualByWeekRow = weeks.map(() => new Map());
    for (const entry of entries) {
      const weekStartKey = toDateKey(startOfWeekUTC(entry.entry_date));
      const idx = weekIndexByStart.get(weekStartKey);
      if (idx === undefined) continue;
      const bucket = actualByWeekRow[idx];
      bucket.set(entry.row_id, (bucket.get(entry.row_id) || 0) + parseFloat(entry.actual_output));
    }

    const workingDaysPerWeek = workingDaysInRange(weeks[0].start, weeks[0].end);

    const weeklyResults = weeks.map((w, idx) => {
      const machineBreakdown = machines.map(m => {
        const actual = actualByWeekRow[idx].get(m.row_id) || 0;
        const target = m.daily_capacity !== null ? parseFloat((m.daily_capacity * workingDaysPerWeek).toFixed(2)) : null;
        const oePercent = (target && target > 0) ? parseFloat(((actual / target) * 100).toFixed(2)) : null;
        return {
          row_id: m.row_id,
          machine_name: m.machine_name,
          process_type: m.process_type,
          employee_name: m.employee_name,
          target,
          actual: parseFloat(actual.toFixed(2)),
          oe_percentage: oePercent
        };
      });

      const totalTarget = parseFloat(machineBreakdown.reduce((s, m) => s + (m.target || 0), 0).toFixed(2));
      const totalActual = parseFloat(machineBreakdown.reduce((s, m) => s + m.actual, 0).toFixed(2));
      const plantOE = totalTarget > 0 ? parseFloat(((totalActual / totalTarget) * 100).toFixed(2)) : null;
      const gap = parseFloat((totalTarget - totalActual).toFixed(2));

      return {
        week_start: w.week_start,
        week_end: w.week_end,
        total_target: totalTarget,
        total_actual: totalActual,
        plant_oe_percentage: plantOE,
        gap,
        machines: machineBreakdown
      };
    });

    weeklyResults.forEach((week, idx) => {
      if (idx === 0) {
        week.oe_change_vs_previous_week = null;
        week.gap_trend = null;
        return;
      }
      const prev = weeklyResults[idx - 1];
      week.oe_change_vs_previous_week = (week.plant_oe_percentage !== null && prev.plant_oe_percentage !== null)
        ? parseFloat((week.plant_oe_percentage - prev.plant_oe_percentage).toFixed(2))
        : null;
      if (Math.abs(week.gap) > Math.abs(prev.gap)) week.gap_trend = 'widening';
      else if (Math.abs(week.gap) < Math.abs(prev.gap)) week.gap_trend = 'narrowing';
      else week.gap_trend = 'unchanged';
    });

    res.json({
      success: true,
      data: {
        weeks: weeksParam,
        weekly: weeklyResults
      }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get target vs actual trend error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch trend analysis' });
  }
};

module.exports = {
  submitDailyEntry,
  getMyEntries,
  getDailyReport,
  getEfficiencyReport,
  getAlerts,
  resolveAlert,
  exportExcel,
  syncEntryToGoogleSheets,
  findColumnValue,
  getEfficiencyStatus,
  getEmployeePerformanceHistory,
  getPlantPerformanceHistory,
  getTargetVsActualTrend
};
