// 갤러리나 카카오톡에서 이미지를 "공유 → 모아콘"으로 보내면, 서비스워커가 그 이미지를
// 캐시에 넣어두고 앱을 `?share=1`로 연다(client/public/sw.js). 여기서 그걸 꺼내 온다.
//
// 안드로이드 크롬에 설치했을 때만 동작한다. iOS 사파리는 공유 대상을 지원하지 않아서
// 공유 목록에 모아콘이 아예 뜨지 않는다(대신 아무것도 깨지지 않는다).

// 서비스워커가 넣어둔 곳과 같은 이름이어야 한다.
const SHARE_CACHE = 'moacon-shared-images';
const SHARE_FLAG = 'share';

export function hasSharedImages() {
  return new URLSearchParams(window.location.search).has(SHARE_FLAG);
}

// 표시를 지워두지 않으면 새로고침하거나 앱을 다시 열 때마다 등록 창이 또 열린다.
// 이미 캐시는 비운 뒤라 사진 없는 빈 창이 뜬다.
function clearFlag() {
  const url = new URL(window.location.href);
  url.searchParams.delete(SHARE_FLAG);
  window.history.replaceState(null, '', url);
}

// 공유로 받아둔 이미지를 꺼내면서 캐시를 비운다. 한 번 등록 창으로 넘어간 사진은
// 그 창이 들고 있으므로 캐시에 남겨둘 이유가 없다.
export async function takeSharedImages() {
  clearFlag();
  if (!('caches' in window)) return [];

  try {
    const cache = await caches.open(SHARE_CACHE);
    const keys = await cache.keys();
    // 서비스워커가 번호를 붙여 넣어둔다. 공유한 순서대로 돌려준다.
    keys.sort((a, b) => a.url.localeCompare(b.url));

    const files = [];
    for (const key of keys) {
      const res = await cache.match(key);
      if (!res) continue;
      const blob = await res.blob();
      // 이름은 화면에 보이지 않지만, 업로드할 때 확장자로 쓰여서 그대로 살려준다.
      const name = decodeURIComponent(res.headers.get('x-shared-name') || '') || 'shared.jpg';
      files.push(new File([blob], name, { type: blob.type || 'image/jpeg' }));
    }

    await caches.delete(SHARE_CACHE);
    return files;
  } catch {
    // 못 꺼내면 그냥 빈 앱이 열린다. 사용자는 평소처럼 직접 올리면 된다.
    return [];
  }
}

// 공유는 했는데 등록까지 이어지지 않은 사진을 치운다. 예를 들어 로그아웃 상태로 공유하면
// 로그인 화면을 거치면서 `?share=1`이 떨어져 나가, 주인 없는 사진만 캐시에 남는다.
export async function discardSharedImages() {
  if (!('caches' in window)) return;
  try {
    await caches.delete(SHARE_CACHE);
  } catch {
    // 못 지워도 다음 공유 때 서비스워커가 어차피 비우고 넣는다.
  }
}
