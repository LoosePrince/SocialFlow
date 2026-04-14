import webpush from 'web-push';

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? '';
const vapidSubject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';

const pushEnabled = vapidPublicKey.length > 0 && vapidPrivateKey.length > 0;

if (pushEnabled) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn('[push] VAPID keys missing; web push disabled');
}

export function isPushEnabled() {
  return pushEnabled;
}

export function getPushPublicKey() {
  return vapidPublicKey;
}

export async function sendWebPush(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload
): Promise<string[]> {
  if (!pushEnabled || subscriptions.length === 0) return [];
  const invalidEndpoints: string[] = [];
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          body
        );
      } catch (err: unknown) {
        const statusCode =
          typeof err === 'object' && err && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          invalidEndpoints.push(sub.endpoint);
          return;
        }
        console.warn('[push] send failed:', err);
      }
    })
  );

  return invalidEndpoints;
}
