// 티맵 앱으로 길안내를 넘긴다. 앱이 깔려 있는지는 웹에서 알 수 없어서(브라우저가
// 막아둔 영역이다) "열어보고 안 되면 스토어로" 방식으로 처리한다.
//   - 안드로이드: intent 주소에 대체 주소를 실어 보내면 OS가 알아서 처리해준다.
//   - 아이폰: 그런 장치가 없어서, 앱으로 넘어가지 않고 화면이 그대로면 스토어로 보낸다.

const IOS_STORE = 'https://apps.apple.com/kr/app/id431589174';
const ANDROID_PACKAGE = 'com.skt.tmap.ku';
const PLAY_STORE = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
// 앱으로 넘어가는 데 걸리는 시간. 이보다 오래 화면이 그대로면 앱이 없는 것으로 본다.
const APP_SWITCH_WAIT_MS = 1500;

// 어디로 이동할지 주소만 만든다(이동은 아래에서). 안드로이드는 앱이 없을 때 대신 갈 곳까지
// 주소 안에 실어 보낼 수 있어서 형태가 다르다.
export function buildTmapRouteUrl({ name, lat, lng }, userAgent = navigator.userAgent) {
  const query = `goalname=${encodeURIComponent(name)}&goalx=${lng}&goaly=${lat}`;
  if (/Android/i.test(userAgent)) {
    return (
      `intent://route?${query}#Intent;scheme=tmap;package=${ANDROID_PACKAGE};` +
      `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE)};end`
    );
  }
  return `tmap://route?${query}`;
}

export function openTmapRoute({ name, lat, lng }) {
  const url = buildTmapRouteUrl({ name, lat, lng });

  if (/Android/i.test(navigator.userAgent)) {
    window.location.href = url;
    return;
  }

  const timer = setTimeout(() => {
    // 앱으로 넘어갔으면 화면이 가려져 있다. 그대로 보이면 앱이 없는 것이다.
    if (!document.hidden) window.location.href = IOS_STORE;
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
