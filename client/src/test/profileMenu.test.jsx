import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// 내 메뉴에서 지켜야 하는 것 셋.
//
//   로그아웃이 목록 줄이 아니라 버튼일 것 — 열세 번째 줄에 옆줄과 같은 모양으로 있으면
//   끝까지 내려도 눈에 안 걸린다.
//
//   가족 나가기·계정 삭제가 목록 줄이 아닐 것 — 줄이면 스크롤하다 손가락이 스쳐도 열린다.
//
//   켜고 끄는 것들이 스위치일 것 — 값이 글자로만 있으면 눌러야 하는 줄인지 알 수 없다.

const signOut = vi.fn();

vi.mock('../utils/useBackClose', () => ({ default: () => {} }));
vi.mock('../auth', () => ({ deleteAccount: vi.fn() }));
vi.mock('../family', () => ({ leaveFamily: vi.fn(), renameMember: vi.fn() }));
vi.mock('../components/UsageReportSheet', () => ({ default: () => null }));
vi.mock('../components/NoticesSheet', () => ({ default: () => null }));
vi.mock('../components/RenameSheet', () => ({ default: () => null }));
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
vi.mock('../utils/gallery', () => ({
  isGalleryScanSupported: () => true,
  isAutoScanOn: () => false,
  setAutoScanOn: vi.fn(),
  // 아니라고 해둔 사진이 있어야 되살리기 줄이 그려진다.
  countSkipped: () => 3,
  forgetSkipped: vi.fn(),
}));
vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리집' },
    members: [
      { user_id: 'me', display_name: '아들' },
      { user_id: 'other', display_name: '엄마' },
    ],
    user: { id: 'me', email: 'son@example.com' },
    refetchFamily: vi.fn(),
    refreshFamily: vi.fn(),
    signOut: (...a) => signOut(...a),
  }),
}));

const { default: ProfileMenu } = await import('../components/ProfileMenu');

beforeEach(() => {
  vi.clearAllMocks();
});

function row(text) {
  return screen.getByText(text).closest('button');
}

describe('내 메뉴', () => {
  it('로그아웃이 목록 줄이 아니라 버튼이다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    const button = row('로그아웃');
    expect(button).toBeTruthy();
    // 버튼 모양이 곧 "여긴 다르다"는 표시다. 테두리가 그걸 진다.
    expect(button.className).toMatch(/border/);
    button.click();
    expect(signOut).toHaveBeenCalled();
  });

  // 위험한 둘은 이름표와 누를 자리가 갈려 있어야 한다. 이름표를 눌러도 아무 일이 없어야
  // 스크롤하다 스쳐도 안 열린다.
  it('가족 나가기·계정 삭제는 이름표가 눌리지 않는다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    expect(screen.getByText('가족 나가기').closest('button')).toBeNull();
    expect(screen.getByText('계정 삭제').closest('button')).toBeNull();
    // 누를 자리는 따로 있다.
    expect(screen.getByText('나가기')).toBeTruthy();
    expect(screen.getByText('삭제')).toBeTruthy();
  });

  // 두 단어로는 무엇이 다른지가 전달되지 않는다.
  it('무엇이 없어지는지를 문장으로 적는다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    expect(screen.getByText('우리집에서만 빠져요')).toBeTruthy();
    expect(screen.getByText('모든 가족과 기프티콘이 지워져요')).toBeTruthy();
    expect(screen.queryByText('이 가족만')).toBeNull();
    expect(screen.queryByText('계정까지')).toBeNull();
  });

  it('켜고 끄는 줄은 모두 스위치다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    for (const label of ['다크 모드', '푸시 알림 받기', '기프티콘 자동 찾기']) {
      expect(row(label).getAttribute('role')).toBe('switch');
      expect(row(label).getAttribute('aria-checked')).toBeTruthy();
    }
  });

  // 이름이 카드에 크게 적혀 있는데 아래 줄에서 또 보여주고 있었다.
  it('내 정보 구역이 없고 이름 바꾸기는 카드 안에 있다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    expect(screen.queryByText('내 정보')).toBeNull();
    expect(screen.getByText('이름 바꾸기')).toBeTruthy();
    // 구역은 셋뿐이다.
    expect(screen.getByText('설정')).toBeTruthy();
    expect(screen.getByText('기록과 소식')).toBeTruthy();
    expect(screen.getByText('약관과 정보')).toBeTruthy();
  });

  // 앱 안에서 열리는지 브라우저로 나가는지를 누르기 전에 알려준다.
  it('약관 세 줄만 바깥으로 나가는 링크다', () => {
    render(<ProfileMenu onClose={() => {}} />);

    for (const label of ['개인정보처리방침', '이용약관', '오픈소스 및 기술 정보']) {
      expect(screen.getByText(label).closest('a')?.target).toBe('_blank');
    }
    for (const label of ['사용 내역', '공지사항']) {
      expect(screen.getByText(label).closest('a')).toBeNull();
    }
  });
});
