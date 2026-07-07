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
  limits: { fileSize: 50 * 1024 * 1024 },
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

router.put('/row/:rowId', authenticate, updateRow);

router.get('/:id', authenticate, getSourceById);

module.exports = router;