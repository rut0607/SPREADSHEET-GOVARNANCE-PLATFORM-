const prisma = require('../config/prisma');
const { supabaseAdmin } = require('../config/supabase');
const XLSX = require('xlsx');

const getVersions = async (req, res) => {
  try {
    const { sourceId } = req.params;
    const versions = await prisma.spreadsheetVersion.findMany({
      where: { source_id: sourceId },
      orderBy: { version_number: 'desc' }
    });
    res.json({ success: true, data: { versions } });
  } catch (error) {
    console.error('Get versions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch versions' });
  }
};

const uploadNewVersion = async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { notes } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const source = await prisma.spreadsheetSource.findUnique({
      where: { id: sourceId },
      include: { versions: true }
    });

    if (!source) {
      return res.status(404).json({ success: false, message: 'Source not found' });
    }

    const nextVersion = (source.versions.length > 0
      ? Math.max(...source.versions.map(v => v.version_number))
      : 0) + 1;

    const fileName = `${Date.now()}_v${nextVersion}_${req.file.originalname}`;
    const filePath = `excel/${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET)
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype });

    if (uploadError) console.error('Storage upload error:', uploadError);

    await prisma.spreadsheetVersion.updateMany({
      where: { source_id: sourceId },
      data: { is_current: false }
    });

    const version = await prisma.spreadsheetVersion.create({
      data: {
        source_id: sourceId,
        version_number: nextVersion,
        file_path: filePath,
        uploaded_by: req.user.id,
        notes: notes || '',
        is_current: true
      }
    });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      if (jsonData.length === 0) continue;

      const dataRows = jsonData.slice(1).filter(row =>
        row.some(cell => cell !== '' && cell !== null)
      );

      const existingWorksheet = await prisma.worksheet.findFirst({
        where: { source_id: sourceId, name: sheetName },
        include: { column_definitions: true }
      });

      if (existingWorksheet) {
        await prisma.rowData.deleteMany({ where: { worksheet_id: existingWorksheet.id } });

        for (let r = 0; r < dataRows.length; r++) {
          const row = dataRows[r];
          const rowData = {};
          for (const col of existingWorksheet.column_definitions) {
            const cellValue = row[col.column_index];
            rowData[col.column_key] = cellValue !== undefined ? cellValue.toString() : '';
          }
          await prisma.rowData.create({
            data: {
              worksheet_id: existingWorksheet.id,
              row_index: r,
              row_identifier: row[0] ? row[0].toString() : `row_${r + 1}`,
              data: rowData,
              is_deleted: false
            }
          });
        }

        await prisma.worksheet.update({
          where: { id: existingWorksheet.id },
          data: { row_count: dataRows.length }
        });
      }
    }

    await prisma.spreadsheetSource.update({
      where: { id: sourceId },
      data: { last_synced_at: new Date() }
    });

    res.status(201).json({
      success: true,
      message: `Version ${nextVersion} uploaded successfully`,
      data: { version }
    });
  } catch (error) {
    console.error('Upload version error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload new version' });
  }
};

const restoreVersion = async (req, res) => {
  try {
    const { sourceId, versionId } = req.params;

    const version = await prisma.spreadsheetVersion.findUnique({ where: { id: versionId } });
    if (!version) {
      return res.status(404).json({ success: false, message: 'Version not found' });
    }

    await prisma.spreadsheetVersion.updateMany({
      where: { source_id: sourceId },
      data: { is_current: false }
    });

    await prisma.spreadsheetVersion.update({
      where: { id: versionId },
      data: { is_current: true }
    });

    res.json({ success: true, message: `Restored to version ${version.version_number}` });
  } catch (error) {
    console.error('Restore version error:', error);
    res.status(500).json({ success: false, message: 'Failed to restore version' });
  }
};

const getValidationReport = async (req, res) => {
  try {
    const { sourceId } = req.params;

    const source = await prisma.spreadsheetSource.findUnique({
      where: { id: sourceId },
      include: {
        worksheets: {
          include: {
            column_definitions: true,
            row_data: { where: { is_deleted: false } }
          }
        }
      }
    });

    if (!source) {
      return res.status(404).json({ success: false, message: 'Source not found' });
    }

    const report = {
      source_name: source.name,
      generated_at: new Date().toISOString(),
      worksheets: []
    };

    for (const ws of source.worksheets) {
      const wsReport = {
        worksheet_name: ws.name,
        total_rows: ws.row_data.length,
        total_columns: ws.column_definitions.length,
        issues: [],
        column_stats: []
      };

      for (const col of ws.column_definitions) {
        const values = ws.row_data.map(r => r.data[col.column_key]);
        const emptyCount = values.filter(v => !v || v === '').length;
        const uniqueValues = new Set(values.filter(v => v && v !== '')).size;
        const duplicateCount = Math.max(0, values.length - emptyCount - uniqueValues);

        wsReport.column_stats.push({
          column: col.display_name,
          data_type: col.data_type,
          total_values: values.length,
          empty_count: emptyCount,
          unique_count: uniqueValues,
          duplicate_count: duplicateCount
        });

        if (col.is_required && emptyCount > 0) {
          wsReport.issues.push({
            type: 'missing_required',
            column: col.display_name,
            count: emptyCount,
            severity: 'high'
          });
        }

        if (col.is_unique && duplicateCount > 0) {
          wsReport.issues.push({
            type: 'duplicate_values',
            column: col.display_name,
            count: duplicateCount,
            severity: 'medium'
          });
        }
      }

      report.worksheets.push(wsReport);
    }

    res.json({ success: true, data: { report } });
  } catch (error) {
    console.error('Validation report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};

module.exports = {
  getVersions,
  uploadNewVersion,
  restoreVersion,
  getValidationReport
};
