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
  exportExcel,
  getEmployeePerformanceHistory,
  getPlantPerformanceHistory,
  getTargetVsActualTrend
} = require('../controllers/productionController');

router.post('/entry', authenticate, idempotency, submitDailyEntry);
router.get('/my-entries', authenticate, getMyEntries);
router.get('/daily-report', authenticate, requireAdmin, getDailyReport);
router.get('/efficiency-report', authenticate, requireAdmin, getEfficiencyReport);
router.get('/export-excel', authenticate, requireAdmin, exportExcel);
router.get('/alerts', authenticate, requireAdmin, getAlerts);
router.put('/alerts/:id/resolve', authenticate, requireAdmin, resolveAlert);
router.get('/plant-history', authenticate, requireAdmin, getPlantPerformanceHistory);
router.get('/performance-history/:employeeId', authenticate, getEmployeePerformanceHistory);
router.get('/trend-analysis', authenticate, requireAdmin, getTargetVsActualTrend);

module.exports = router;
