// 웹에 올라가 있는 화면들의 주소.
//
// 앱은 화면을 자기 안에 담아 열기 때문에(안드로이드 https://localhost, 아이폰
// capacitor://localhost) 그 주소로는 바깥에 아무것도 없다. 앱 밖으로 나가는 길 —
// 초대 링크, 약관 페이지, 카톡 공유용 다리 페이지 — 은 늘 이 주소를 써야 한다.
//
// 한곳에 둔 이유는 예전에 두 군데에 따로 적혀 있었기 때문이다. 주소가 바뀌는 날
// 한쪽만 고치면 나머지가 조용히 죽는다.
export const WEB_ORIGIN = 'https://ceaser501.github.io/our-home-gift/';

/** 앱 안에서 열 수 있는 절대 주소로 바꾼다. 웹에서는 상대 주소 그대로 두면 된다. */
export function webUrl(path) {
  return new URL(String(path).replace(/^\.?\//, ''), WEB_ORIGIN).toString();
}
