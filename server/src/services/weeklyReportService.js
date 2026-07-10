const prisma = require('../config/prisma');
const { DEFAULT_EFFICIENCY_THRESHOLD } = require('../config/constants');

const DEFAULT_THRESHOLD = DEFAULT_EFFICIENCY_THRESHOLD;

const toDateKey = (date) => date.toISOString().split('T')[0];

const average = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

const oeOf = (entry) => (entry.oe_percentage !== null ? parseFloat(entry.oe_percentage) * 100 : null);

const getThresholdPercent = (thresholds, worksheetId, processType) => {
  const threshold = thresholds.find(t => t.worksheet_id === worksheetId && t.process_type === processType);
  return threshold ? parseFloat(threshold.min_threshold) : DEFAULT_THRESHOLD;
};

// Monday-anchored, UTC — matches how entry_date is stored elsewhere in the app.
const getPreviousWeekRange = () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (today.getUTCDay() + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - daysSinceMonday);

  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);

  return { weekStart: lastMonday, weekEnd: lastSunday };
};

// Loads every entry for the week into memory to compute averages/breakdowns in
// JS. At current scale (25 machines x 7 days x 2 shifts = ~350 records/week)
// this is fine. If that grows past roughly 10,000 records per query, switch
// the aggregation (sums/averages/counts) to the database via Prisma's
// groupBy/aggregate instead of loading raw rows and reducing them here.
const fetchEntriesForRange = async (weekStart, weekEnd) => {
  const startDate = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate()));
  const endDate = new Date(Date.UTC(weekEnd.getUTCFullYear(), weekEnd.getUTCMonth(), weekEnd.getUTCDate(), 23, 59, 59, 999));

  return prisma.dailyProductionEntry.findMany({
    where: { entry_date: { gte: startDate, lte: endDate } },
    include: {
      employee: { select: { id: true, full_name: true } },
      row: { select: { id: true, row_identifier: true, data: true } },
      worksheet: { select: { id: true, name: true } }
    }
  });
};

const buildMachineBreakdown = (entries, prevEntries) => {
  const machineGroups = new Map();
  for (const entry of entries) {
    if (!machineGroups.has(entry.row_id)) {
      machineGroups.set(entry.row_id, {
        row_id: entry.row_id,
        machine_name: entry.row.data?.machine_no || entry.row.row_identifier,
        process_type: entry.row.data?.process || 'default',
        entries: []
      });
    }
    machineGroups.get(entry.row_id).entries.push(entry);
  }

  const prevByRow = new Map();
  for (const entry of prevEntries) {
    const oe = oeOf(entry);
    if (oe === null) continue;
    if (!prevByRow.has(entry.row_id)) prevByRow.set(entry.row_id, []);
    prevByRow.get(entry.row_id).push(oe);
  }
  const prevAverages = new Map(Array.from(prevByRow.entries()).map(([rowId, values]) => [rowId, average(values)]));

  return Array.from(machineGroups.values()).map((group) => {
    const oeValues = group.entries.map(oeOf).filter((v) => v !== null);
    const avgOE = average(oeValues);

    const dayMap = new Map();
    for (const entry of group.entries) {
      const oe = oeOf(entry);
      if (oe === null) continue;
      const key = toDateKey(entry.entry_date);
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key).push(oe);
    }
    const dayAverages = Array.from(dayMap.entries()).map(([date, values]) => ({ date, oe: average(values) }));
    const bestDay = dayAverages.length ? dayAverages.reduce((a, b) => (b.oe > a.oe ? b : a)) : null;
    const worstDay = dayAverages.length ? dayAverages.reduce((a, b) => (b.oe < a.oe ? b : a)) : null;

    const prevAvg = prevAverages.get(group.row_id);
    let trend = 'stable';
    let trendDelta = null;
    if (avgOE !== null && prevAvg !== null && prevAvg !== undefined) {
      trendDelta = parseFloat((avgOE - prevAvg).toFixed(2));
      if (trendDelta > 2) trend = 'up';
      else if (trendDelta < -2) trend = 'down';
    } else if (avgOE !== null) {
      trend = 'new';
    }

    return {
      row_id: group.row_id,
      machine_name: group.machine_name,
      process_type: group.process_type,
      total_entries: group.entries.length,
      average_oe: avgOE !== null ? parseFloat(avgOE.toFixed(2)) : null,
      best_day: bestDay ? { date: bestDay.date, oe_percentage: parseFloat(bestDay.oe.toFixed(2)) } : null,
      worst_day: worstDay ? { date: worstDay.date, oe_percentage: parseFloat(worstDay.oe.toFixed(2)) } : null,
      trend,
      trend_delta: trendDelta
    };
  });
};

