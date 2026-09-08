import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 첫 설정 화면은 계정마다 한 번씩 뜬다.
//
// 탈퇴하고 새 계정으로 들어왔는데 안 뜨는 일이 있었다. 폰에 적어두는 표시는 계정마다
// 따로였는데(welcomeSetup.js), 화면 안에 '봤다'를 참·거짓으로 하나 더 들고 있었던 것이
// 원인이다. 탈퇴하거나 로그아웃해도 로그인 관문 자체는 그대로 서 있어서 그 값이 참인
// 채로 남았고, 다음 계정에서 그 하나가 계정별 표시를 덮었다.
//
// 앱을 껐다 켜면 떴다 — 그때는 관문이 새로 서니까. 그래서 더 헷갈렸다.

let authCallback = null;
const getSession = vi.fn(async () => ({ user: { id: 'user-a', email: 'a@x.com' } }));

vi.mock('../auth', () => ({
  getSession: (...a) => getSession(...a),
  onAuthStateChange: (cb) => {
    authCallback = cb;
    return () => {};
  },
  signOut: async () => {},
}));

vi.mock('../family', () => ({
  touchFamily: vi.fn(async () => {}),
  getMyFamilies: vi.fn(async () => [{ id: 'fam-1', name: '우리집' }]),
  getFamilyMembers: vi.fn(async () => [{ user_id: 'user-a', display_name: '나' }]),
  listPendingJoinRequests: vi.fn(async () => []),
  listMyJoinRequests: vi.fn(async () => []),
}));

vi.mock('../realtime', () => ({ subscribeToMyJoinRequests: () => () => {} }));

vi.mock('../consent', () => ({ hasAgreedToCurrent: vi.fn(async () => true) }));

vi.mock('../components/LoadingScreen', () => ({ default: () => <div>불러오는 중</div> }));
vi.mock('../components/LoginScreen', () => ({ default: () => <div>로그인 화면</div> }));
vi.mock('../components/ConsentScreen', () => ({ default: () => <div>약관 화면</div> }));
vi.mock('../components/FamilyOnboarding', () => ({ default: () => <div>가족 만들기</div> }));
vi.mock('../components/DeleteAccountError', () => ({ default: () => null }));
vi.mock('../components/LoginErrorAlert', () => ({ default: () => null }));
vi.mock('../components/WelcomeSetupScreen', () => ({
  default: ({ onDone }) => (
    <button type="button" onClick={onDone}>
      첫 설정
    </button>
  ),
}));

const { default: AuthGate } = await import('../components/AuthGate');

function main() {
  return (
    <AuthGate>
      <div>메인</div>
    </AuthGate>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  authCallback = null;
  // 이 화면은 앱에서만 뜬다.
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  getSession.mockResolvedValue({ user: { id: 'user-a', email: 'a@x.com' } });
});

afterEach(() => {
  delete window.Capacitor;
});

describe('첫 설정 화면', () => {
  it('처음 들어온 계정에는 뜬다', async () => {
    render(main());
    expect(await screen.findByText('첫 설정', {}, { timeout: 4000 })).toBeTruthy();
  });

  it('시작하고 나면 그 계정에는 다시 안 뜬다', async () => {
    render(main());
    const start = await screen.findByText('첫 설정', {}, { timeout: 4000 });

    await act(async () => start.click());

    expect(await screen.findByText('메인', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText('첫 설정')).toBeNull();
  });

  it('탈퇴하고 새 계정으로 들어오면 다시 뜬다', async () => {
    render(main());
    const start = await screen.findByText('첫 설정', {}, { timeout: 4000 });
    await act(async () => start.click());
    await screen.findByText('메인', {}, { timeout: 4000 });

    // 탈퇴 — 로그인 화면으로 돌아가지만 관문 자체는 그대로 서 있다.
    await act(async () => authCallback(null));
    expect(await screen.findByText('로그인 화면', {}, { timeout: 4000 })).toBeTruthy();

    // 새 계정으로 다시 들어온다. 이 폰에서는 처음 보는 사람이다.
    await act(async () => authCallback({ user: { id: 'user-b', email: 'b@x.com' } }));

    expect(await screen.findByText('첫 설정', {}, { timeout: 4000 })).toBeTruthy();
  });
});
