const prisma = require('../config/prisma');
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

    res.json({ success: true, data: { date, report } });
  } catch (error) {
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
    console.error('Export Excel error:', error);
    res.status(500).json({ success: false, message: 'Failed to export Excel report' });
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
  getEfficiencyStatus
};
