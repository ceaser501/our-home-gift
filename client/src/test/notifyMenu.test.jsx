import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 내 메뉴의 알림 테스트 줄.
//
// v0.0.80에서 isPushSupported()로 감쌌다가 앱에서 통째로 사라진 적이 있다(앱 웹뷰에는
// PushManager가 없다). 이제 줄은 항상 그려지고, 켜짐/꺼짐은 위의 켜기 줄이 계정
// 기준으로 알려준다. 여기서는 그 결합을 그려서 지킨다.

const sendTestNotification = vi.fn();
vi.mock('../api', () => ({
  sendTestNotification: (...a) => sendTestNotification(...a),
  hasMyPushSubscriptions: () => Promise.resolve(false),
}));
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

describe('알림 테스트 줄', () => {
  // 줄 자체는 어떤 환경에서도 있어야 한다. 감췄다가 앱에서 사라진 적이 있다.
  it('항상 그려진다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    expect(testRow()).toBeTruthy();
  });

  it('알림이 꺼져 있으면 눌리지 않고 켜는 길을 알려준다', () => {
    toggleReports = false;

    render(<ProfileMenu onClose={() => {}} />);

    expect(testRow().disabled).toBe(true);
    expect(screen.getByText('위에서 알림을 켜야 보낼 수 있어요')).toBeTruthy();
  });

  it('알림이 켜져 있으면 눌러서 보낸다', async () => {
    toggleReports = true;

    render(<ProfileMenu onClose={() => {}} />);

    const row = testRow();
    expect(row.disabled).toBe(false);
    await act(async () => row.click());
    expect(sendTestNotification).toHaveBeenCalled();
  });
});
