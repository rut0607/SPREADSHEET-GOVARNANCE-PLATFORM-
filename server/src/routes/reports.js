const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  getWeeklyReports,
  getWeeklyReport,
  generateReport,
  exportWeeklyReport
} = require('../controllers/reportController');

router.get('/weekly', authenticate, requireAdmin, getWeeklyReports);
router.post('/weekly/generate', authenticate, requireAdmin, generateReport);
router.get('/weekly/:id', authenticate, requireAdmin, getWeeklyReport);
router.get('/weekly/:id/export', authenticate, requireAdmin, exportWeeklyReport);

module.exports = router;
