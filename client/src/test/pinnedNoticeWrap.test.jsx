import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 고정 공지 제목 줄이 끊길 수 있는 자리를 갖고 있는가.
//
// 제목 끝 글자와 '오늘 15시까지'가 딱 붙어 있으면 브라우저는 둘을 한 낱말로 본다. 그
// 뒷조각이 nowrap이라 낱말 전체가 통째로만 움직이고, 결국 제목 마지막 마디까지 다음 줄로
// 끌려 내려간다 — 옆에 자리가 남아 있는데도 그렇다. 실제로 그랬다.
//
// JSX는 줄바꿈만 있는 사이 공백을 지운다. 그래서 이 띄어쓰기는 눈에 안 보이지만 있어야
// 하는 것이고, 없어지면 화면에서만 티가 난다. 여기서 지킨다.

vi.mock('../utils/useBackClose', () => ({ default: () => {} }));
vi.mock('../FamilyContext', () => ({
  useFamily: () => ({ user: { id: 'me' }, family: { id: 'fam-1' } }),
}));
vi.mock('../push', () => ({
  isPushSupported: () => true,
  isPushEnabled: () => Promise.resolve(false),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));
vi.mock('../nativePush', () => ({
  isNativePushSupported: () => false,
  isNativePushEnabled: vi.fn(),
  enableNativePush: vi.fn(),
  disableNativePush: vi.fn(),
}));

const { default: ActivitySheet } = await import('../components/ActivitySheet');

describe('고정 공지 제목과 남은 시간 사이', () => {
  it('띄어쓰기가 있어서 줄을 끊을 수 있다', () => {
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    render(
      <ActivitySheet
        activities={[]}
        pinnedNotices={[{ id: 'n1', title: '모아콘에 오신 걸 환영해요', body: '반가워요', ends_at: soon }]}
        lastReadAt={null}
        onClose={vi.fn()}
      />
    );

    const remaining = screen.getByText(/까지$/);
    const line = remaining.closest('p');
    // 제목 마지막 글자와 남은 시간이 붙어 있으면 안 된다.
    expect(line.textContent).toMatch(/환영해요\s내일|환영해요\s오늘/);
  });

  // 남은 시간이 없는 공지에는 붙일 것이 없다. 제목 뒤에 빈 공백만 남지 않아야 한다.
  it('남은 시간이 없으면 제목만 남는다', () => {
    render(
      <ActivitySheet
        activities={[]}
        pinnedNotices={[{ id: 'n1', title: '모아콘에 오신 걸 환영해요', body: '반가워요' }]}
        lastReadAt={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('공지').closest('p').textContent).toBe('공지모아콘에 오신 걸 환영해요');
  });
});
