const cron = require('node-cron');
const prisma = require('../config/prisma');
const { getGoogleSheetsClient } = require('../config/googleSheets');
const { runScheduledWeeklyReport } = require('./weeklyReportService');

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

const startScheduledSync = () => {
  // Run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    console.log('Running scheduled Google Sheets sync...');

    try {
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
    } catch (error) {
      console.error('Scheduled sync error:', error);
    }
  });

  console.log('Scheduled sync service started');

  // Every Monday at 6am — generates the report for the week that just ended.
  cron.schedule('0 6 * * 1', async () => {
    await runScheduledWeeklyReport();
  });

  console.log('Weekly report cron scheduled (Mondays 06:00)');
};

module.exports = { startScheduledSync, syncGoogleSheet };