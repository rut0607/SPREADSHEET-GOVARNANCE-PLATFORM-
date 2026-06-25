const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const prisma = require('../config/prisma');
const {
  uploadExcel,
  getAllSources,
  getSourceById,
  getWorksheetData,
  updateRow
} = require('../controllers/spreadsheetController');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

router.post('/upload', authenticate, requireAdmin, upload.single('file'), uploadExcel);
router.get('/', authenticate, getAllSources);
router.get('/worksheet/:worksheetId/data', authenticate, getWorksheetData);

router.put('/column/:columnId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { columnId } = req.params;
    const { display_name, data_type, is_required, is_unique, is_identifier, dropdown_options } = req.body;

    const updated = await prisma.columnDefinition.update({
      where: { id: columnId },
      data: {
        ...(display_name && { display_name }),
        ...(data_type && { data_type }),
        ...(is_required !== undefined && { is_required }),
        ...(is_unique !== undefined && { is_unique }),
        ...(is_identifier !== undefined && { is_identifier }),
        ...(dropdown_options !== undefined && { dropdown_options })
      }
    });

    res.json({ success: true, message: 'Column updated successfully', data: { column: updated } });
  } catch (error) {
    console.error('Update column error:', error);
    res.status(500).json({ success: false, message: 'Failed to update column' });
  }
});

router.put('/row/:rowId', authenticate, async (req, res) => {
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
});

router.get('/:id', authenticate, getSourceById);

module.exports = router;