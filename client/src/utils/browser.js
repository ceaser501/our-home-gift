export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function isAndroid() {
  return /android/i.test(window.navigator.userAgent);
}

// 카카오톡/네이버/인스타 등에서 링크를 누르면 각 앱의 자체 웹뷰(인앱 브라우저)로 열린다.
// 인앱 브라우저에는 "홈 화면에 추가" 기능이 없고 구글 로그인도 막히는 경우가 많아서,
// 크롬/사파리로 옮겨가야 정상적으로 쓸 수 있다.
export function detectInAppBrowser() {
  const ua = window.navigator.userAgent;
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk';
  if (/NAVER\(inapp/i.test(ua)) return 'naver';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV/i.test(ua)) return 'facebook';
  if (/Line\//i.test(ua)) return 'line';
  if (/DaumApps/i.test(ua)) return 'daum';
  return null;
}

// 인앱 브라우저에서 외부 브라우저로 빠져나간다. 카카오톡은 전용 스킴을 제공하고,
// 그 외 안드로이드 앱은 intent 스킴으로 크롬을 직접 지정해서 열 수 있다.
// 그 외(아이폰의 카카오톡 외 인앱 브라우저)는 방법이 막혀 있어서 false를 돌려주고,
// 호출한 쪽에서 "메뉴에서 직접 열어주세요" 안내를 띄우게 한다.
export function openInExternalBrowser(inApp) {
  const url = window.location.href;
  if (inApp === 'kakaotalk') {
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return true;
  }
  if (!isIos()) {
    const withoutScheme = url.replace(/^https?:\/\//, '');
    window.location.href = `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;end`;
    return true;
  }
  return false;
}
