const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const prisma = require('../config/prisma');
const {
  connectGoogleSheet,
  syncGoogleSheet,
  getServiceAccountEmail
} = require('../controllers/googleSheetsController');

router.get('/service-account', authenticate, requireAdmin, getServiceAccountEmail);
router.post('/connect', authenticate, requireAdmin, connectGoogleSheet);
router.post('/sync/:sourceId', authenticate, requireAdmin, syncGoogleSheet);

router.put('/settings/:sourceId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { sync_mode, conflict_resolution } = req.body;

    const updated = await prisma.spreadsheetSource.update({
      where: { id: sourceId },
      data: {
        ...(sync_mode && { sync_mode }),
        ...(conflict_resolution && { conflict_resolution })
      }
    });

    res.json({
      success: true,
      message: 'Sync settings updated',
      data: { source: updated }
    });
  } catch (error) {
    console.error('Update sync settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

module.exports = router;