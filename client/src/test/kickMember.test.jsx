import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// 내보내기는 되돌릴 수 없다. 그래서 누가 볼 수 있는지, 누구에게 붙는지가 곧 안전장치다.
//
// 대표는 "가장 먼저 들어온 사람"이고 목록은 들어온 순서로 온다. 화면과 서버가 같은
// 규칙으로 정해야 하는데(supabase/kick-member.sql), 둘이 갈리면 버튼은 보이는데 눌러도
// 안 되는 일이 생긴다. 화면 쪽 규칙을 여기서 붙들어둔다.

const kickMember = vi.fn();
const refreshFamily = vi.fn();

vi.mock('../family', () => ({
  kickMember: (...a) => kickMember(...a),
  approveJoinRequest: vi.fn(),
  rejectJoinRequest: vi.fn(),
  renameFamily: vi.fn(),
  renameMember: vi.fn(),
}));

const MEMBERS = [
  { user_id: 'leader', display_name: '아빠', created_at: '2026-01-01T00:00:00Z', tag_color: 0 },
  { user_id: 'me', display_name: '아들', created_at: '2026-01-02T00:00:00Z', tag_color: 1 },
  { user_id: 'guest', display_name: '낯선사람', created_at: '2026-01-03T00:00:00Z', tag_color: 2 },
];

let viewer = 'leader';

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족', invite_code: 'ABC123' },
    members: MEMBERS,
    user: { id: viewer },
    joinRequests: [],
    refreshFamily: (...a) => refreshFamily(...a),
  }),
}));

const { default: FamilyMembersSheet } = await import('../components/FamilyMembersSheet');

beforeEach(() => {
  vi.clearAllMocks();
  kickMember.mockResolvedValue(undefined);
});

describe('구성원 내보내기', () => {
  it('대표에게는 남의 줄에만 버튼이 붙는다', () => {
    viewer = 'leader';
    render(<FamilyMembersSheet onClose={() => {}} />);

    expect(screen.getByRole('button', { name: '아들 내보내기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '낯선사람 내보내기' })).toBeTruthy();
    // 자기 줄에는 안 붙는다. 스스로 빠지는 것은 '가족 나가기'가 한다.
    expect(screen.queryByRole('button', { name: '아빠 내보내기' })).toBeNull();
  });

  it('대표가 아니면 아무 줄에도 안 붙는다', () => {
    viewer = 'me';
    render(<FamilyMembersSheet onClose={() => {}} />);

    expect(screen.queryByRole('button', { name: /내보내기/ })).toBeNull();
    // 내 줄의 연필은 그대로 있다.
    expect(screen.getByRole('button', { name: '내 이름 바꾸기' })).toBeTruthy();
  });

  // 한 번 누르면 그 사람의 기프티콘이 목록에서 사라진다. 물어보지 않고 지나가면 안 된다.
  it('바로 내보내지 않고 한 번 여쭤본다', async () => {
    viewer = 'leader';
    render(<FamilyMembersSheet onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '낯선사람 내보내기' }));
    expect(kickMember).not.toHaveBeenCalled();
    expect(screen.getByText('이 가족에서 내보낼까요?')).toBeTruthy();
    // 무엇이 사라지는지 미리 적어둔다. 누르고 나서 알게 되면 그때는 늦다.
    expect(screen.getByText(/기프티콘이 목록에서 사라져요/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    await waitFor(() => expect(kickMember).toHaveBeenCalledWith('fam-1', 'guest'));
    await waitFor(() => expect(refreshFamily).toHaveBeenCalled());
  });

  it('막히면 그 자리에서 말한다', async () => {
    viewer = 'leader';
    kickMember.mockRejectedValue(new Error('대표만 내보낼 수 있어요.'));
    render(<FamilyMembersSheet onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '낯선사람 내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));

    expect(await screen.findByText('대표만 내보낼 수 있어요.')).toBeTruthy();
  });
});
