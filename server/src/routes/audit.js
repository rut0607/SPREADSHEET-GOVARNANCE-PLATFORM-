const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getAuditLogs, exportAuditCsv } = require('../controllers/auditController');

router.get('/logs', authenticate, requireAdmin, getAuditLogs);
router.get('/export', authenticate, requireAdmin, exportAuditCsv);

module.exports = router;
