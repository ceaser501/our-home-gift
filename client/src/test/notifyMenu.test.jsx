import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 내 메뉴의 알림 줄.
//
// v0.0.80에서 isPushSupported()로 감쌌다가 앱에서 통째로 사라진 적이 있다(앱 웹뷰에는
// PushManager가 없다). 그 자리를 여기서 지킨다 — 켜는 줄은 언제나 그려져야 한다.
//
// 알림 테스트 줄은 접었다. 앱 알림(FCM)이 붙어서 켜면 실제로 오고, 확인용 버튼이
// 있을 자리가 아니다. 다시 살아나면 여기서 걸린다.

vi.mock('../auth', () => ({ deleteAccount: vi.fn() }));
vi.mock('../family', () => ({ leaveFamily: vi.fn(), renameMember: vi.fn() }));
vi.mock('../components/UsageReportSheet', () => ({ default: () => null }));
vi.mock('../components/NoticesSheet', () => ({ default: () => null }));
vi.mock('../components/RenameSheet', () => ({ default: () => null }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));
vi.mock('../components/NotificationToggle', () => ({
  default: () => <div>푸시 알림 받기</div>,
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

describe('내 메뉴의 알림', () => {
  it('켜는 줄은 항상 그려진다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    expect(screen.getByText('푸시 알림 받기')).toBeTruthy();
  });

  it('알림 테스트 줄은 없다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    expect(screen.queryByText('알림 테스트')).toBeNull();
  });
});
