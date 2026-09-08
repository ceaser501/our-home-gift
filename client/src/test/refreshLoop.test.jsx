import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 뒤에서 조용히 다시 읽는 일은 서버에 아무것도 쓰지 않는다.
//
// "목록이 계속 새로 불러오는 것 같다"가 이것이었다. 가족 정보를 다시 읽을 때마다
// '이 가족을 지금 열었다'(touch_family)를 서버에 적었는데, 그 쓰기가 실시간 신호가 되어
// 목록을 다시 읽게 하고, 그 읽기가 다시 쓰기를 부르며 0.3초마다 끝없이 돌았다.
//
//   적기 → 실시간 신호 → 목록 다시 읽기 → 가족 다시 읽기 → 적기 → …
//
// 당겨서 새로고침하면 그 고리에 불이 붙었다. 아무도 아무것도 안 했는데 목록이 계속
// 깜빡이고, 데이터베이스에는 쉼 없이 쓰기가 나갔다.
//
// 적는 것은 여는 순간뿐이어야 한다. 그 값이 뜻하는 것도 원래 그것이다.

const touchFamily = vi.fn(async () => {});

vi.mock('../family', () => ({
  touchFamily: (...a) => touchFamily(...a),
  getMyFamilies: vi.fn(async () => [{ id: 'fam-1', name: '우리집' }]),
  getFamilyMembers: vi.fn(async () => [{ user_id: 'me', display_name: '나' }]),
  listPendingJoinRequests: vi.fn(async () => []),
}));

vi.mock('../consent', () => ({ hasAgreedToCurrent: vi.fn(async () => true) }));

vi.mock('../auth', () => ({
  getSession: async () => ({ user: { id: 'me', email: 'me@x.com' } }),
  onAuthStateChange: () => () => {},
  signOut: async () => {},
}));

vi.mock('../components/LoadingScreen', () => ({ default: () => <div>불러오는 중</div> }));
vi.mock('../components/LoginScreen', () => ({ default: () => <div>로그인 화면</div> }));
vi.mock('../components/ConsentScreen', () => ({ default: () => <div>약관 화면</div> }));
vi.mock('../components/FamilyOnboarding', () => ({ default: () => <div>가족 만들기</div> }));
vi.mock('../components/WelcomeSetupScreen', () => ({ default: () => <div>첫 설정</div> }));
vi.mock('../components/DeleteAccountError', () => ({ default: () => null }));
vi.mock('../components/LoginErrorAlert', () => ({ default: () => null }));

const { default: AuthGate } = await import('../components/AuthGate');
const { useFamily } = await import('../FamilyContext');

// 안쪽에서 refreshFamily를 꺼내 바깥으로 건네준다. App.jsx가 실시간 신호를 받아
// 부르는 그 함수다.
let refreshFamily = null;
function Probe() {
  const ctx = useFamily();
  refreshFamily = ctx.refreshFamily;
  return <div>메인</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // 첫 설정 화면은 이 시험과 상관없다. 본 것으로 적어둔다.
  localStorage.setItem('moacon:welcome-setup:me', '1');
  refreshFamily = null;
});

describe('가족 정보를 뒤에서 다시 읽을 때', () => {
  it('앱을 열 때는 한 번 적는다', async () => {
    render(
      <AuthGate>
        <Probe />
      </AuthGate>
    );
    await screen.findByText('메인', {}, { timeout: 4000 });

    expect(touchFamily).toHaveBeenCalledTimes(1);
    expect(touchFamily).toHaveBeenCalledWith('fam-1');
  });

  it('다시 읽는 것은 서버에 적지 않는다', async () => {
    render(
      <AuthGate>
        <Probe />
      </AuthGate>
    );
    await screen.findByText('메인', {}, { timeout: 4000 });
    expect(refreshFamily).toBeTypeOf('function');

    // 실시간 신호가 잇달아 온 것처럼 몇 번 부른다. 한 번이라도 적으면 고리가 된다.
    await act(async () => {
      await refreshFamily();
      await refreshFamily();
      await refreshFamily();
    });

    expect(touchFamily).toHaveBeenCalledTimes(1);
  });
});
