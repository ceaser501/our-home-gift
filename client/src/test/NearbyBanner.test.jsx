import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

// 주변 매장 띠. 이 앱에서 가장 힘이 센 자리라 두 가지를 지켜야 한다 —
// 걸어가면 다시 찾을 것, 닫으면 그날은 조용할 것.

const searchNearbyStores = vi.fn();
let appStateHandler = null;

vi.mock('../api', () => ({
  searchNearbyStores: (...args) => searchNearbyStores(...args),
}));

vi.mock('../utils/browser', () => ({ isNativeApp: () => true }));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (_name, fn) => {
      appStateHandler = fn;
      return Promise.resolve({ remove: () => {} });
    },
  },
}));

// 위치는 늘 잡힌다고 둔다. 여기서 볼 것은 "언제 다시 찾는가"이지 위치를 어떻게 얻는가가
// 아니다.
const getFreshPosition = vi.fn();
const readCachedPosition = vi.fn();
const hasSavedPosition = vi.fn();

vi.mock('../utils/geolocation', () => ({
  getFreshPosition: (...a) => getFreshPosition(...a),
  readCachedPosition: (...a) => readCachedPosition(...a),
  hasSavedPosition: (...a) => hasSavedPosition(...a),
  saveCachedPosition: () => {},
  distanceBetween: () => 0,
}));

const { default: NearbyBanner } = await import('../components/NearbyBanner');

const GIFTICONS = [
  { id: '1', brand: '스타벅스', status: 'active', expires_at: '2026-12-31' },
  { id: '2', brand: '스타벅스', status: 'active', expires_at: '2027-01-31' },
];

beforeEach(() => {
  vi.clearAllMocks();
  appStateHandler = null;
  localStorage.clear();
  sessionStorage.clear();
  // 안드로이드 웹뷰를 흉내낸다. 앱 권한이 있어도 여기서는 'prompt'가 나온다 —
  // 이 띠가 위치를 아예 안 잡던 원인이 그것이었다.
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: async () => ({ state: 'prompt' }) },
  });
  // 매장 찾기를 한 번 써서 위치를 적어둔 사람. 곧 권한을 준 사람이다.
  hasSavedPosition.mockReturnValue(true);
  searchNearbyStores.mockResolvedValue([{ name: '스타벅스 서울숲점', distance: 120 }]);
  getFreshPosition.mockResolvedValue({ lat: 37.5, lng: 127.0 });
  readCachedPosition.mockReturnValue({ lat: 37.5, lng: 127.0 });
});

describe('NearbyBanner', () => {
  it('앱을 열면 주변을 찾아 띄운다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
  });

  // 이게 이 기능의 핵심이다. 사람들은 앱을 잘 안 끈다 — 홈을 누르고 주머니에 넣는다.
  // 그러고 걸어가서 앱을 다시 봤을 때 아까 그 내용이 그대로면, 정작 이 기능이 필요한
  // 순간에 아무 일도 안 일어나는 것이다.
  it('앱이 다시 앞으로 오면 한 번 더 찾는다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 });

    const before = searchNearbyStores.mock.calls.length;
    // 캐시가 가로채지 않도록 비운다. 실제로는 10분이 지났거나 300m를 움직인 상황이다.
    sessionStorage.clear();
    searchNearbyStores.mockResolvedValue([{ name: '스타벅스 성수점', distance: 80 }]);

    await act(async () => {
      await appStateHandler({ isActive: true });
    });

    await waitFor(() => expect(searchNearbyStores.mock.calls.length).toBeGreaterThan(before), {
      timeout: 3000,
    });
    expect(await screen.findByText(/스타벅스 성수점/, {}, { timeout: 3000 })).toBeTruthy();
  });

  it('뒤로 물러갈 때는 찾지 않는다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 });

    const before = searchNearbyStores.mock.calls.length;
    sessionStorage.clear();

    await act(async () => {
      await appStateHandler({ isActive: false });
    });

    expect(searchNearbyStores.mock.calls.length).toBe(before);
  });

  it('닫으면 그날은 다시 안 뜬다', async () => {
    const { unmount } = render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 });

    act(() => screen.getByRole('button', { name: '주변 매장 안내 닫기' }).click());
    expect(screen.queryByText(/스타벅스 서울숲점/)).toBeNull();

    // 앱을 껐다 켠 셈이다. 예전에는 세션 단위라 여기서 다시 떴다.
    unmount();
    sessionStorage.clear();
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText(/스타벅스 서울숲점/)).toBeNull();
  });

  it('다음 날이 되면 다시 뜬다', async () => {
    localStorage.setItem('nearby-banner-dismissed-on', '2020-01-01');

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
  });
});

