import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 폰으로 알림 받기 줄 — 앱(웹뷰)에서의 반쪽 동작.
//
// 앱 웹뷰에는 웹푸시가 없어서 이 줄을 통째로 감췄었는데, 그러면 앱에서 알림을 끄지도
// 못하고 켜는 길도 못 찾는다(v0.0.80). 이제 앱에서는: 상태를 계정 기준으로 보여주고,
// 끄기는 되고, 켜기는 크롬으로 안내한다.

const hasMyPushSubscriptions = vi.fn();
const unsubscribeFromPush = vi.fn();

vi.mock('../push', () => ({
  isPushSupported: () => false, // 앱 웹뷰와 같은 조건
  isPushEnabled: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: (...a) => unsubscribeFromPush(...a),
}));
vi.mock('../api', () => ({ hasMyPushSubscriptions: (...a) => hasMyPushSubscriptions(...a) }));
vi.mock('../FamilyContext', () => ({
  useFamily: () => ({ user: { id: 'me' }, family: { id: 'fam-1' } }),
}));

const { default: NotificationToggle } = await import('../components/NotificationToggle');

function row() {
  return screen.getByText('폰으로 알림 받기').closest('button');
}

beforeEach(() => {
  vi.clearAllMocks();
  unsubscribeFromPush.mockResolvedValue();
});

describe('앱에서의 폰으로 알림 받기', () => {
  it('계정에 구독이 있으면 켜짐으로 보인다', async () => {
    hasMyPushSubscriptions.mockResolvedValue(true);

    await act(async () => render(<NotificationToggle asRow />));

    expect(screen.getByText('켜짐')).toBeTruthy();
  });

  it('꺼진 상태에서 누르면 크롬으로 켜는 길을 안내한다', async () => {
    hasMyPushSubscriptions.mockResolvedValue(false);

    await act(async () => render(<NotificationToggle asRow />));
    await act(async () => row().click());

    expect(screen.getByText('알림은 크롬에서 켜요')).toBeTruthy();
    expect(unsubscribeFromPush).not.toHaveBeenCalled();
  });

  it('켜진 상태에서 누르면 끈다 — 끄기는 앱에서도 된다', async () => {
    hasMyPushSubscriptions.mockResolvedValue(true);

    await act(async () => render(<NotificationToggle asRow />));
    await act(async () => row().click());

    expect(unsubscribeFromPush).toHaveBeenCalledWith('me');
    expect(screen.getByText('꺼짐')).toBeTruthy();
  });
});
