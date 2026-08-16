import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 실제 내 메뉴를 그대로 띄워놓고 계정 삭제를 끝까지 눌러본다.
//
// 지금까지 이 자리를 세 번 짚었고 세 번 다 틀렸다. 짚은 곳을 따로 떼어 흉내 낸 판에서만
// 확인했기 때문이다. 흉내가 아니라 화면 그대로를 눌러야 한다. 브라우저 개발자도구에서
// delete-account 요청이 아예 안 나가는 것이 확인됐으니, 여기서 봐야 할 것은 딱 하나다 —
// 탈퇴하기를 눌렀을 때 서버를 부르는 함수까지 실제로 도달하는가.

const deleteAccount = vi.fn();
const sendTestNotification = vi.fn();
const leaveFamily = vi.fn();
const renameMember = vi.fn();

vi.mock('../auth', () => ({ deleteAccount: (...a) => deleteAccount(...a) }));
vi.mock('../api', () => ({ sendTestNotification: (...a) => sendTestNotification(...a) }));
vi.mock('../family', () => ({
  leaveFamily: (...a) => leaveFamily(...a),
  renameMember: (...a) => renameMember(...a),
}));
vi.mock('../components/UsageReportSheet', () => ({ default: () => null }));
vi.mock('../components/NoticesSheet', () => ({ default: () => null }));
vi.mock('../components/RenameSheet', () => ({ default: () => null }));
vi.mock('../components/NotificationToggle', () => ({ default: () => null }));
vi.mock('../components/ThemeToggle', () => ({ default: () => null }));

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족' },
    members: [
      { user_id: 'me', display_name: '태수' },
      { user_id: 'other', display_name: '엄마' },
    ],
    user: { id: 'me' },
    refetchFamily: vi.fn(),
    refreshFamily: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const { default: ProfileMenu } = await import('../components/ProfileMenu');

function click(text) {
  return act(async () => {
    const found = screen.getAllByText(text).at(-1);
    found.closest('button')?.click() ?? found.click();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  deleteAccount.mockResolvedValue({ ok: true });
});

describe('계정 삭제를 끝까지 누른다', () => {
  it('탈퇴하기까지 눌리고 서버를 부른다', async () => {
    render(<ProfileMenu onClose={() => {}} />);

    await click('계정 삭제');
    expect(screen.queryByText('계정을 삭제할까요?')).toBeTruthy();

    await click('계속');
    expect(screen.queryByText('정말 탈퇴할까요?')).toBeTruthy();

    await click('탈퇴하기');
    expect(deleteAccount).toHaveBeenCalled();
  });

  // 서버가 거절하면 그 이유가 화면에 서야 한다. 이 자리가 지금까지 한 번도 안 보였다.
  it('서버가 거절하면 이유가 화면에 남는다', async () => {
    deleteAccount.mockRejectedValue(new Error('storage.objects.owner 3건'));

    render(<ProfileMenu onClose={() => {}} />);
    await click('계정 삭제');
    await click('계속');
    await click('탈퇴하기');

    expect(screen.queryByText(/storage.objects.owner 3건/)).toBeTruthy();
  });
});
