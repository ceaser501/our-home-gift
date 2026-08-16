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
vi.mock('../utils/geolocation', () => ({
  getFreshPosition: async () => ({ lat: 37.5, lng: 127.0 }),
  readCachedPosition: () => ({ lat: 37.5, lng: 127.0 }),
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
  // 권한을 이미 준 상태로 둔다.
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: async () => ({ state: 'granted' }) },
  });
  searchNearbyStores.mockResolvedValue([{ name: '스타벅스 서울숲점', distance: 120 }]);
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
