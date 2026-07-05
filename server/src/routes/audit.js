const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { exportAuditCsv } = require('../controllers/auditController');

router.get('/export', authenticate, requireAdmin, exportAuditCsv);

module.exports = router;
