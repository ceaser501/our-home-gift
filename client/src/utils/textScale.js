import { isNativeApp } from './browser';

// 앱 글자 크기.
//
// 폰 설정을 따라가는 것이 기본이다. 안드로이드는 그 일을 네이티브가 해왔는데
// (MainActivity.java의 applySystemFontScale) 아이폰에는 그런 자리가 없었다. 웹뷰가
// 시스템 글자 크기(Dynamic Type)를 CSS px에 반영하지 않아서, 폰에서 글자를 아무리
// 키워도 앱만 그대로였다. 눈이 어두워 폰 글자를 키워둔 어른이 이 앱에서만 작은 글씨를
// 보고 있었다는 뜻이다.
//
// 그래서 두 가지를 함께 둔다.
//   - 아무것도 안 고른 사람: 폰 설정을 따라간다. 양쪽 다.
//   - 설정에서 직접 고른 사람: 그 값이 이긴다. 폰 설정을 어디서 바꾸는지 모르는
//     경우가 더 많고, 폰 전체는 그대로 두고 이 앱만 크게 보고 싶은 경우도 있다.
//
// 폭은 90~115%다. 위를 115에서 끊는 이유는 예전에 130까지 따라가게 했다가 목록 카드의
// 상품명·기한·버튼이 한 줄에서 어긋났기 때문이다 — 읽기 편하자고 키운 것이 도리어 못
// 읽는 화면을 만든다. 글자만 커지고 칸은 그대로라 생기는 일이라, 칸을 함께 키우지 않는
// 한 이 선을 넘을 수 없다.
//
// 아래를 90에서 여는 건 새로 열어준 쪽이다. 예전에는 100 아래로 안 내려가서, 폰 글자를
// 작게 해둔 사람에게는 이 앱만 혼자 커 보였다.

const KEY = 'moacon:text-scale';

export const MIN_TEXT_SCALE = 0.85;
export const MAX_TEXT_SCALE = 1.15;

// 안드로이드만 기준을 7% 내린다.
//
// 같은 CSS px가 두 폰에서 물리적으로 다른 크기로 그려진다. 갤럭시 S25는 기본에서
// 1인치에 138px이 들어가고 아이폰 15/16은 154px이 들어간다 — 같은 15.5px 글자가
// 갤럭시에서 11% 크게 보인다는 뜻이다.
//
// 그래서 갤럭시에서는 폰에 깔린 다른 앱들보다 모아콘이 커 보였다. 직접 대보고 안 것이다.
// 이론상으로는 "안드로이드가 원래 큰 것이고 다른 앱도 다 그렇다"가 맞지만, 실제로
// 나란히 놓고 보면 우리가 더 컸다.
//
// 상한은 그대로 115%다. 눈이 어두워 폰 글자를 키워둔 사람은 어차피 상한에 걸리므로
// 이 조정으로 잃는 것이 없다. 곱한 뒤에 자르기 때문에, 폰 글자를 다섯 눈금 이상
// 키운 사람은 예전과 똑같이 115%를 받는다.
//
// 줄어드는 사람은 기본 설정으로 쓰는 사람뿐이고, 그게 이 조정이 겨냥한 자리다.
//
// ⚠ 이건 글자만 줄인다. 카드 여백·버튼 높이는 그대로라서, 화면 전체의 덩치는 안 준다.
//    그쪽까지 손보려면 목록 카드의 짜임을 다시 잡아야 한다.
const PLATFORM_BASE = { android: 0.93, ios: 1 };

function platformBase() {
  const platform = window.Capacitor?.getPlatform?.();
  return PLATFORM_BASE[platform] ?? 1;
}

// 설정 화면에 내놓는 눈금. 폰 설정에서 쓰는 말과 맞췄다.
export const TEXT_SCALE_OPTIONS = [
  { value: 0.9, label: '작게' },
  { value: 1, label: '보통' },
  { value: 1.15, label: '크게' },
];

