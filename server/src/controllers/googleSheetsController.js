const prisma = require('../config/prisma');
const { getGoogleSheetsClient } = require('../config/googleSheets');

const detectDataType = (values) => {
  if (values.length === 0) return 'text';
  let numberCount = 0;
  let dateCount = 0;

  for (const val of values) {
    const str = val.toString().trim();
    if (!isNaN(str) && str !== '') numberCount++;
    else if (!isNaN(Date.parse(str)) && (str.includes('-') || str.includes('/'))) dateCount++;
  }

  const total = values.length;
  if (numberCount / total > 0.6) return 'number';
  if (dateCount / total > 0.6) return 'date';
  return 'text';
};

const connectGoogleSheet = async (req, res) => {
  try {
    const { spreadsheet_url, name } = req.body;

    if (!spreadsheet_url || !name) {
      return res.status(400).json({
        success: false,
        message: 'Spreadsheet URL and name are required'
      });
    }

    const match = spreadsheet_url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Sheets URL'
      });
    }

    const spreadsheetId = match[1];
    const { sheets } = await getGoogleSheetsClient();

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId
    });

    const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);

    const source = await prisma.spreadsheetSource.create({
      data: {
        name,
        source_type: 'google_sheets',
        google_sheet_id: spreadsheetId,
        google_sheet_url: spreadsheet_url,
        is_active: true,
        sync_mode: 'manual',
        source_of_truth: 'google_sheets',
        created_by: req.user.id
      }
    });

    await prisma.spreadsheetVersion.create({
      data: {
        source_id: source.id,
        version_number: 1,
        uploaded_by: req.user.id,
        is_current: true,
        notes: 'Initial Google Sheets connection'
      }
    });

    const processedSheets = [];

    for (let i = 0; i < sheetNames.length; i++) {
      const sheetName = sheetNames[i];

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: sheetName
      });

      const values = response.data.values || [];
      if (values.length === 0) continue;

      const headers = values[0];
      const dataRows = values.slice(1).filter(row =>
        row.some(cell => cell !== '' && cell !== null && cell !== undefined)
      );

      const ws = await prisma.worksheet.create({
        data: {
          source_id: source.id,
          name: sheetName,
          display_name: sheetName,
          sheet_index: i,
          is_active: true,
          row_count: dataRows.length
        }
      });

      const columnDefs = [];
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (!header || header === '') continue;

        const columnKey = header.toString().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const sampleValues = dataRows.slice(0, 5).map(row => row[j] || '').filter(v => v !== '');
        const dataType = detectDataType(sampleValues);

        const colDef = await prisma.columnDefinition.create({
          data: {
            worksheet_id: ws.id,
            column_key: columnKey || `column_${j}`,
            display_name: header.toString(),
            column_index: j,
            data_type: dataType,
            is_required: false,
            is_unique: false,
            is_identifier: j === 0,
            is_active: true
          }
        });

        columnDefs.push({ ...colDef, originalIndex: j });
      }

      for (let r = 0; r < dataRows.length; r++) {
        const row = dataRows[r];
        const rowData = {};

        for (const col of columnDefs) {
          rowData[col.column_key] = row[col.originalIndex] !== undefined
            ? row[col.originalIndex].toString()
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

      processedSheets.push({
        name: sheetName,
        columns: columnDefs.length,
        rows: dataRows.length
      });
    }

    await prisma.spreadsheetSource.update({
      where: { id: source.id },
      data: { last_synced_at: new Date() }
    });

    res.status(201).json({
      success: true,
      message: 'Google Sheet connected and synced successfully',
      data: {
        source_id: source.id,
        name: source.name,
        sheets_processed: processedSheets
      }
    });
  } catch (error) {
    console.error('Connect Google Sheet error:', error);
    if (error.message?.includes('credentials')) {
      return res.status(500).json({
        success: false,
        message: 'Google Sheets credentials not configured'
      });
    }
    if (error.code === 403) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Please share the Google Sheet with the service account email.'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to connect Google Sheet'
    });
  }
};

const syncGoogleSheet = async (req, res) => {
  try {
    const { sourceId } = req.params;

    const source = await prisma.spreadsheetSource.findUnique({
      where: { id: sourceId },
      include: {
        worksheets: {
          include: { column_definitions: true }
        }
      }
    });

    if (!source) {
      return res.status(404).json({ success: false, message: 'Source not found' });
    }

    if (source.source_type !== 'google_sheets') {
      return res.status(400).json({ success: false, message: 'Source is not a Google Sheet' });
    }

    const { sheets } = await getGoogleSheetsClient();
    const syncedSheets = [];

    for (const ws of source.worksheets) {
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

      syncedSheets.push({ name: ws.name, rows: dataRows.length });
    }

    await prisma.spreadsheetSource.update({
      where: { id: sourceId },
      data: { last_synced_at: new Date() }
    });

    res.json({
      success: true,
      message: 'Google Sheet synced successfully',
      data: { synced_sheets: syncedSheets, synced_at: new Date().toISOString() }
    });
  } catch (error) {
    console.error('Sync Google Sheet error:', error);
    res.status(500).json({ success: false, message: 'Failed to sync Google Sheet' });
  }
};

const getServiceAccountEmail = async (req, res) => {
  try {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    if (!email) {
      return res.status(500).json({
        success: false,
        message: 'Google Sheets not configured'
      });
    }
    res.json({ success: true, data: { email } });
  } catch (error) {
    console.error('Get service account email error:', error);
    res.status(500).json({ success: false, message: 'Failed to get service account email' });
  }
};

module.exports = {
  connectGoogleSheet,
  syncGoogleSheet,
  getServiceAccountEmail
};