// 지하에서는 위치가 안 잡힌다. 그때 아무 말 없이 비워두면 "이 기능이 고장 났나" 하게 되고,
// 지하는 자주 간다. 다만 아무 때나 하는 말은 아니다 — 권한을 안 준 것은 장소 탓이 아니고,
// 쓸 기프티콘이 없는 사람에게 "못 찾았다"는 아무 뜻도 없다.
describe('위치를 못 잡았을 때', () => {
  const CANT = /지금은 위치를 확인할 수 없어요/;

  beforeEach(() => {
    getFreshPosition.mockRejectedValue({ code: 2 });
    readCachedPosition.mockReturnValue(null);
  });

  it('왜 아무것도 안 뜨는지 알려준다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    expect(await screen.findByText(CANT, {}, { timeout: 3000 })).toBeTruthy();
  });

  // 닫으면 그날 하루 안 뜨는 규칙에 걸린다. 지하에서 한 번 닫았다고 밖에 나온 뒤
  // 진짜 안내까지 못 받으면 손해가 훨씬 크다.
  it('닫는 버튼은 없다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(CANT, {}, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: '주변 매장 안내 닫기' })).toBeNull();
  });

  // 이 앱은 일부러 위치 권한을 조르지 않는다. 여기서 그 이야기를 꺼내면 결국 조르는 것이 된다.
  it('권한을 거둔 것은 장소 탓이 아니라 조용히 넘어간다', async () => {
    getFreshPosition.mockRejectedValue({ code: 1 });

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText(CANT)).toBeNull();
  });

  it('쓸 기프티콘이 없으면 이 말도 하지 않는다', async () => {
    render(<NearbyBanner gifticons={[{ id: '9', brand: '스타벅스', status: 'used' }]} onPick={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText(CANT)).toBeNull();
  });

  // 위치는 잡혔는데 근처에 쓸 매장이 없는 경우. 이때 "위치를 확인할 수 없어요"가 남아
  // 있으면 거짓말이 된다 — 확인은 됐고 근처에 없었을 뿐이다. 매장 안내는 원래 조용하지만
  // 이 말은 조용하지 않아서, 안 걷으면 계속 남는다.
  it('위치가 잡혔으면 근처에 매장이 없어도 그 말은 걷는다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(CANT, {}, { timeout: 3000 });

    getFreshPosition.mockResolvedValue({ lat: 37.5, lng: 127.0 });
    searchNearbyStores.mockResolvedValue([]);
    sessionStorage.clear();
    await act(async () => {
      await appStateHandler({ isActive: true });
    });

    await waitFor(() => expect(screen.queryByText(CANT)).toBeNull(), { timeout: 3000 });
  });

  // 지하에서 이 말이 뜬 채로 마지막 기프티콘을 써버리면, 찾아줄 것이 없는데 "못 찾았다"만
  // 남는다. 목록이 바뀌는 건 이 말을 띄운 뒤에도 일어난다.
  it('쓸 기프티콘이 없어지면 그 말도 걷는다', async () => {
    const { rerender } = render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(CANT, {}, { timeout: 3000 });

    rerender(<NearbyBanner gifticons={GIFTICONS.map((g) => ({ ...g, status: 'used' }))} onPick={() => {}} />);
    expect(screen.queryByText(CANT)).toBeNull();
  });

  // 밖에 나오면 저절로 사라져야 한다. 앱이 다시 앞으로 올 때 다시 찾는 그 길을 탄다.
  it('위치가 잡히면 저절로 사라지고 매장 안내로 바뀐다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(CANT, {}, { timeout: 3000 });

    getFreshPosition.mockResolvedValue({ lat: 37.5, lng: 127.0 });
    sessionStorage.clear();
    await act(async () => {
      await appStateHandler({ isActive: true });
    });

    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText(CANT)).toBeNull();
  });
});

// 권한을 이미 준 사람에게만 위치를 잡는다. 문제는 "이미 줬는지"를 아는 방법이었다.
describe('권한을 어떻게 아는가', () => {
  it("웹뷰가 'prompt'라고 해도, 적어둔 위치가 있으면 잡는다", async () => {
    // 안드로이드 웹뷰에는 사이트별 권한 설정이 없어서 앱 권한이 있어도 'prompt'가 나온다.
    // 이것만 믿었더니 띠가 위치를 한 번도 안 잡고, 매장 찾기가 적어둔 옛 좌표만 읽었다.
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    await waitFor(() => expect(getFreshPosition).toHaveBeenCalled(), { timeout: 3000 });
    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
  });

  // 한 번도 위치를 준 적이 없는 사람에게 앱 열자마자 권한 창을 띄우면 거절당하기 딱 좋고,
  // 한 번 거절되면 매장 찾기까지 같이 막힌다.
  it('한 번도 준 적이 없으면 잡아보지 않는다', async () => {
    hasSavedPosition.mockReturnValue(false);
    readCachedPosition.mockReturnValue(null);

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(getFreshPosition).not.toHaveBeenCalled();
    expect(screen.queryByText(/스타벅스/)).toBeNull();
  });

  it('거절한 사람에게는 다시 묻지 않는다', async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: async () => ({ state: 'denied' }) },
    });

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(getFreshPosition).not.toHaveBeenCalled();
  });
});