// 마지막으로 정해진 눈금(작게·보통·크게). 설정 화면이 지금 어디에 불이 들어와야
// 하는지를 이걸로 안다 — 폰 설정을 따라가는 중이면 고른 값이 없어서, 저장된 값만으로는
// 알 수 없다. 실제로 화면에 걸리는 값은 여기에 플랫폼 기준을 곱한 것이다.
let effective = 1;

function clamp(value) {
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, value));
}

// 직접 고른 값. 고른 적이 없으면 null — 그때는 폰 설정을 따른다.
export function readTextScale() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? clamp(value) : null;
  } catch {
    // 사파리 사생활 보호 모드 등. 이번 실행 동안만 적용되고 다음에 다시 폰 설정을 따른다.
    return null;
  }
}

export function getEffectiveTextScale() {
  return effective;
}

// 폰 설정의 글자 크기. 못 읽으면 1(기본)로 본다.
//
// @capacitor/text-zoom이 양쪽 폰에서 같은 값을 준다. 아이폰은 Dynamic Type 단계를,
// 안드로이드는 fontScale을 1.0 기준의 배수로 돌려준다.
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

// 지금 있어야 할 크기를 계산해서 화면에 건다. 값이 바뀔 만한 때마다 다시 부르면 된다.
//
// 돌려주는 값은 '사용자가 고른 눈금'(작게·보통·크게)이고, 실제로 거는 값은 거기에
// 플랫폼 기준을 곱한 것이다. 둘을 나눠 둔 이유는 설정 화면이 어느 버튼에 불을 켤지를
// 앞엣것으로 정해야 하기 때문이다 — 갤럭시에서 '보통'을 고르면 실제로는 93%가 걸리는데,
// 그 93을 그대로 들고 가면 어느 버튼과도 안 맞아서 불이 다 꺼진다.
export async function applyTextScale() {
  const chosen = readTextScale();
  const choice = clamp(chosen ?? (await systemScale()));
  effective = choice;

  // 곱한 뒤에 자른다. 순서를 바꾸면 상한이 115에서 107로 함께 내려가고, 폰 글자를
  // 키워둔 사람이 이유 없이 손해를 본다.
  const scale = clamp(platformBase() * choice);

  if (isNativeApp()) {
    try {
      const { TextZoom } = await import('@capacitor/text-zoom');
      await TextZoom.set({ value: scale });
      return choice;
    } catch {
      // 이 플러그인이 없는 옛 빌드다. 아래 CSS 쪽이 받아준다(아이폰에서는 그것만으로도 된다).
    }
  }

  // 웹(사파리·크롬)이 가는 길. 앱에서는 위 플러그인이 이미 처리했으므로 여기까지 오지
  // 않는다 — 둘 다 걸면 크기가 두 번 곱해진다.
  document.documentElement.style.webkitTextSizeAdjust = `${Math.round(scale * 100)}%`;
  return choice;
}

// 설정에서 골랐을 때. null을 주면 고른 값을 지우고 다시 폰 설정을 따라간다.
export async function saveTextScale(value) {
  try {
    if (value == null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, String(clamp(value)));
  } catch {
    // 적어두지 못해도 이번 실행에는 적용된다.
  }
  return applyTextScale();
}

// 폰 설정에서 글자 크기를 바꾸고 앱으로 돌아오는 길.
//
// 아이폰도 안드로이드도 이때 웹뷰를 다시 그리지 않는다. 우리가 다시 재지 않으면 앱을
// 껐다 켜야 반영된다 — 설정을 바꾸고 돌아왔는데 그대로면 대개 "안 되네" 하고 만다.
export function watchSystemTextSize() {
  document.addEventListener('visibilitychange', () => {
    // 직접 고른 사람은 폰 설정과 상관이 없다.
    if (document.hidden || readTextScale() !== null) return;
    applyTextScale().catch(() => {});
  });
}
