const prisma = require('../config/prisma');
const { getVapidPublicKey } = require('../config/webPush');

const subscribe = async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, message: 'A valid push subscription is required' });
    }

    const existing = await prisma.pushSubscription.findFirst({
      where: { user_id: req.user.id, subscription: { path: ['endpoint'], equals: subscription.endpoint } }
    });

    if (existing) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { subscription, user_agent: req.headers['user-agent'] || null, is_active: true }
      });
    } else {
      await prisma.pushSubscription.create({
        data: {
          user_id: req.user.id,
          subscription,
          user_agent: req.headers['user-agent'] || null,
          is_active: true
        }
      });
    }

    res.status(201).json({ success: true, message: 'Push subscription saved successfully' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ success: false, message: 'Failed to save push subscription' });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;

    const whereClause = { user_id: req.user.id, is_active: true };
    if (endpoint) {
      whereClause.subscription = { path: ['endpoint'], equals: endpoint };
    }

    await prisma.pushSubscription.updateMany({
      where: whereClause,
      data: { is_active: false }
    });

    res.json({ success: true, message: 'Push subscription removed successfully' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove push subscription' });
  }
};

const getVapidKey = async (req, res) => {
  try {
    res.json({ success: true, data: { publicKey: getVapidPublicKey() } });
  } catch (error) {
    console.error('Get VAPID key error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch VAPID key' });
  }
};

module.exports = { subscribe, unsubscribe, getVapidKey };
