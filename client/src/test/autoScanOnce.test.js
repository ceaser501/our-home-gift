import { describe, expect, it, beforeEach, vi } from 'vitest';

// 자동 훑기는 앱을 연 그 한 번만 돈다.
//
// 앱 웹뷰에는 탭이 없어서 약관 같은 바깥 링크가 화면을 통째로 갈아끼우고 나간다.
// 뒤로가기로 돌아오면 앱이 처음부터 다시 열리는데, 그게 "앱을 연 것"으로 세어져서
// 약관 한 번 보고 올 때마다 사진 수백 장을 다시 읽었다.

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
  registerPlugin: () => ({}),
}));

const { autoScanDue, markAutoScanRan, setAutoScanOn } = await import('../utils/gallery');

// 훑기는 안드로이드 앱에서만 있다. 브라우저에는 폴더를 볼 방법이 없다.
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
});

describe('자동 훑기 한 번', () => {
  it('켜뒀으면 앱을 열 때 돈다', () => {
    setAutoScanOn(true);
    expect(autoScanDue()).toBe(true);
  });

  it('한 번 돌고 나면 다시 열어도 안 돈다', () => {
    setAutoScanOn(true);
    markAutoScanRan();
    expect(autoScanDue()).toBe(false);
  });

  it('꺼뒀으면 처음부터 안 돈다', () => {
    setAutoScanOn(false);
    expect(autoScanDue()).toBe(false);
  });

  // 웹뷰가 죽으면 sessionStorage가 비워진다 — 그게 진짜 '앱을 다시 연 것'이다.
  it('앱을 다시 열면 또 돈다', () => {
    setAutoScanOn(true);
    markAutoScanRan();
    sessionStorage.clear();
    expect(autoScanDue()).toBe(true);
  });

  // 읽기만 해야 한다. 여기서 적으면 StrictMode가 두 번 부를 때 두 번째가 false가 되고,
  // 켜둔 사람에게 자동 훑기가 영영 안 뜬다.
  it('물어보는 것만으로는 적히지 않는다', () => {
    setAutoScanOn(true);
    expect(autoScanDue()).toBe(true);
    expect(autoScanDue()).toBe(true);
  });
});
