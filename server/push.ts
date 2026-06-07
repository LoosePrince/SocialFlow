import webpush from 'web-push';
import { getRuntimeConfigValue } from './runtimeConfig.js';

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

type PushConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

let lastVapidSignature = '';

async function getPushConfig(): Promise<PushConfig> {
  const [publicKey, privateKey, subject] = await Promise.all([
    getRuntimeConfigValue('VAPID_PUBLIC_KEY', ''),
    getRuntimeConfigValue('VAPID_PRIVATE_KEY', ''),
    getRuntimeConfigValue('VAPID_SUBJECT', 'mailto:admin@example.com'),
  ]);
  return {
    publicKey: (publicKey ?? '').trim(),
    privateKey: (privateKey ?? '').trim(),
    subject: (subject ?? 'mailto:admin@example.com').trim() || 'mailto:admin@example.com',
  };
}

async function applyVapidConfig(): Promise<PushConfig | null> {
  const config = await getPushConfig();
  if (!config.publicKey || !config.privateKey) return null;

  const signature = `${config.subject}\n${config.publicKey}\n${config.privateKey}`;
  if (signature !== lastVapidSignature) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    lastVapidSignature = signature;
  }
  return config;
}

export async function isPushEnabled() {
  const config = await getPushConfig();
  return config.publicKey.length > 0 && config.privateKey.length > 0;
}

export async function getPushPublicKey() {
  return (await getPushConfig()).publicKey;
}

export async function sendWebPush(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload
): Promise<string[]> {
  if (subscriptions.length === 0) return [];
  const config = await applyVapidConfig();
  if (!config) return [];
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
