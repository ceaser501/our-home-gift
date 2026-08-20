import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 내 메뉴의 알림 두 줄을 실제로 그려본다.
//
// 앱 웹뷰에는 PushManager가 없다. 그래서 '폰으로 알림 받기'(NotificationToggle)는
// 앱에서 원래부터 안 그려지는데, 그걸 모르고 '알림 테스트'까지 isPushSupported()로
// 감쌌다가 앱에서 두 줄이 통째로 사라졌다 — v0.0.79가 그렇게 나갔다.
// 화면을 안 그려보고 내보낸 것이라, 여기서 두 환경을 다 그려서 지킨다.

const sendTestNotification = vi.fn();
vi.mock('../api', () => ({ sendTestNotification: (...a) => sendTestNotification(...a) }));
vi.mock('../auth', () => ({ deleteAccount: vi.fn() }));
vi.mock('../family', () => ({ leaveFamily: vi.fn(), renameMember: vi.fn() }));
vi.mock('../components/UsageReportSheet', () => ({ default: () => null }));
vi.mock('../components/NoticesSheet', () => ({ default: () => null }));
vi.mock('../components/RenameSheet', () => ({ default: () => null }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));

// 켜기 줄은 흉내로 갈아끼우고, 켜짐/꺼짐 신호(onChange)만 시험마다 정해준다.
let toggleReports = null;
vi.mock('../components/NotificationToggle', () => ({
  default: ({ onChange }) => {
    if (toggleReports !== null) onChange?.(toggleReports);
    return null;
  },
}));

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족' },
    members: [{ user_id: 'me', display_name: '태수' }],
    user: { id: 'me' },
    refetchFamily: vi.fn(),
    refreshFamily: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const { default: ProfileMenu } = await import('../components/ProfileMenu');

function testRow() {
  return screen.getByText('알림 테스트').closest('button');
}

beforeEach(() => {
  vi.clearAllMocks();
  toggleReports = null;
  sendTestNotification.mockResolvedValue({ sent: 1, gifticon: '아이스 아메리카노 T' });
});

afterEach(() => {
  delete window.PushManager;
  delete navigator.serviceWorker;
});

describe('알림 테스트 줄', () => {
  // jsdom에는 PushManager가 없다 — 앱 웹뷰와 같은 조건이다.
  it('앱(웹푸시 없음)에서도 그려지고 눌린다', async () => {
    render(<ProfileMenu onClose={() => {}} />);

    const row = testRow();
    expect(row).toBeTruthy();
    expect(row.disabled).toBe(false);
    // 켜는 줄이 없는 환경에서 "위에서 켜라"고 하면 없는 줄을 찾게 된다.
    expect(screen.queryByText('위에서 알림을 켜야 보낼 수 있어요')).toBe(null);

    await act(async () => row.click());
    expect(sendTestNotification).toHaveBeenCalled();
  });

  it('웹에서 알림이 꺼져 있으면 눌리지 않고 켜는 길을 알려준다', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    window.PushManager = function PushManager() {};
    toggleReports = false;

    render(<ProfileMenu onClose={() => {}} />);

    expect(testRow().disabled).toBe(true);
    expect(screen.getByText('위에서 알림을 켜야 보낼 수 있어요')).toBeTruthy();
  });

  it('웹에서 알림이 켜져 있으면 눌린다', async () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
    window.PushManager = function PushManager() {};
    toggleReports = true;

    render(<ProfileMenu onClose={() => {}} />);

    const row = testRow();
    expect(row.disabled).toBe(false);
    await act(async () => row.click());
    expect(sendTestNotification).toHaveBeenCalled();
  });
});
