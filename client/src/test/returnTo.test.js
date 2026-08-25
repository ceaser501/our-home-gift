import { describe, expect, it, beforeEach, vi } from 'vitest';

// 약관을 보러 앱 화면을 떠났다 돌아왔을 때 보던 창으로 되돌리기.
//
// 앱 웹뷰에는 탭이 없어서 target="_blank"가 그 자리에서 이동해버린다. 그러고 뒤로가기를
// 누르면 앱이 처음부터 다시 열려서, 내 메뉴를 열어둔 채 약관을 보러 갔던 사람이 메인으로
// 떨어진다. 그래서 떠나기 전에 돌아올 자리를 적어둔다.

const { rememberReturnTo, takeReturnTo } = await import('../utils/returnTo');

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('돌아올 자리', () => {
  it('적어두면 한 번 돌려준다', () => {
    rememberReturnTo('profile');
    expect(takeReturnTo()).toBe('profile');
  });

  // 남겨두면 다음에 앱을 열 때 또 열린다.
  it('두 번째부터는 없다', () => {
    rememberReturnTo('profile');
    takeReturnTo();
    expect(takeReturnTo()).toBeNull();
  });

  it('적어둔 적이 없으면 없다', () => {
    expect(takeReturnTo()).toBeNull();
  });

  // 사흘 뒤에 앱을 열었더니 내 메뉴가 저절로 떠 있으면 그건 고장으로 보인다.
  it('오래된 표시는 무시한다', () => {
    rememberReturnTo('profile');
    const saved = JSON.parse(localStorage.getItem('moacon:return-to'));
    localStorage.setItem(
      'moacon:return-to',
      JSON.stringify({ ...saved, at: saved.at - 11 * 60 * 1000 })
    );
    expect(takeReturnTo()).toBeNull();
  });

  it('값이 깨져 있어도 앱이 열린다', () => {
    localStorage.setItem('moacon:return-to', '{{{');
    expect(takeReturnTo()).toBeNull();
  });
});
