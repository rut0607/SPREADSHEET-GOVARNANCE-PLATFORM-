import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';

const isPushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const usePushNotifications = () => {
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isSupported] = useState(isPushSupported());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsPushEnabled(!!subscription))
      .catch(() => {});
  }, [isSupported]);

  const enablePush = useCallback(async () => {
    if (!isSupported) {
      toast.error('Push notifications are not supported on this device');
      return false;
    }

    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notification permission was denied');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const { data } = await api.get('/push/vapid-key');
      const applicationServerKey = urlBase64ToUint8Array(data.data.publicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      await api.post('/push/subscribe', { subscription: subscription.toJSON() });
      setIsPushEnabled(true);
      toast.success('Push notifications enabled');
      return true;
    } catch (error) {
      toast.error('Failed to enable push notifications');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const disablePush = useCallback(async () => {
    if (!isSupported) return false;

    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await api.delete('/push/subscribe', { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }

      setIsPushEnabled(false);
      toast.success('Push notifications disabled');
      return true;
    } catch (error) {
      toast.error('Failed to disable push notifications');
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return { isPushEnabled, isSupported, loading, enablePush, disablePush };
};

export default usePushNotifications;
