const webPush = require('web-push');

let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn('VAPID keys not set in environment — generating ephemeral keys for this process. Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY to persist subscriptions across restarts.');
  const generated = webPush.generateVAPIDKeys();
  vapidPublicKey = generated.publicKey;
  vapidPrivateKey = generated.privateKey;
}

// Fallback is intentional, not a placeholder left in by mistake: the VAPID spec
// requires a contact address so push services can reach the sender if a
// subscription is being abused, and this is only ever used if VAPID_EMAIL is unset.
webPush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@alambre.com',
  vapidPublicKey,
  vapidPrivateKey
);

const sendPushNotification = async (subscription, payload) => {
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Push notification error:', error.message);
    return false;
  }
};

module.exports = {
  sendPushNotification,
  getVapidPublicKey: () => vapidPublicKey
};
