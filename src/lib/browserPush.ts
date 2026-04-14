import { apiJson } from './api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPermissionState() {
  if (!(await isPushSupported())) return 'unsupported' as const;
  return Notification.permission;
}

export async function registerPushSubscription() {
  if (!(await isPushSupported())) throw new Error('unsupported');
  const keyRes = await apiJson<{ enabled: boolean; publicKey: string }>('/api/push/public-key');
  if (!keyRes.enabled || !keyRes.publicKey) throw new Error('push-unavailable');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission-denied');

  const registration = await navigator.serviceWorker.register('/sw.js');
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
    }));

  await apiJson('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription }),
  });
}

export async function unregisterPushSubscription() {
  if (!(await isPushSupported())) return;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await apiJson('/api/push/unsubscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}
