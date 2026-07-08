const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const idempotency = require('../middleware/idempotency');
const {
  submitDailyEntry,
  getMyEntries,
  getDailyReport,
  getEfficiencyReport,
  getAlerts,
  resolveAlert,
  exportExcel
} = require('../controllers/productionController');

router.post('/entry', authenticate, idempotency, submitDailyEntry);
router.get('/my-entries', authenticate, getMyEntries);
router.get('/daily-report', authenticate, requireAdmin, getDailyReport);
router.get('/efficiency-report', authenticate, requireAdmin, getEfficiencyReport);
router.get('/export-excel', authenticate, requireAdmin, exportExcel);
router.get('/alerts', authenticate, requireAdmin, getAlerts);
router.put('/alerts/:id/resolve', authenticate, requireAdmin, resolveAlert);

module.exports = router;
