self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'SocialFlow', body: event.data.text() };
  }
  const title = payload.title || 'SocialFlow';
  const options = {
    body: payload.body || '',
    tag: payload.tag || 'socialflow-notify',
    data: {
      url: payload.url || '/messages',
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/messages';
  event.waitUntil(clients.openWindow(url));
});
