const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  connectGoogleSheet,
  syncGoogleSheet,
  getServiceAccountEmail
} = require('../controllers/googleSheetsController');

router.get('/service-account', authenticate, requireAdmin, getServiceAccountEmail);
router.post('/connect', authenticate, requireAdmin, connectGoogleSheet);
router.post('/sync/:sourceId', authenticate, requireAdmin, syncGoogleSheet);

module.exports = router;