const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');
const { supabaseAdmin } = require('../config/supabase');
const XLSX = require('xlsx');
const cache = require('../services/cacheService');

const excelSerialToDate = (serial) => {
  if (typeof serial !== 'number' || serial < 40000 || serial > 60000) return null;
  try {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return null;
  }
};

const isExcelDate = (value) => {
  return typeof value === 'number' && value > 40000 && value < 60000;
};

const cleanNumber = (value) => {
  if (typeof value !== 'number') return value.toString();
  if (Number.isInteger(value)) return value.toString();
  return parseFloat(value.toFixed(4)).toString();
};

const convertCellValue = (cellValue) => {
  if (cellValue === undefined || cellValue === null || cellValue === '') return '';
  if (typeof cellValue === 'string' && cellValue.startsWith('=')) return '';

  if (cellValue instanceof Date) {
    const day = String(cellValue.getDate()).padStart(2, '0');
    const month = String(cellValue.getMonth() + 1).padStart(2, '0');
    const year = cellValue.getFullYear();
    return `${day}/${month}/${year}`;
  }

  if (isExcelDate(cellValue)) {
    const dateStr = excelSerialToDate(cellValue);
    if (dateStr) return dateStr;
  }

  if (typeof cellValue === 'number') {
    return cleanNumber(cellValue);
  }

  return cellValue.toString().trim();
};

const convertHeaderValue = (header) => {
  if (header === undefined || header === null || header === '') return '';
  if (typeof header === 'string' && header.startsWith('=')) return '';

  if (header instanceof Date) {
    const day = String(header.getDate()).padStart(2, '0');
    const month = String(header.getMonth() + 1).padStart(2, '0');
    const year = header.getFullYear();
    return `${day}/${month}/${year}`;
  }

  if (isExcelDate(header)) {
    const dateStr = excelSerialToDate(header);
    if (dateStr) return dateStr;
  }

  if (typeof header === 'number') {
    return cleanNumber(header);
  }

  return header.toString().trim();
};

const findHeaderRow = (jsonData) => {
  for (let i = 0; i < Math.min(5, jsonData.length); i++) {
    const row = jsonData[i];
    const nonEmptyCells = row.filter(cell =>
      cell !== '' && cell !== null && cell !== undefined
    );
    const hasMultipleColumns = nonEmptyCells.length >= 2;
    const hasNoFormulas = !row.some(cell =>
      typeof cell === 'string' && cell.startsWith('=')
    );
    if (hasMultipleColumns && hasNoFormulas) {
      return i;
    }
  }
  return 0;
};

const detectDataType = (values) => {
  if (values.length === 0) return 'text';

  let numberCount = 0;
  let dateCount = 0;
  let currencyCount = 0;

  for (const val of values) {
    if (val instanceof Date) { dateCount++; continue; }
    if (isExcelDate(val)) { dateCount++; continue; }
    const str = val.toString().trim();
    if (str.startsWith('$') || str.startsWith('₹') || str.includes('INR')) {
      currencyCount++;
    } else if (!isNaN(str) && str !== '') {
      numberCount++;
    } else if (!isNaN(Date.parse(str)) && (str.includes('-') || str.includes('/'))) {
      dateCount++;
    }
  }

  const total = values.length;
  if (currencyCount / total > 0.6) return 'currency';
  if (numberCount / total > 0.6) return 'number';
  if (dateCount / total > 0.6) return 'date';
  return 'text';
};

const uploadExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Spreadsheet name is required' });
    }

    const workbook = XLSX.read(req.file.buffer, {
      type: 'buffer',
      cellDates: false,
      cellNF: false,
      cellText: false,
      raw: true
    });

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

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: true
      });

      if (jsonData.length === 0) continue;

      const headerRowIndex = findHeaderRow(jsonData);
      const headers = jsonData[headerRowIndex];

      const dataRows = jsonData.slice(headerRowIndex + 1).filter(row => {
        const nonFormulaCells = row.filter(cell => {
          if (cell === '' || cell === null || cell === undefined) return false;
          if (typeof cell === 'string' && cell.startsWith('=')) return false;
          return true;
        });
        return nonFormulaCells.length >= 2;
      });

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
        if (header === '' || header === null || header === undefined) continue;
        if (typeof header === 'string' && header.startsWith('=')) continue;

        const displayName = convertHeaderValue(header);
        if (!displayName) continue;

        let columnKey = displayName.toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '')
          .substring(0, 50);

        if (!columnKey) columnKey = `column_${j}`;

        const existingKeys = columnDefs.map(c => c.column_key);
        let finalKey = columnKey;
        let counter = 1;
        while (existingKeys.includes(finalKey)) {
          finalKey = `${columnKey}_${counter}`;
          counter++;
        }

        const sampleValues = dataRows.slice(0, 5)
          .map(row => row[j])
          .filter(v => v !== '' && v !== null && v !== undefined &&
            !(typeof v === 'string' && v.startsWith('=')));

        const dataType = detectDataType(sampleValues);

        const colDef = await prisma.columnDefinition.create({
          data: {
            worksheet_id: ws.id,
            column_key: finalKey,
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
          rowData[col.column_key] = convertCellValue(cellValue);
        }

        const firstCellValue = row[0];
        const firstCellStr = convertCellValue(firstCellValue);
        const identifier = firstCellStr || `row_${r + 1}`;

        await prisma.rowData.create({
          data: {
            worksheet_id: ws.id,
            row_index: r,
            row_identifier: identifier,
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

    cache.del('spreadsheets:all');

    res.status(201).json({
      success: true,
      message: 'Excel file uploaded and processed successfully',
      data: {
        source_id: source.id,
        name: source.name,
        sheets_processed: processedSheets
      }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Upload Excel error:', error);
    res.status(500).json({ success: false, message: 'Failed to process Excel file' });
  }
};

const getAllSources = async (req, res) => {
  try {
    const cacheKey = 'spreadsheets:all';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: { sources: cached }, cached: true });
    }

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

    cache.set(cacheKey, sources, 300);
    res.json({ success: true, data: { sources } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
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
    if (handlePrismaError(error, res)) return;
    console.error('Get source error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch spreadsheet source' });
  }
};

const getWorksheetData = async (req, res) => {
  try {
    const { worksheetId } = req.params;
    const { page = 1, limit = 100 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const cacheKey = `worksheet:${worksheetId}:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, cached: true });
    }

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

    const result = {
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
    };

    cache.set(cacheKey, result, 120);
    res.json({ success: true, data: result });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get worksheet data error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch worksheet data' });
  }
};

const updateRow = async (req, res) => {
  try {
    const { rowId } = req.params;
    const { data, column_id, previous_value, new_value } = req.body;

    if (typeof data !== 'object' || data === null || Array.isArray(data) || Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: 'data must be a non-empty object' });
    }

    const row = await prisma.rowData.findUnique({ where: { id: rowId } });

    if (!row) {
      return res.status(404).json({ success: false, message: 'Row not found' });
    }

    const updated = await prisma.rowData.update({
      where: { id: rowId },
      data: { data }
    });

    cache.delPattern(`worksheet:${row.worksheet_id}`);

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
    if (handlePrismaError(error, res)) return;
    console.error('Update row error:', error);
    res.status(500).json({ success: false, message: 'Failed to update row' });
  }
};

module.exports = {
  uploadExcel,
  getAllSources,
  getSourceById,
  getWorksheetData,
  updateRow,
  detectDataType,
  excelSerialToDate,
  isExcelDate,
  convertCellValue,
  convertHeaderValue,
  cleanNumber,
  findHeaderRow
};