const buildEmployeeBreakdown = (entries, thresholds) => {
  const employeeGroups = new Map();
  for (const entry of entries) {
    if (!employeeGroups.has(entry.employee_id)) {
      employeeGroups.set(entry.employee_id, {
        employee_id: entry.employee_id,
        employee_name: entry.employee.full_name,
        machineIds: new Set(),
        daysSubmitted: new Set(),
        entries: []
      });
    }
    const group = employeeGroups.get(entry.employee_id);
    group.machineIds.add(entry.row_id);
    group.daysSubmitted.add(toDateKey(entry.entry_date));
    group.entries.push(entry);
  }

  return Array.from(employeeGroups.values()).map((group) => {
    const oeValues = group.entries.map(oeOf).filter((v) => v !== null);
    const avgOE = average(oeValues);
    const daysBelow = group.entries.filter((entry) => {
      const oe = oeOf(entry);
      if (oe === null) return false;
      const processType = entry.row.data?.process || 'default';
      return oe < getThresholdPercent(thresholds, entry.worksheet_id, processType);
    }).length;

    return {
      employee_id: group.employee_id,
      employee_name: group.employee_name,
      machines_covered: group.machineIds.size,
      average_oe: avgOE !== null ? parseFloat(avgOE.toFixed(2)) : null,
      submission_rate: parseFloat(((group.daysSubmitted.size / 7) * 100).toFixed(1)),
      days_below_threshold: daysBelow
    };
  });
};

const generateWeeklyReportData = async (weekStart, weekEnd) => {
  const entries = await fetchEntriesForRange(weekStart, weekEnd);
  const thresholds = await prisma.efficiencyThreshold.findMany();

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
  const prevWeekEnd = new Date(weekEnd);
  prevWeekEnd.setUTCDate(prevWeekEnd.getUTCDate() - 7);
  const prevEntries = await fetchEntriesForRange(prevWeekStart, prevWeekEnd);

  const machines = buildMachineBreakdown(entries, prevEntries);
  const employees = buildEmployeeBreakdown(entries, thresholds);
  const allOEValues = entries.map(oeOf).filter((v) => v !== null);

  return {
    week_start: toDateKey(weekStart),
    week_end: toDateKey(weekEnd),
    overall: {
      total_entries: entries.length,
      average_oe: allOEValues.length ? parseFloat(average(allOEValues).toFixed(2)) : null,
      total_machines: machines.length,
      total_employees: employees.length
    },
    machines,
    employees
  };
};

const saveReportAndNotify = async (weekStart, weekEnd, reportData) => {
  const startDate = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate()));
  const endDate = new Date(Date.UTC(weekEnd.getUTCFullYear(), weekEnd.getUTCMonth(), weekEnd.getUTCDate()));

  const report = await prisma.weeklyReport.upsert({
    where: { week_start_week_end: { week_start: startDate, week_end: endDate } },
    update: { report_data: reportData, generated_at: new Date() },
    create: { week_start: startDate, week_end: endDate, report_data: reportData }
  });

  const admins = await prisma.userProfile.findMany({
    where: { is_admin: true, is_active: true },
    select: { id: true }
  });

  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        user_id: admin.id,
        title: 'Weekly Efficiency Report Ready',
        message: `The efficiency report for ${toDateKey(weekStart)} to ${toDateKey(weekEnd)} is ready to view.`,
        type: 'info'
      }))
    });
  }

  return report;
};

const generateAndSaveWeeklyReport = async (weekStart, weekEnd) => {
  const reportData = await generateWeeklyReportData(weekStart, weekEnd);
  return saveReportAndNotify(weekStart, weekEnd, reportData);
};

const runScheduledWeeklyReport = async () => {
  const { weekStart, weekEnd } = getPreviousWeekRange();
  console.log(`Generating weekly report for ${toDateKey(weekStart)} to ${toDateKey(weekEnd)}...`);
  try {
    await generateAndSaveWeeklyReport(weekStart, weekEnd);
    console.log('Weekly report generated successfully');
  } catch (error) {
    console.error('Weekly report generation failed:', error);
  }
};

module.exports = {
  generateAndSaveWeeklyReport,
  runScheduledWeeklyReport,
  getPreviousWeekRange
};
