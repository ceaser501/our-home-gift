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

export const MIN_UI_SCALE = 0.85;
export const MAX_UI_SCALE = 1.15;

// 안드로이드만 기준을 7% 내린다.
//
// 같은 CSS px가 두 폰에서 물리적으로 다른 크기로 그려진다. 갤럭시 S25는 기본 설정에서
// 1인치에 138px이 들어가고 아이폰 15/16은 154px이 들어간다 — 같은 15.5px 글자가
// 갤럭시에서 11% 크게 보인다는 뜻이다.
//
// 그래서 갤럭시에서는 폰에 깔린 다른 앱들보다 모아콘이 커 보였다. 카톡·토스와 나란히
// 놓고 대보고 안 것이다. "안드로이드가 원래 크고 다른 앱도 다 그렇다"는 이론이 실물과
// 달랐다.
//
// 상한은 그대로 115%다. 곱한 뒤에 자르기 때문에, 눈이 어두워 폰 글자를 다섯 눈금 이상
// 키운 사람은 예전과 똑같이 115%를 받는다 — 어차피 상한에 걸리는 자리라 이 조정으로
// 잃는 것이 없다. 줄어드는 사람은 기본 설정으로 쓰는 사람뿐이고, 그게 겨냥한 자리다.
const PLATFORM_BASE = { android: 0.93, ios: 1 };

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
  const scale = clamp(platformBase() * (await systemScale()));
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
