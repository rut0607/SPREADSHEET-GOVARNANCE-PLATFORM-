const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');

router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' },
      take: 50
    });

    const unreadCount = await prisma.notification.count({
      where: { user_id: req.user.id, is_read: false }
    });

    res.json({ success: true, data: { notifications, unread_count: unreadCount } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
});

router.put('/:id/read', authenticate, async (req, res) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id, user_id: req.user.id },
      data: { is_read: true }
    });
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Mark notification read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notification' });
  }
});

router.put('/mark-all-read', authenticate, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { user_id: req.user.id, is_read: false },
      data: { is_read: true }
    });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications' });
  }
});

module.exports = router;
