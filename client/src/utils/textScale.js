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

export const MIN_TEXT_SCALE = 0.9;
export const MAX_TEXT_SCALE = 1.15;

// 설정 화면에 내놓는 눈금. 폰 설정에서 쓰는 말과 맞췄다.
export const TEXT_SCALE_OPTIONS = [
  { value: 0.9, label: '작게' },
  { value: 1, label: '보통' },
  { value: 1.15, label: '크게' },
];

// 마지막으로 실제 적용한 값. 설정 화면이 지금 어디에 불이 들어와야 하는지를 이걸로 안다
// (폰 설정을 따라가는 중이면 고른 값이 없어서, 저장된 값만으로는 알 수 없다).
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
export async function applyTextScale() {
  const chosen = readTextScale();
  const scale = clamp(chosen ?? (await systemScale()));
  effective = scale;

  if (isNativeApp()) {
    try {
      const { TextZoom } = await import('@capacitor/text-zoom');
      await TextZoom.set({ value: scale });
      return scale;
    } catch {
      // 이 플러그인이 없는 옛 빌드다. 아래 CSS 쪽이 받아준다(아이폰에서는 그것만으로도 된다).
    }
  }

  // 웹(사파리·크롬)이 가는 길. 앱에서는 위 플러그인이 이미 처리했으므로 여기까지 오지
  // 않는다 — 둘 다 걸면 크기가 두 번 곱해진다.
  document.documentElement.style.webkitTextSizeAdjust = `${Math.round(scale * 100)}%`;
  return scale;
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
