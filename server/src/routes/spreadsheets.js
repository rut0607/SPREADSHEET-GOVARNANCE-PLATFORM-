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
  getWorksheetData
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
router.get('/:id', authenticate, getSourceById);

router.put('/row/:rowId', authenticate, async (req, res) => {
  try {
    const { rowId } = req.params;
    const { data } = req.body;

    const updated = await prisma.rowData.update({
      where: { id: rowId },
      data: { data }
    });

    await prisma.auditLog.create({
      data: {
        user_id: req.user.id,
        action_type: 'direct_edit',
        row_id: rowId,
        new_value: JSON.stringify(data),
        metadata: { source: 'employee_edit' }
      }
    });

    res.json({
      success: true,
      message: 'Row updated successfully',
      data: { row: updated }
    });
  } catch (error) {
    console.error('Update row error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update row'
    });
  }
});

module.exports = router;