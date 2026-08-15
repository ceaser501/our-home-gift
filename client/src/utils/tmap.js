import { isNativeApp } from './browser';

// 티맵 앱으로 길안내를 넘긴다. 앱이 깔려 있는지는 웹에서 알 수 없어서(브라우저가
// 막아둔 영역이다) "열어보고 안 되면 스토어로" 방식으로 처리한다.
//   - 안드로이드 브라우저: intent 주소에 대체 주소를 실어 보내면 OS가 알아서 처리해준다.
//   - 그 밖(아이폰, 그리고 앱 안): 그런 장치가 없어서, 앱으로 넘어가지 않고 화면이
//     그대로면 스토어로 보낸다.
//
// ── 앱 안에서는 intent 주소를 쓰지 않는다 ───────────────────────────────────
// intent:// 형태를 풀어주는 것은 크롬이지 웹뷰가 아니다. Capacitor 웹뷰는 자기 도메인
// 밖의 주소를 만나면 `new Intent(ACTION_VIEW, url)`로 그대로 넘기는데
// (Bridge.launchIntent), 그 url의 scheme이 "intent"라서 받아줄 앱이 없다. 던져진
// ActivityNotFoundException은 아무도 잡지 않아서, 눌러도 아무 일도 일어나지 않았다.
//
// 앱 안에서는 tmap:// 를 그대로 넘긴다. 이건 티맵이 받는 진짜 scheme이라 열린다.
// 대신 대체 주소를 같이 실을 수 없으니, 아이폰에서 쓰던 "화면이 그대로면 스토어로"를
// 같이 쓴다. 앱으로 넘어가면 웹뷰가 가려져서 document.hidden이 참이 된다.

const IOS_STORE = 'https://apps.apple.com/kr/app/id431589174';
const ANDROID_PACKAGE = 'com.skt.tmap.ku';
const PLAY_STORE = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
// 앱으로 넘어가는 데 걸리는 시간. 이보다 오래 화면이 그대로면 앱이 없는 것으로 본다.
const APP_SWITCH_WAIT_MS = 1500;

// 어디로 이동할지 주소만 만든다(이동은 아래에서). 안드로이드는 앱이 없을 때 대신 갈 곳까지
// 주소 안에 실어 보낼 수 있어서 형태가 다르다.
export function buildTmapRouteUrl({ name, lat, lng }, userAgent = navigator.userAgent, native = isNativeApp()) {
  const query = `goalname=${encodeURIComponent(name)}&goalx=${lng}&goaly=${lat}`;
  if (!native && /Android/i.test(userAgent)) {
    return (
      `intent://route?${query}#Intent;scheme=tmap;package=${ANDROID_PACKAGE};` +
      `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`
    );
  }
  return `tmap://route?${query}`;
}

export function openTmapRoute({ name, lat, lng }) {
  const url = buildTmapRouteUrl({ name, lat, lng });
  const android = /Android/i.test(navigator.userAgent);

  // 브라우저에서만 intent 주소를 쓴다. 이 경우 대체 주소가 안에 실려 있어서 여기서
  // 더 할 일이 없다.
  if (android && !isNativeApp()) {
    window.location.href = url;
    return;
  }

  const store = android ? PLAY_STORE : IOS_STORE;
  const timer = setTimeout(() => {
    // 앱으로 넘어갔으면 화면이 가려져 있다. 그대로 보이면 앱이 없는 것이다.
    if (!document.hidden) window.location.href = store;
  }, APP_SWITCH_WAIT_MS);

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) clearTimeout(timer);
    },
    { once: true }
  );

  window.location.href = url;
}
