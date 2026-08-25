import { isNativeApp } from './browser';

// 앱을 잠깐 벗어났다 돌아왔을 때 보던 창으로 되돌리기.
//
// 약관·개인정보처리방침·오픈소스 정보는 앱 안에 같이 담겨 나가는 정적 페이지다. 웹에서는
// target="_blank"가 새 탭을 열어서 보던 화면이 그대로 남는데, 앱 웹뷰에는 탭이 없어서
// 그 자리에서 이동해버린다. 그러고 뒤로가기를 누르면 앱이 처음부터 다시 열려서, 내 메뉴를
// 열어둔 채 약관을 보러 갔던 사람이 메인으로 떨어진다.
//
// 그래서 떠나기 전에 "여기로 돌아와야 한다"를 적어두고, 다시 열릴 때 그 창을 도로 연다.
//
// localStorage를 쓴다. sessionStorage는 웹뷰가 통째로 정리되면 같이 사라지는데,
// 안드로이드는 메모리가 모자라면 그렇게 한다. 대신 시각을 같이 적어서 오래된 표시는
// 무시한다 — 사흘 뒤에 앱을 열었더니 내 메뉴가 저절로 떠 있으면 그건 고장으로 보인다.
const KEY = 'moacon:return-to';
const FRESH_MS = 10 * 60 * 1000;

export function rememberReturnTo(name) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name, at: Date.now() }));
  } catch {
    // 못 적으면 돌아왔을 때 메인이다. 그뿐이다.
  }
}

// 한 번 읽으면 지운다. 남겨두면 다음에 앱을 열 때 또 열린다.
export function takeReturnTo() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    localStorage.removeItem(KEY);
    if (!saved?.name) return null;
    return Date.now() - saved.at < FRESH_MS ? saved.name : null;
  } catch {
    return null;
  }
}

// 앱에서 앱 밖(이라기보다 앱 화면 밖)으로 나가는 링크를 누를 때.
//
// 웹에서는 아무것도 하지 않는다 — 새 탭이 열리고 이 화면은 그대로 남아 있어서, 돌아올
// 자리를 적어둘 이유가 없다.
export function markLeaving(name) {
  if (isNativeApp()) rememberReturnTo(name);
}
