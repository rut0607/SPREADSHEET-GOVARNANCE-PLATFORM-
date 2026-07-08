const cron = require('node-cron');
const prisma = require('../config/prisma');
const { getGoogleSheetsClient } = require('../config/googleSheets');
const { runScheduledWeeklyReport } = require('./weeklyReportService');

const JOB_HISTORY_LIMIT = 10;
const jobState = {};

const ensureJobState = (jobName) => {
  if (!jobState[jobName]) jobState[jobName] = { running: false, history: [] };
  return jobState[jobName];
};

const recordJobExecution = (jobName, record) => {
  const state = ensureJobState(jobName);
  state.history.unshift(record);
  if (state.history.length > JOB_HISTORY_LIMIT) state.history.length = JOB_HISTORY_LIMIT;
};

// Wraps a scheduled job body with: in-memory overlap locking (skip if the
// previous run is still in progress), a try/catch so one failing execution
// never kills the cron scheduler, and rolling history of the last 10 runs.
const runJob = async (jobName, fn) => {
  const state = ensureJobState(jobName);

  if (state.running) {
    console.warn(`Job "${jobName}" is already running — skipping this scheduled execution.`);
    return;
  }

  state.running = true;
  const startTime = new Date();
  console.log(`Job "${jobName}" started at ${startTime.toISOString()}`);

  try {
    await fn();
    const endTime = new Date();
    recordJobExecution(jobName, {
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_ms: endTime.getTime() - startTime.getTime(),
      success: true,
      error: null
    });
    console.log(`Job "${jobName}" completed in ${endTime.getTime() - startTime.getTime()}ms`);
  } catch (error) {
    const endTime = new Date();
    recordJobExecution(jobName, {
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_ms: endTime.getTime() - startTime.getTime(),
      success: false,
      error: error.message
    });
    console.error(`Job "${jobName}" failed after ${endTime.getTime() - startTime.getTime()}ms:`, error.message);
  } finally {
    state.running = false;
  }
};

const getJobHistory = () => {
  const result = {};
  for (const [jobName, state] of Object.entries(jobState)) {
    result[jobName] = { running: state.running, history: state.history };
  }
  return result;
};

const syncGoogleSheet = async (source) => {
  try {
    console.log(`Syncing Google Sheet: ${source.name}`);

    const { sheets } = await getGoogleSheetsClient();

    const worksheets = await prisma.worksheet.findMany({
      where: { source_id: source.id, is_active: true },
      include: { column_definitions: true }
    });

    for (const ws of worksheets) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: source.google_sheet_id,
        range: ws.name
      });

      const values = response.data.values || [];
      if (values.length === 0) continue;

      const dataRows = values.slice(1).filter(row =>
        row.some(cell => cell !== '' && cell !== null)
      );

      await prisma.rowData.deleteMany({ where: { worksheet_id: ws.id } });

      for (let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r];
        const rowData = {};

        for (const col of ws.column_definitions) {
          rowData[col.column_key] = row[col.column_index] !== undefined
            ? row[col.column_index].toString()
            : '';
        }

        await prisma.rowData.create({
          data: {
            worksheet_id: ws.id,
            row_index: r,
            row_identifier: row[0] ? row[0].toString() : `row_${r + 1}`,
            data: rowData,
            is_deleted: false
          }
        });
      }

      await prisma.worksheet.update({
        where: { id: ws.id },
        data: { row_count: dataRows.length }
      });
    }

    await prisma.spreadsheetSource.update({
      where: { id: source.id },
      data: { last_synced_at: new Date() }
    });

    console.log(`Synced successfully: ${source.name}`);
    return true;
  } catch (error) {
    console.error(`Sync failed for ${source.name}:`, error.message);
    return false;
  }
};

// PM2 runs this app in cluster mode (2 instances) — only the first worker
// runs scheduled jobs, otherwise every job (and every weekly report / alert)
// would fire once per worker. PM2 sets NODE_APP_INSTANCE per worker; outside
// PM2 (plain `node src/index.js`) it's unset, so jobs run normally.
const isSchedulerEligible = () =>
  process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0';

const startScheduledSync = () => {
  if (!isSchedulerEligible()) {
    console.log('Skipping cron scheduling on this cluster worker (jobs only run on instance 0).');
    return;
  }

  // Run every 30 minutes
  cron.schedule('*/30 * * * *', () => runJob('google_sheets_sync', async () => {
    const scheduledSources = await prisma.spreadsheetSource.findMany({
      where: {
        source_type: 'google_sheets',
        is_active: true,
        sync_mode: 'scheduled'
      }
    });

    if (scheduledSources.length === 0) {
      console.log('No scheduled sources found');
      return;
    }

    for (const source of scheduledSources) {
      await syncGoogleSheet(source);
    }
  }));

  console.log('Scheduled sync service started');

  // Every Monday at 6am — generates the report for the week that just ended.
  cron.schedule('0 6 * * 1', () => runJob('weekly_report', runScheduledWeeklyReport));

  console.log('Weekly report cron scheduled (Mondays 06:00)');
};

module.exports = { startScheduledSync, syncGoogleSheet, getJobHistory, isSchedulerEligible };
