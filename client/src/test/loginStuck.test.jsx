import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';

// 로그인 도중에 뒤로가기를 누르면 '연결 중…'에 갇혔다.
//
// 카카오·네이버 로그인 화면은 앱 위에 덮어서 연다(커스텀 탭). 거기서 뒤로가기를 누르면
// 성공도 실패도 아니게 돌아온다 — 예외가 안 나므로 catch가 안 돌고, '연결 중…'을 끄는
// 손이 아무 데도 없었다. 버튼은 계속 눌리지 않고, 앱을 껐다 켜는 것 말고는 길이 없었다.
//
// 이 테스트가 보는 것은 문구가 아니라 **버튼이 다시 눌리는가**다. 갇혔다는 것은
// 사용자에게 '더 못 누른다'는 뜻이라서다.

const signInWithKakao = vi.fn();
const signInWithNaver = vi.fn();

// 커스텀 탭이 닫혔을 때 오는 신호. 앱에서만 오는 것이라 손으로 만들어 쏜다.
let browserFinished = null;
const removeListener = vi.fn();

vi.mock('../auth', () => ({
  lastLoginMethod: () => null,
  sendMagicLink: vi.fn(),
  signInWithApple: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithKakao: (...a) => signInWithKakao(...a),
  signInWithNaver: (...a) => signInWithNaver(...a),
}));

// 앱에서 도는 것으로 둔다. 같은 파일의 나머지는 원래 것을 그대로 남긴다 — 통째로
// 갈아끼우면 InstallPrompt가 없는 함수를 부른다.
//
// isStandalone까지 덮는 것은 그 안이 window.matchMedia를 쓰는데 시험 환경에는 그게
// 없어서다. 이 시험이 보는 것은 로그인 버튼이라 그쪽은 안 부르면 그만이다.
vi.mock('../utils/browser', async (importOriginal) => ({
  ...(await importOriginal()),
  isIosApp: () => false,
  isNativeApp: () => true,
  isStandalone: () => false,
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    addListener: async (name, fn) => {
      if (name === 'browserFinished') browserFinished = fn;
      return { remove: removeListener };
    },
  },
}));

const { default: LoginScreen } = await import('../components/LoginScreen');

beforeEach(() => {
  vi.clearAllMocks();
  browserFinished = null;
  // 로그인 창을 여는 것까지는 성공한다. 그 뒤로 아무 일도 안 일어나는 것이 이 상황이다.
  signInWithKakao.mockResolvedValue(undefined);
  signInWithNaver.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// 눌리면 글자가 '연결 중…'으로 바뀌므로 이름 대신 표식으로 잡는다.
let view;
const social = (key) => view.container.querySelector(`[data-social="${key}"]`);
const kakaoButton = () => social('kakao');
const naverButton = () => social('naver');

// 로그인 창이 뜰 때까지. addListener가 async라 한 판 더 돌려야 붙는다.
async function tapKakao() {
  await act(async () => {
    fireEvent.click(kakaoButton());
  });
  await act(async () => {});
}

describe('로그인 도중에 뒤로가기', () => {
  it('누르면 연결 중이 되고 버튼이 막힌다', async () => {
    view = render(<LoginScreen />);
    await tapKakao();

    expect(signInWithKakao).toHaveBeenCalledOnce();
    expect(kakaoButton().textContent).toContain('연결 중…');
    expect(kakaoButton().disabled).toBe(true);
  });

  it('로그인 창을 닫고 돌아오면 다시 누를 수 있다', async () => {
    view = render(<LoginScreen />);
    await tapKakao();
    expect(kakaoButton().disabled).toBe(true);

    // 뒤로가기로 커스텀 탭이 닫혔다.
    expect(browserFinished).toBeTypeOf('function');
    await act(async () => {
      browserFinished();
    });

    expect(kakaoButton().textContent).toContain('카카오로 로그인');
    expect(kakaoButton().disabled).toBe(false);
  });

  it('돌아온 뒤 다시 로그인이 된다', async () => {
    view = render(<LoginScreen />);
    await tapKakao();
    await act(async () => {
      browserFinished();
    });

    await act(async () => {
      fireEvent.click(kakaoButton());
    });
    expect(signInWithKakao).toHaveBeenCalledTimes(2);
  });

  // 뒤로가기로 되살아난 페이지에서도 풀려야 한다. 웹은 커스텀 탭이 아니라 페이지를
  // 통째로 넘겼다가 돌아오는 길이라 browserFinished가 오지 않는다.
  it('웹에서 되살아난 페이지도 풀린다', async () => {
    view = render(<LoginScreen />);
    await tapKakao();

    await act(async () => {
      const back = new Event('pageshow');
      back.persisted = true;
      window.dispatchEvent(back);
    });

    expect(kakaoButton().disabled).toBe(false);
  });

  it('새로 그려진 페이지는 건드리지 않는다', async () => {
    view = render(<LoginScreen />);
    await tapKakao();

    await act(async () => {
      const fresh = new Event('pageshow');
      fresh.persisted = false;
      window.dispatchEvent(fresh);
    });

    // 여긴 아직 로그인 창이 떠 있는 중일 수 있다. 섣불리 풀면 안 된다.
    expect(kakaoButton().disabled).toBe(true);
  });

  it('아무 신호도 안 오면 안전망이 푼다', async () => {
    vi.useFakeTimers();
    view = render(<LoginScreen />);

    await act(async () => {
      fireEvent.click(kakaoButton());
    });
    await act(async () => {});
    expect(kakaoButton().disabled).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(90_000);
    });
    expect(kakaoButton().disabled).toBe(false);
  });
});

describe('한 번에 한 곳만', () => {
  it('카카오를 여는 동안 네이버도 못 누른다', async () => {
    view = render(<LoginScreen />);
    await tapKakao();

    expect(naverButton().disabled).toBe(true);
    fireEvent.click(naverButton());
    expect(signInWithNaver).not.toHaveBeenCalled();

    // 갇혀 있던 시절에는 여기서 둘 다 '연결 중…'이 됐다.
    expect(naverButton().textContent).toContain('네이버로 로그인');
  });
});
