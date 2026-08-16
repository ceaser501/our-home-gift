import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 인사는 한 번이면 된다. 두 번째부터는 인사가 아니라 잔소리다.
// 그래서 여기서 보는 것은 문구가 아니라 "언제 뜨고 언제 안 뜨는가"뿐이다.

let member = { user_id: 'me', display_name: '아들', created_at: '' };

vi.mock('../FamilyContext', () => ({
  useFamily: () => ({
    family: { id: 'fam-1', name: '우리가족' },
    members: [member],
    user: { id: 'me' },
  }),
}));

const { default: WelcomeBanner } = await import('../components/WelcomeBanner');

const HELLO = /모아콘에 오신 걸 환영해요/;

function joinedAgo(ms) {
  return new Date(Date.now() - ms).toISOString();
}

beforeEach(() => {
  localStorage.clear();
  member = { user_id: 'me', display_name: '아들', created_at: joinedAgo(60 * 1000) };
});

describe('WelcomeBanner', () => {
  it('가입하고 처음 들어오면 인사한다', () => {
    render(<WelcomeBanner />);
    expect(screen.getByText(HELLO)).toBeTruthy();
  });

  // 닫지 않고 앱을 끈 사람에게 내일 또 뜨면, 닫기 버튼이 있으나 마나가 된다.
  // 그래서 닫는 것과 상관없이 "띄운 순간" 봤다고 적는다.
  it('앱을 껐다 켜면 다시 안 뜬다', () => {
    const { unmount } = render(<WelcomeBanner />);
    screen.getByText(HELLO);

    unmount();
    render(<WelcomeBanner />);
    expect(screen.queryByText(HELLO)).toBeNull();
  });

  it('X를 누르면 그 자리에서 사라진다', () => {
    render(<WelcomeBanner />);
    act(() => screen.getByRole('button', { name: '환영 인사 닫기' }).click());
    expect(screen.queryByText(HELLO)).toBeNull();
  });

  // 오래 쓰던 사람이 폰을 바꿔 새로 깔았을 때. 기기에는 본 기록이 없지만 처음이 아니다.
  it('오래된 사람에게는 인사하지 않는다', () => {
    member = { user_id: 'me', display_name: '아들', created_at: joinedAgo(30 * 24 * 60 * 60 * 1000) };
    render(<WelcomeBanner />);
    expect(screen.queryByText(HELLO)).toBeNull();
  });

  // 초대는 받은 날 수락하고 앱은 주말에 여는 일이 흔하다. 그때 인사를 못 하면
  // 이 띠가 있을 이유가 없다.
  it('가입하고 며칠 지나 처음 열어도 인사한다', () => {
    member = { user_id: 'me', display_name: '아들', created_at: joinedAgo(3 * 24 * 60 * 60 * 1000) };
    render(<WelcomeBanner />);
    expect(screen.getByText(HELLO)).toBeTruthy();
  });

  // 주변 매장 안내가 이 띠를 보고 비켜선다. 안 알려주면 두 줄이 겹쳐서 목록이 밀린다.
  it('자리를 쓰고 있다고 바깥에 알린다', () => {
    const shown = vi.fn();
    render(<WelcomeBanner onShownChange={shown} />);
    expect(shown).toHaveBeenCalledWith(true);

    act(() => screen.getByRole('button', { name: '환영 인사 닫기' }).click());
    expect(shown).toHaveBeenLastCalledWith(false);
  });
});
