const prisma = require('../config/prisma');

const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const WEEKLY_REPORT_STALE_DAYS = 8;

const config = {
  minOeThreshold: 70,
  maxDaysWithoutEntry: 2
};

const getAlertConfig = () => ({ ...config });

const setAlertConfig = (updates) => {
  if (updates.minOeThreshold !== undefined) {
    const value = Number(updates.minOeThreshold);
    if (!Number.isNaN(value) && value >= 0 && value <= 100) config.minOeThreshold = value;
  }
  if (updates.maxDaysWithoutEntry !== undefined) {
    const value = Number(updates.maxDaysWithoutEntry);
    if (!Number.isNaN(value) && value >= 1) config.maxDaysWithoutEntry = value;
  }
  return getAlertConfig();
};

const toDateKey = (date) => date.toISOString().split('T')[0];

// Caps each alert condition to one admin notification per calendar day, so a
// persistent issue (e.g. low OE all day) doesn't flood admins every 5 minutes.
const lastAlertedDate = { lowOe: null, staleMachines: null, weeklyReportOverdue: null };

const logAlert = (level, message) => {
  const timestamp = new Date().toISOString();
  if (level === 'critical') console.error(`[ALERT ${timestamp}] CRITICAL: ${message}`);
  else if (level === 'warning') console.warn(`[ALERT ${timestamp}] WARNING: ${message}`);
  else console.log(`[ALERT ${timestamp}] REMINDER: ${message}`);
};

const notifyAdminsInApp = async (title, message, type) => {
  const admins = await prisma.userProfile.findMany({
    where: { is_admin: true, is_active: true },
    select: { id: true }
  });
  if (admins.length === 0) return;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({ user_id: admin.id, title, message, type }))
  });
};

const checkTodayAverageOE = async () => {
  const todayKey = toDateKey(new Date());
  const startOfDay = new Date(`${todayKey}T00:00:00.000Z`);
  const endOfDay = new Date(`${todayKey}T23:59:59.999Z`);

  const entries = await prisma.dailyProductionEntry.findMany({
    where: { entry_date: { gte: startOfDay, lte: endOfDay }, oe_percentage: { not: null } },
    select: { oe_percentage: true }
  });

  if (entries.length === 0) return;

  const avgOe = entries.reduce((sum, e) => sum + parseFloat(e.oe_percentage) * 100, 0) / entries.length;
  if (avgOe >= config.minOeThreshold) return;

  const message = `Today's average OE across all machines is ${avgOe.toFixed(1)}%, below the ${config.minOeThreshold}% threshold.`;
  logAlert('critical', message);

  if (lastAlertedDate.lowOe === todayKey) return;
  await notifyAdminsInApp('Critical: Low Plant Efficiency', message, 'error');
  lastAlertedDate.lowOe = todayKey;
};

const checkStaleMachines = async () => {
  const activeAssignments = await prisma.machineAssignment.findMany({
    where: { is_active: true },
    select: { row_id: true, row: { select: { row_identifier: true, data: true } } }
  });
  if (activeAssignments.length === 0) return;

  const uniqueRowIds = [...new Set(activeAssignments.map((a) => a.row_id))];
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - config.maxDaysWithoutEntry);
  cutoff.setUTCHours(0, 0, 0, 0);

  const staleRowIds = [];
  for (const rowId of uniqueRowIds) {
    // eslint-disable-next-line no-await-in-loop
    const recentEntry = await prisma.dailyProductionEntry.findFirst({
      where: { row_id: rowId, entry_date: { gte: cutoff } }
    });
    if (!recentEntry) staleRowIds.push(rowId);
  }
  if (staleRowIds.length === 0) return;

  const staleNames = activeAssignments
    .filter((a) => staleRowIds.includes(a.row_id))
    .map((a) => a.row.data?.machine_no || a.row.row_identifier)
    .filter((name, index, arr) => arr.indexOf(name) === index);

  const message = `${staleNames.length} machine(s) have had no production entry in the last ${config.maxDaysWithoutEntry} day(s): ${staleNames.join(', ')}.`;
  logAlert('warning', message);

  const todayKey = toDateKey(new Date());
  if (lastAlertedDate.staleMachines === todayKey) return;
  await notifyAdminsInApp('Warning: Machines Without Recent Entries', message, 'warning');
  lastAlertedDate.staleMachines = todayKey;
};

const checkWeeklyReportFreshness = async () => {
  const latestReport = await prisma.weeklyReport.findFirst({ orderBy: { generated_at: 'desc' } });
  const daysSince = latestReport
    ? Math.floor((Date.now() - new Date(latestReport.generated_at).getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;

  if (daysSince <= WEEKLY_REPORT_STALE_DAYS) return;

  const message = latestReport
    ? `The weekly efficiency report hasn't been generated in ${daysSince} days.`
    : 'No weekly efficiency report has ever been generated.';
  logAlert('reminder', message);

  const todayKey = toDateKey(new Date());
  if (lastAlertedDate.weeklyReportOverdue === todayKey) return;
  await notifyAdminsInApp('Reminder: Weekly Report Overdue', message, 'info');
  lastAlertedDate.weeklyReportOverdue = todayKey;
};

const runAlertChecks = async () => {
  const checks = [checkTodayAverageOE, checkStaleMachines, checkWeeklyReportFreshness];
  for (const check of checks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await check();
    } catch (error) {
      console.error(`Alert check "${check.name}" failed:`, error.message);
    }
  }
};

let intervalHandle = null;

const startAlertService = () => {
  if (intervalHandle) return;
  runAlertChecks().catch(() => {});
  intervalHandle = setInterval(() => {
    runAlertChecks().catch(() => {});
  }, CHECK_INTERVAL_MS);
  intervalHandle.unref?.();
};

const stopAlertService = () => {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
};

module.exports = {
  startAlertService,
  stopAlertService,
  runAlertChecks,
  getAlertConfig,
  setAlertConfig
};
