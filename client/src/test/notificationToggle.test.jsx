import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 푸시 알림 받기 줄 — 앱(웹뷰)에서.
//
// 앱 웹뷰에는 웹푸시가 없다. 이 줄을 그걸로 감쌌다가 앱에서 통째로 사라진 적이 있고
// (v0.0.80), 그다음엔 "크롬으로 여세요"만 안내했다. 이제 앱은 파이어베이스(FCM)로
// 직접 켜고 끈다. 여기서는 앱에서도 켜기가 실제로 동작하는지를 지킨다.

const enableNativePush = vi.fn();
const disableNativePush = vi.fn();
const isNativePushEnabled = vi.fn();
const subscribeToPush = vi.fn();

vi.mock('../push', () => ({
  isPushSupported: () => false, // 앱 웹뷰와 같은 조건
  isPushEnabled: vi.fn(),
  subscribeToPush: (...a) => subscribeToPush(...a),
  unsubscribeFromPush: vi.fn(),
}));
vi.mock('../nativePush', () => ({
  isNativePushSupported: () => true,
  isNativePushEnabled: (...a) => isNativePushEnabled(...a),
  enableNativePush: (...a) => enableNativePush(...a),
  disableNativePush: (...a) => disableNativePush(...a),
}));
vi.mock('../FamilyContext', () => ({
  useFamily: () => ({ user: { id: 'me' }, family: { id: 'fam-1' } }),
}));

const { default: NotificationToggle } = await import('../components/NotificationToggle');

function row() {
  return screen.getByText('푸시 알림 받기').closest('button');
}

beforeEach(() => {
  vi.clearAllMocks();
  enableNativePush.mockResolvedValue('tok-1');
  disableNativePush.mockResolvedValue();
});

describe('앱에서의 푸시 알림 받기', () => {
  it('계정에 토큰이 있으면 켜짐으로 보인다', async () => {
    isNativePushEnabled.mockResolvedValue(true);

    await act(async () => render(<NotificationToggle asRow />));

    expect(screen.getByText('켜짐')).toBeTruthy();
  });

  // 앱에서 켜지는지가 이 화면의 핵심이다. 웹푸시 쪽으로 새면 앱에서는 아무 일도 안 난다.
  it('꺼진 상태에서 누르면 앱 알림을 켠다', async () => {
    isNativePushEnabled.mockResolvedValue(false);

    await act(async () => render(<NotificationToggle asRow />));
    await act(async () => row().click());

    expect(enableNativePush).toHaveBeenCalledWith({ familyId: 'fam-1' });
    expect(subscribeToPush).not.toHaveBeenCalled();
    expect(screen.getByText('켜짐')).toBeTruthy();
  });

  it('켜진 상태에서 누르면 끈다', async () => {
    isNativePushEnabled.mockResolvedValue(true);

    await act(async () => render(<NotificationToggle asRow />));
    await act(async () => row().click());

    expect(disableNativePush).toHaveBeenCalledWith('me');
    expect(screen.getByText('꺼짐')).toBeTruthy();
  });

  // 권한을 거절하면 알림 하나로 끝나야 한다 — 켜짐으로 바뀌면 안 된다.
  it('권한을 거절하면 켜짐으로 바뀌지 않는다', async () => {
    isNativePushEnabled.mockResolvedValue(false);
    enableNativePush.mockRejectedValue(new Error('알림 권한을 허용해주셔야 켤 수 있어요.'));

    await act(async () => render(<NotificationToggle asRow />));
    await act(async () => row().click());

    expect(screen.getByText('꺼짐')).toBeTruthy();
    expect(screen.getByText('알림 설정에 실패했어요')).toBeTruthy();
  });
});
