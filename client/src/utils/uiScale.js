import { isNativeApp } from './browser';

// 앱 화면 크기.
//
// 글자만이 아니라 여백·버튼·아이콘까지 한꺼번에 움직인다. 폰의 「화면 확대/축소」가
// 하는 일과 같다. 처음에는 글자만 키우고 줄였는데(웹뷰의 text zoom) 그것으로는
// 반쪽이었다 — 글자는 줄어드는데 카드 여백과 버튼 높이는 그대로라, 화면의 덩치는
// 그대로인 채 글자만 헐거워졌다.
//
// 거는 자리는 index.css의 --ui-scale 하나이고, html의 zoom이 그 값을 받는다.
//
// 정하는 것은 폰 설정 하나뿐이다. 앱 안에 「글자 크기」 설정을 두었다가 걷어냈다 —
// 폰에 이미 있는 설정을 앱 안에 또 두면 두 곳이 따로 놀고, 60대에게는 찾아 들어가
// 골라야 하는 자리가 하나 더 생긴다. 글자를 키워 쓰는 사람은 이미 폰에서 키워뒀다.
//
// 안드로이드는 Configuration.fontScale을, 아이폰은 Dynamic Type 단계를 준다. 둘 다
// 1.0이 기본이고, @capacitor/text-zoom의 getPreferred가 같은 꼴로 돌려준다.
// (그 플러그인의 set은 글자만 키우는 것이라 쓰지 않는다. 읽기만 쓴다.)

const CACHE_KEY = 'moacon:ui-scale';

// 마지막으로 화면에 건 값. 내 메뉴의 버전 줄이 이걸 함께 적는다.
//
// 이 값이 안 보이면 크기 이야기를 할 수가 없다. 폰 설정 눈금이 몇 번째인지, 그게
// 배수로 얼마인지, 하한에 걸렸는지가 전부 안 보이는 채로 "크다/작다"만 오간다.
// 실제로 폰 설정을 옮겨가며 보는 동안 앱은 85%였는데 기본 설정 사용자는 98%를 보고
// 있었고, 그 13% 차이를 아무도 몰랐다. 문의를 받을 때도 같은 값이 필요하다.
let lastScale = 1;

export function currentUiScale() {
  return lastScale;
}

// 폰 글자를 한 눈금 키운 정도는 따라가지 않는다.
//
// 갤럭시 눈금은 아홉 칸이고 세 번째가 기본(1.0)이다. 네 번째가 1.08인데, 이건 눈이
// 어두워 키운 것이라기보다 취향에 가깝다. 그것까지 따라가면 화면이 106%가 되어 목록에
// 담기는 카드가 줄어든다.
//
// 그래서 1.1까지는 무시하고, 그 위로만 따라간다. 다섯 번째(1.3)부터가 진짜 "안 보여서
// 키운" 자리다.
const FOLLOW_FROM = 1.1;

// 하한은 플랫폼 기준 그 자체다. 폰 글자를 키운 사람만 위로 올라가고, 아래로는 안 간다.
//
// 한동안 아래로도 따라갔다(하한 85%). 폰 글자를 작게 해둔 사람에게 이 앱만 혼자 커
// 보인다는 이유였는데, 실제로 해보니 반대가 됐다 — 폰을 한 눈금 줄여둔 사람의 화면이
// 88%가 되어 다른 앱들보다 작아졌다. 작게 쓰는 사람은 글자가 작아도 읽히는 사람이라
// 굳이 앱까지 줄여줄 이유가 없고, 키운 사람은 그게 필요해서 키운 것이라 따라가야 한다.
//
// 이제 기본 이하로 쓰는 사람은 모두 같은 화면을 본다.
export const MIN_UI_SCALE = 0.9;
export const MAX_UI_SCALE = 1.15;

// 안드로이드만 기준을 2% 내린다.
//
// 같은 CSS px가 두 폰에서 물리적으로 다른 크기로 그려진다. 갤럭시 S25는 기본 설정에서
// 1인치에 138px이 들어가고 아이폰 15/16은 154px이 들어간다 — 같은 15.5px 글자가
// 갤럭시에서 11% 크게 보인다는 뜻이다.
//
// 그래서 갤럭시에서는 폰에 깔린 다른 앱들보다 모아콘이 커 보였다. 카톡·토스와 나란히
// 놓고 대보고 안 것이다. "안드로이드가 원래 크고 다른 앱도 다 그렇다"는 이론이 실물과
// 달랐다.
//
// 7%(0.93)에서 4%(0.96)를 거쳐 여기까지 왔다. 계산으로는 11% 차이를 메우는 0.93이
// 맞는 값이었는데 폰에 깔고 보니 작았다. 숫자가 맞아도 눈이 아니라면 눈을 따른다.
//
// 이 값을 눈으로 재려면 폰 글자 크기가 기본이어야 한다. 그걸 몰라서 오래 헤맸다 —
// 견주던 폰이 「작게」로 맞춰져 있어서 앱은 88%로 그려지고 있었는데, 기본 설정을 쓰는
// 사람은 98%를 보고 있었다. 그래서 버전 줄에 지금 값을 적어둔다.
//
// 상한은 그대로 115%다. 곱한 뒤에 자르기 때문에, 눈이 어두워 폰 글자를 다섯 눈금 이상
// 키운 사람은 예전과 똑같이 115%를 받는다 — 어차피 상한에 걸리는 자리라 이 조정으로
// 잃는 것이 없다. 줄어드는 사람은 기본 설정으로 쓰는 사람뿐이고, 그게 겨냥한 자리다.
const PLATFORM_BASE = { android: 0.98, ios: 1 };

function platformBase() {
  return PLATFORM_BASE[window.Capacitor?.getPlatform?.()] ?? 1;
}

function clamp(value) {
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, value));
}

// 폰 설정의 글자 크기. 못 읽으면 1(기본)로 본다.
async function systemScale() {
  if (!isNativeApp()) return 1;
  try {
    const { TextZoom } = await import('@capacitor/text-zoom');
    const { value } = await TextZoom.getPreferred();
    return Number.isFinite(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

// 지금 있어야 할 크기를 계산해서 화면에 건다.
export async function applyUiScale() {
  // 곱한 뒤에 자른다. 순서를 바꾸면 상한이 115에서 107로 함께 내려가고, 폰 글자를
  // 키워둔 사람이 이유 없이 손해를 본다.
  // 무시 구간만큼 빼고 따라간다. 빼기 때문에 그 위로는 예전과 같은 속도로 커진다.
  const system = await systemScale();
  const scale = clamp(platformBase() * Math.max(1, system - (FOLLOW_FROM - 1)));
  lastScale = scale;
  document.documentElement.style.setProperty('--ui-scale', String(scale));

  // 다음에 앱을 열 때 index.html이 그려지기 전에 쓸 수 있게 적어둔다. 폰에 물어보는
  // 일이라 시간이 걸려서, 이게 없으면 100%로 한 번 그렸다가 줄어들며 화면이 튄다.
  try {
    window.localStorage.setItem(CACHE_KEY, String(scale));
  } catch {
    // 사생활 보호 모드 등. 이번 실행에는 그대로 적용된다.
  }
  return scale;
}

// 폰 설정에서 글자 크기를 바꾸고 앱으로 돌아오는 길.
//
// 아이폰도 안드로이드도 이때 웹뷰를 다시 그리지 않는다. 우리가 다시 재지 않으면 앱을
// 껐다 켜야 반영된다 — 설정을 바꾸고 돌아왔는데 그대로면 대개 "안 되네" 하고 만다.
export function watchSystemUiScale() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    applyUiScale().catch(() => {});
  });
}
