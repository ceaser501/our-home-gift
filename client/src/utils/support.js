import { isNativeApp } from './browser';

// 문의를 받는 곳.
//
// 여기 한 줄만 고치면 앱 안의 문의 자리가 같이 바뀐다. 공개 페이지(약관·개인정보처리방침·
// 계정 삭제·소개)에도 같은 주소가 적혀 있는데, 그쪽은 정적 HTML이라 손으로 맞춘다.
export const SUPPORT_EMAIL = 'moacon.support@gmail.com';

// 메일 앱을 연다. 열었으면 'opened', 못 열어서 주소만 복사했으면 'copied'.
//
// ── 왜 두 갈래인가 ──────────────────────────────────────────────────────────
// mailto:는 메일 앱이 잡혀 있는 폰에서만 열린다. 안 잡혀 있으면 눌러도 아무 일이
// 일어나지 않는데, 그게 화면에서 제일 나쁜 것이다 — 불편을 말하러 온 사람이 그
// 버튼에서 또 막힌다.
//
// 그래서 못 열면 주소를 복사해준다. 부르는 쪽이 무슨 일이 있었는지 화면에 적는다.
export async function openSupportMail({ subject = '모아콘 문의' } = {}) {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  try {
    if (isNativeApp()) {
      // 웹뷰 안에서 location.href로 mailto를 열면 안드로이드가 막는 경우가 있다.
      // 네이티브에 넘겨서 폰이 알아서 고르게 한다.
      const { App } = await import('@capacitor/app');
      await App.openUrl({ url });
    } else {
      window.location.href = url;
    }
    return 'opened';
  } catch {
    // 아래 복사로 물러선다.
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      return 'copied';
    }
  } catch {
    // 복사도 막힌 자리다.
  }

  return 'failed';
}
