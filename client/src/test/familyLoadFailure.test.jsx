import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// 가족을 못 읽은 것과 가족이 없는 것은 다르다.
//
// 둘을 같이 치던 시절에는, 앱을 켠 직후 네트워크가 아직 안 붙은 순간에 읽기가 실패하면
// 쓰고 있던 사람에게 가족 만들기 창이 떴다. 거기서 가족을 하나 더 만들면 기프티콘이
// 두 집으로 갈리고, 되돌리기 어렵다.
//
// "가끔 앱을 열면 참여코드 넣는 창이 뜬다"가 이것이었다.

const getMyFamilies = vi.fn();

vi.mock('../family', () => ({
  getMyFamilies: (...a) => getMyFamilies(...a),
  getFamilyMembers: vi.fn(async () => [{ user_id: 'me', display_name: '나' }]),
  listPendingJoinRequests: vi.fn(async () => []),
}));

vi.mock('../consent', () => ({ hasAgreedToCurrent: vi.fn(async () => true) }));

vi.mock('../auth', () => ({
  getSession: async () => ({ user: { id: 'me', email: 'me@x.com' } }),
  // 실제 auth.js는 정리 함수를 그대로 돌려준다(useEffect가 그걸 반환값으로 쓴다).
  onAuthStateChange: () => () => {},
  signOut: async () => {},
}));

vi.mock('../components/LoadingScreen', () => ({ default: () => <div>불러오는 중</div> }));
vi.mock('../components/LoginScreen', () => ({ default: () => <div>로그인 화면</div> }));
vi.mock('../components/ConsentScreen', () => ({ default: () => <div>약관 화면</div> }));
vi.mock('../components/FamilyOnboarding', () => ({ default: () => <div>가족 만들기</div> }));
vi.mock('../components/DeleteAccountError', () => ({ default: () => null }));

const { default: AuthGate } = await import('../components/AuthGate');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('가족을 못 읽었을 때', () => {
  it('가족 만들기로 넘기지 않는다', async () => {
    getMyFamilies.mockRejectedValue(new Error('네트워크가 아직 안 붙었다'));

    render(
      <AuthGate>
        <div>메인</div>
      </AuthGate>
    );

    expect(await screen.findByText('연결이 고르지 않아요', {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText('가족 만들기')).toBeNull();
  });

  // 한 번 실패했다고 바로 포기하지 않는다. 앱을 켠 직후의 그 순간은 대개 짧다.
  it('몇 번 다시 해본다', async () => {
    getMyFamilies
      .mockRejectedValueOnce(new Error('아직'))
      .mockResolvedValue([{ id: 'fam-1', name: '우리집' }]);

    render(
      <AuthGate>
        <div>메인</div>
      </AuthGate>
    );

    expect(await screen.findByText('메인', {}, { timeout: 4000 })).toBeTruthy();
    expect(getMyFamilies.mock.calls.length).toBeGreaterThan(1);
  });

  // 진짜로 가족이 없는 사람에게는 그대로 가족 만들기가 떠야 한다. 이걸 막으면
  // 처음 온 사람이 아무것도 못 한다.
  it('정말 없으면 가족 만들기가 뜬다', async () => {
    getMyFamilies.mockResolvedValue([]);

    render(
      <AuthGate>
        <div>메인</div>
      </AuthGate>
    );

    expect(await screen.findByText('가족 만들기', {}, { timeout: 4000 })).toBeTruthy();
  });
});
