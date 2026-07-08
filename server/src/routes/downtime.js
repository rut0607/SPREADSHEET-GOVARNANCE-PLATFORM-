const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  submitDowntime,
  getMyDowntime,
  getDailyDowntimeReport,
  getDowntimeSummary,
  resolveDowntime,
  exportDowntimeExcel
} = require('../controllers/downtimeController');

router.post('/', authenticate, submitDowntime);
router.get('/my-downtime', authenticate, getMyDowntime);
router.get('/daily-report', authenticate, requireAdmin, getDailyDowntimeReport);
router.get('/summary', authenticate, requireAdmin, getDowntimeSummary);
router.get('/export-excel', authenticate, requireAdmin, exportDowntimeExcel);
router.put('/:id/resolve', authenticate, requireAdmin, resolveDowntime);

module.exports = router;
