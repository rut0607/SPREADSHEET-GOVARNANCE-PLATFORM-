const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getStorageStats } = require('../controllers/systemController');

router.get('/storage', authenticate, requireAdmin, getStorageStats);

module.exports = router;
