const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  getVersions,
  uploadNewVersion,
  restoreVersion,
  getValidationReport
} = require('../controllers/versionController');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

router.get('/:sourceId', authenticate, requireAdmin, getVersions);
router.post('/:sourceId/upload', authenticate, requireAdmin, upload.single('file'), uploadNewVersion);
router.put('/:sourceId/restore/:versionId', authenticate, requireAdmin, restoreVersion);
router.get('/:sourceId/report/validation', authenticate, requireAdmin, getValidationReport);

module.exports = router;