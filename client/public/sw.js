const BASE = new URL('./', self.registration.scope).pathname;

self.addEventListener('push', (event) => {
  let data = { title: '유효기한이 곧 만료돼요', body: '유효기한이 얼마 안 남은 기프티콘이 있어요.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // JSON이 아니면 기본 문구 그대로 사용
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      // icon/badge는 일부러 지정하지 않는다. 안드로이드가 왼쪽에 앱 아이콘을 자동으로
      // 붙여주는데, 여기서 icon까지 주면 오른쪽에 같은 아이콘이 하나 더 붙어서 지저분해진다.
      tag: 'gifticon-expiry',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(BASE);
    })
  );
});
