const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  uploadExcel,
  getAllSources,
  getSourceById,
  getWorksheetData
} = require('../controllers/spreadsheetController');

const path = require('path');


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
router.get('/:id', authenticate, getSourceById);
router.get('/worksheet/:worksheetId/data', authenticate, getWorksheetData);

module.exports = router;