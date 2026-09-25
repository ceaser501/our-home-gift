import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

// 초대 링크를 눌러 온 사람이 보는 화면.
//
// 처음 쓰는 사람과 이미 다른 가족이 있는 사람이 **다른 화면**을 보고 있었다. 뒤쪽은
// 가족 바꾸기 창의 '초대 코드로 참여' 양식이었는데, 어느 가족이 불렀는지도 안 보이고
// 코드를 다시 적는 칸이 열려 있었다 — 2026-09-25에 실기에서 나왔다.
//
// 이 시험이 지키는 것은 셋이다.
//   - 두 사람이 같은 화면을 본다 (가족 이름, 코드는 확인만, 이름 한 칸)
//   - 다른 것은 맨 아래 빠져나가는 길뿐이다
//   - 이미 그 가족인 사람에게는 화면을 안 띄운다

const peekFamilyByCode = vi.fn();
const requestJoinFamily = vi.fn();
const forgetInviteCode = vi.fn();
const switchFamily = vi.fn();
const refreshFamily = vi.fn();
let families = [];

vi.mock('../family', () => ({
  peekFamilyByCode: (...a) => peekFamilyByCode(...a),
  requestJoinFamily: (...a) => requestJoinFamily(...a),
}));
vi.mock('../utils/inviteLink', () => ({ forgetInviteCode: (...a) => forgetInviteCode(...a) }));
vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    user: { id: 'me', email: 'me@test.com' },
    family: { id: 'home', name: '우리집', invite_code: 'HOME01' },
    families,
    switchFamily: (...a) => switchFamily(...a),
    refreshFamily: (...a) => refreshFamily(...a),
  }),
}));

const { default: InviteJoinScreen, ExistingUserInvite } = await import('../components/InviteJoinScreen');

beforeEach(() => {
  vi.clearAllMocks();
  families = [{ id: 'home', name: '우리집', invite_code: 'HOME01' }];
  peekFamilyByCode.mockResolvedValue('외갓집');
  requestJoinFamily.mockResolvedValue({ status: 'pending', family_id: 'grand', family_name: '외갓집' });
});

async function settle() {
  await act(async () => {});
}

describe('초대 화면', () => {
  it('어느 가족이 불렀는지 보여준다', async () => {
    render(<InviteJoinScreen code="GRAND1" onSubmitted={() => {}} />);
    await settle();
    expect(screen.getByRole('heading').textContent).toContain("'외갓집' 가족에");
  });

  it('⚠️ 코드는 확인만 — 다시 적는 칸이 없다', async () => {
    render(<InviteJoinScreen code="GRAND1" onSubmitted={() => {}} />);
    await settle();
    // 적는 칸은 이름 하나뿐이다. 코드 칸이 열려 있던 것이 이번에 고친 것이다.
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByText('GRAND1')).toBeTruthy();
  });

  it('참여 신청하면 코드를 놓고 결과를 넘긴다', async () => {
    const onSubmitted = vi.fn();
    render(<InviteJoinScreen code="GRAND1" onSubmitted={onSubmitted} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '큰딸' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '참여 신청하기' }));
    });
    expect(requestJoinFamily).toHaveBeenCalledWith('GRAND1', '큰딸');
    expect(forgetInviteCode).toHaveBeenCalled();
    expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
  });

  it('빠져나가는 길은 부르는 쪽이 정한다', async () => {
    const onEscape = vi.fn();
    render(<InviteJoinScreen code="GRAND1" onSubmitted={() => {}} escapeLabel="아무 말" onEscape={onEscape} />);
    fireEvent.click(screen.getByRole('button', { name: '아무 말' }));
    expect(onEscape).toHaveBeenCalled();
  });
});

describe('이미 가족이 있는 사람', () => {
  it('같은 초대 화면을 보고, 빠져나가는 길은 「나중에 할게요」다', async () => {
    render(<ExistingUserInvite code="GRAND1" onClose={() => {}} />);
    await settle();
    expect(screen.getByRole('heading').textContent).toContain('초대받았어요');
    // 로그아웃이 아니다. 잘못 온 초대를 거절하려다 로그아웃되면 안 된다.
    expect(screen.queryByText('다른 계정으로 로그인')).toBeNull();
    expect(screen.getByRole('button', { name: '나중에 할게요' })).toBeTruthy();
  });

  it('「나중에 할게요」는 코드를 놓고 닫는다', async () => {
    const onClose = vi.fn();
    render(<ExistingUserInvite code="GRAND1" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: '나중에 할게요' }));
    expect(forgetInviteCode).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('신청하면 승인 기다리는 화면으로 바뀐다', async () => {
    render(<ExistingUserInvite code="GRAND1" onClose={() => {}} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '큰딸' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '참여 신청하기' }));
    });
    expect(screen.getByText("'외갓집'에 참여를 신청했어요")).toBeTruthy();
    expect(refreshFamily).toHaveBeenCalled();
  });

  it('⚠️ 이미 그 가족이면 화면을 안 띄우고 그 가족으로 옮긴다', async () => {
    // 서버는 이때 이름만 바꾸고 'joined'로 끝낸다. 화면을 띄우면 '초대받았어요'가
    // 거짓말이 되고, 적은 이름으로 원래 이름이 덮인다.
    families = [
      { id: 'home', name: '우리집', invite_code: 'HOME01' },
      { id: 'grand', name: '외갓집', invite_code: 'GRAND1' },
    ];
    const onClose = vi.fn();
    const { container } = render(<ExistingUserInvite code="GRAND1" onClose={onClose} />);
    await settle();

    expect(container.textContent).toBe('');
    expect(switchFamily).toHaveBeenCalledWith('grand');
    expect(forgetInviteCode).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(requestJoinFamily).not.toHaveBeenCalled();
  });

  it('지금 보고 있는 가족의 링크면 옮길 것도 없다', async () => {
    const onClose = vi.fn();
    render(<ExistingUserInvite code="HOME01" onClose={onClose} />);
    await settle();
    expect(switchFamily).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
