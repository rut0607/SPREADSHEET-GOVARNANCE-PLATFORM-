const prisma = require('../config/prisma');
const { supabaseAdmin } = require('../config/supabase');
const XLSX = require('xlsx');
const path = require('path');

const uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Spreadsheet name is required' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;

    if (sheetNames.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel file contains no worksheets' });
    }

    const fileName = `${Date.now()}_${req.file.originalname}`;
    const filePath = `excel/${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET)
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype });

    if (uploadError) console.error('Storage upload error:', uploadError);

    const source = await prisma.spreadsheetSource.create({
      data: {
        name,
        source_type: 'excel',
        file_path: filePath,
        is_active: true,
        sync_mode: 'manual',
        source_of_truth: 'database',
        created_by: req.user.id
      }
    });

    await prisma.spreadsheetVersion.create({
      data: {
        source_id: source.id,
        version_number: 1,
        file_path: filePath,
        uploaded_by: req.user.id,
        is_current: true,
        notes: 'Initial upload'
      }
    });

    const processedSheets = [];

    for (let i = 0; i < sheetNames.length; i++) {
      const sheetName = sheetNames[i];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (jsonData.length === 0) continue;

      const headers = jsonData[0];
      const dataRows = jsonData.slice(1).filter(row =>
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
        const displayName = header.toString();
        const sampleValues = dataRows.slice(0, 5).map(row => row[j]).filter(v => v !== '' && v !== null);
        const dataType = detectDataType(sampleValues);

        const colDef = await prisma.columnDefinition.create({
          data: {
            worksheet_id: ws.id,
            column_key: columnKey || `column_${j}`,
            display_name: displayName,
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
          const cellValue = row[col.originalIndex];
          rowData[col.column_key] = cellValue !== undefined ? cellValue.toString() : '';
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

      processedSheets.push({ name: sheetName, columns: columnDefs.length, rows: dataRows.length });
    }

    res.status(201).json({
      success: true,
      message: 'Excel file uploaded and processed successfully',
      data: { source_id: source.id, name: source.name, sheets_processed: processedSheets }
    });
  } catch (error) {
    console.error('Upload Excel error:', error);
    res.status(500).json({ success: false, message: 'Failed to process Excel file' });
  }
};

const detectDataType = (values) => {
  if (values.length === 0) return 'text';

  let numberCount = 0;
  let dateCount = 0;
  let currencyCount = 0;

  for (const val of values) {
    const str = val.toString().trim();
    if (str.startsWith('$') || str.startsWith('₹') || str.includes('INR')) {
      currencyCount++;
    } else if (!isNaN(str) && str !== '') {
      numberCount++;
    } else if (!isNaN(Date.parse(str)) && str.includes('-') || str.includes('/')) {
      dateCount++;
    }
  }

  const total = values.length;
  if (currencyCount / total > 0.6) return 'currency';
  if (numberCount / total > 0.6) return 'number';
  if (dateCount / total > 0.6) return 'date';
  return 'text';
};

const getAllSources = async (req, res) => {
  try {
    const sources = await prisma.spreadsheetSource.findMany({
      where: { is_active: true },
      include: {
        worksheets: {
          where: { is_active: true },
          select: { id: true, name: true, display_name: true, row_count: true }
        },
        creator: { select: { id: true, full_name: true, email: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    res.json({ success: true, data: { sources } });
  } catch (error) {
    console.error('Get all sources error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch spreadsheet sources' });
  }
};

const getSourceById = async (req, res) => {
  try {
    const { id } = req.params;

    const source = await prisma.spreadsheetSource.findUnique({
      where: { id },
      include: {
        worksheets: {
          where: { is_active: true },
          include: {
            column_definitions: {
              where: { is_active: true },
              orderBy: { column_index: 'asc' }
            }
          }
        }
      }
    });

    if (!source) {
      return res.status(404).json({ success: false, message: 'Spreadsheet source not found' });
    }

    res.json({ success: true, data: { source } });
  } catch (error) {
    console.error('Get source error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch spreadsheet source' });
  }
};

const getWorksheetData = async (req, res) => {
  try {
    const { worksheetId } = req.params;
    const { page = 1, limit = 100 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const worksheet = await prisma.worksheet.findUnique({
      where: { id: worksheetId },
      include: {
        column_definitions: {
          where: { is_active: true },
          orderBy: { column_index: 'asc' }
        }
      }
    });

    if (!worksheet) {
      return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    const whereClause = { worksheet_id: worksheetId, is_deleted: false };
    const totalRows = await prisma.rowData.count({ where: whereClause });
    const rows = await prisma.rowData.findMany({
      where: whereClause,
      orderBy: { row_index: 'asc' },
      skip,
      take: parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        worksheet: {
          id: worksheet.id,
          name: worksheet.name,
          display_name: worksheet.display_name,
          columns: worksheet.column_definitions
        },
        rows,
        pagination: {
          total: totalRows,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(totalRows / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get worksheet data error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch worksheet data' });
  }
};

const updateRow = async (req, res) => {
  try {
    const { rowId } = req.params;
    const { data, column_id, previous_value, new_value } = req.body;

    const row = await prisma.rowData.findUnique({ where: { id: rowId } });

    if (!row) {
      return res.status(404).json({ success: false, message: 'Row not found' });
    }

    const updated = await prisma.rowData.update({
      where: { id: rowId },
      data: { data }
    });

    await prisma.auditLog.create({
      data: {
        user_id: req.user.id,
        action_type: 'direct_edit',
        worksheet_id: row.worksheet_id,
        row_id: rowId,
        column_id: column_id || null,
        previous_value: previous_value || null,
        new_value: new_value || JSON.stringify(data),
        metadata: { source: 'direct_edit' }
      }
    });

    res.json({ success: true, message: 'Row updated successfully', data: { row: updated } });
  } catch (error) {
    console.error('Update row error:', error);
    res.status(500).json({ success: false, message: 'Failed to update row' });
  }
};

module.exports = {
  uploadExcel,
  getAllSources,
  getSourceById,
  getWorksheetData,
  updateRow
};