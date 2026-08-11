const SCOPE = new URL('./', self.registration.scope);
const BASE = SCOPE.pathname;

// 갤러리·카카오톡의 "공유" 목록에서 모아콘을 고르면, 안드로이드가 이 주소로 이미지를
// POST로 던진다(manifest.json의 share_target). 배포처는 정적 호스팅이라 POST를 받아줄
// 서버가 없고, 받아줄 수 있는 건 여기 서비스워커뿐이다.
const SHARE_PATH = `${BASE}share-target`;
// 받은 이미지를 화면 쪽으로 넘기는 통로. postMessage로는 안 된다 — 공유를 누른 순간에는
// 앱이 아직 떠 있지 않을 수 있어서 말을 걸 상대가 없다. 캐시에 넣어두고 앱이 뜬 뒤에
// 꺼내 가게 한다.
const SHARE_CACHE = 'moacon-shared-images';

// 새 서비스워커가 곧바로 일을 넘겨받게 한다. 기다리게 두면, 이미 열려 있는 앱을 완전히
// 종료할 때까지 공유로 들어온 요청을 가로챌 서비스워커가 없어서 그동안 공유가 실패한다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // 공유로 들어온 요청만 가로챈다. 나머지는 손대지 않고 브라우저에 그대로 맡긴다
  // (이 서비스워커는 화면 파일을 캐시하지 않는다).
  if (event.request.method !== 'POST' || url.pathname !== SHARE_PATH) return;
  event.respondWith(handleShare(event.request));
});

async function handleShare(request) {
  try {
    const formData = await request.formData();
    // 이미지 칸으로 왔더라도 파일이 아닌 값(문자열)이 섞여 들어올 수 있어서 걸러낸다.
    const files = formData.getAll('images').filter((file) => file instanceof File && file.type.startsWith('image/'));

    const cache = await caches.open(SHARE_CACHE);
    // 지난번 공유가 등록까지 이어지지 않고 끝났으면 그때 것이 남아 있다. 방금 공유한
    // 것만 열려야 하므로 먼저 비운다.
    for (const key of await cache.keys()) await cache.delete(key);

    for (const [index, file] of files.entries()) {
      // 파일 이름은 헤더에 담아 함께 넘긴다. 헤더는 아스키만 담을 수 있어서 인코딩한다.
      await cache.put(
        // 여러 장을 공유하면 원래 순서대로 꺼내야 해서 번호를 붙인다. 10장이 넘어가도
        // 문자열 정렬이 뒤집히지 않게 자릿수를 맞춘다.
        new Request(new URL(`__shared/${String(index).padStart(3, '0')}`, SCOPE)),
        new Response(file, {
          headers: {
            'content-type': file.type,
            'x-shared-name': encodeURIComponent(file.name || ''),
          },
        })
      );
    }
  } catch {
    // 이미지를 못 받아도 앱은 열어준다. 빈손으로 열리면 사용자가 직접 올릴 수 있지만,
    // 여기서 오류를 내면 "공유가 안 되는 앱"이 되어버린다.
  }

  // 303으로 보내야 뒤이어 GET으로 열린다. 그대로 두면 새로고침할 때마다 POST가 다시 날아간다.
  return Response.redirect(new URL('./?share=1', SCOPE).href, 303);
}

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
      // 같은 꼬리표끼리는 서로 덮어쓴다. 유효기한 알림과 참여 신청 알림은 성격이 달라서
      // 보내는 쪽에서 꼬리표를 따로 정해 보낸다(안 보내면 유효기한 알림으로 본다).
      tag: data.tag || 'gifticon-expiry',
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
