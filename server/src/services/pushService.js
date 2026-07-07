const prisma = require('../config/prisma');
const { sendPushNotification } = require('../config/webPush');

const sendToSubscriptions = async (subscriptions, payload) => {
  await Promise.all(subscriptions.map((sub) => sendPushNotification(sub.subscription, payload)));
};

const notifyUser = async (userId, payload) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { user_id: userId, is_active: true }
    });
    if (subscriptions.length === 0) return;
    await sendToSubscriptions(subscriptions, payload);
  } catch (error) {
    console.error('notifyUser push error:', error.message);
  }
};

const notifyAdmins = async (payload) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { is_active: true, user: { is_admin: true, is_active: true } }
    });
    if (subscriptions.length === 0) return;
    await sendToSubscriptions(subscriptions, payload);
  } catch (error) {
    console.error('notifyAdmins push error:', error.message);
  }
};

module.exports = { notifyUser, notifyAdmins };
