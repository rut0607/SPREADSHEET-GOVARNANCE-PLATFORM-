const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getJobs, getAlertConfiguration, updateAlertConfiguration } = require('../controllers/adminController');

router.get('/jobs', authenticate, requireAdmin, getJobs);
router.get('/alert-config', authenticate, requireAdmin, getAlertConfiguration);
router.put('/alert-config', authenticate, requireAdmin, updateAlertConfiguration);

module.exports = router;
