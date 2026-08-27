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

const canOpenAppSettings = vi.fn(() => true);
const openAppSettings = vi.fn();

vi.mock('../utils/gallery', () => ({
  canOpenAppSettings: (...a) => canOpenAppSettings(...a),
  openAppSettings: (...a) => openAppSettings(...a),
}));

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

const isNearbyBannerOn = vi.fn(() => true);
const forgetCachedPosition = vi.fn();

vi.mock('../utils/geolocation', () => ({
  getFreshPosition: (...a) => getFreshPosition(...a),
  readCachedPosition: (...a) => readCachedPosition(...a),
  hasSavedPosition: (...a) => hasSavedPosition(...a),
  saveCachedPosition: () => {},
  // 권한이 없다는 걸 알게 되면 적어둔 좌표를 지운다. 안 지우면 다음에 앱을 열어도
  // '권한 있음'으로 알고 또 조용해진다.
  forgetCachedPosition: (...a) => forgetCachedPosition(...a),
  distanceBetween: () => 0,
  isNearbyBannerOn: (...a) => isNearbyBannerOn(...a),
  NEARBY_BANNER_EVENT: 'moacon:nearby-banner-changed',
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
  isNearbyBannerOn.mockReturnValue(true);
  canOpenAppSettings.mockReturnValue(true);
  searchNearbyStores.mockResolvedValue([{ name: '스타벅스 서울숲점', distance: 120 }]);
  getFreshPosition.mockResolvedValue({ lat: 37.5, lng: 127.0 });
  readCachedPosition.mockReturnValue({ lat: 37.5, lng: 127.0 });
});

describe('NearbyBanner', () => {
  // 설정에서 끈 사람. 띠만 안 뜨는 게 아니라 매장을 뒤지지도 않아야 한다 —
  // 카카오 검색에는 하루 상한이 있어서, 안 보여줄 것을 찾느라 그걸 쓰면 정작
  // '매장' 버튼이 막힌다.
  it('설정에서 끄면 뜨지도 않고 찾지도 않는다', async () => {
    isNearbyBannerOn.mockReturnValue(false);

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/스타벅스 서울숲점/)).toBeNull();
    expect(searchNearbyStores).not.toHaveBeenCalled();
  });

  // 설정 창은 이 띠 위에 겹쳐 뜬다. 닫고 나서야 사라지면 방금 끈 것이 먹혔는지 모른다.
  it('설정에서 끄면 그 자리에서 사라진다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 });

    act(() => {
      window.dispatchEvent(new CustomEvent('moacon:nearby-banner-changed', { detail: false }));
    });

    await waitFor(() => expect(screen.queryByText(/스타벅스 서울숲점/)).toBeNull());
  });

  it('앱을 열면 주변을 찾아 띄운다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
  });

  // 한 줄로 줄이면서 무엇이 먼저 잘리는지를 정해야 했다. 매장 이름이 아무리 길어도
  // 거리와 개수는 남아야 한다 — 갈까 말까를 정하는 값이 그 둘이다.
  it('매장 이름이 길어도 거리와 개수는 안 잘린다', async () => {
    searchNearbyStores.mockResolvedValue([
      { name: '스타벅스 서울숲카페거리점 드라이브스루 2호점', distance: 120 },
    ]);

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    const name = await screen.findByText(/드라이브스루 2호점/, {}, { timeout: 3000 });

    // 이름만 줄어든다.
    expect(name.className).toContain('truncate');
    expect(name.className).toContain('min-w-0');
    // 거리와 개수는 자리를 지킨다.
    expect(screen.getByText('120m').className).toContain('shrink-0');
    expect(screen.getByText(/사용가능 2개/).className).toContain('shrink-0');
  });

  // 이게 이 기능의 핵심이다. 사람들은 앱을 잘 안 끈다 — 홈을 누르고 주머니에 넣는다.
  // 그러고 걸어가서 앱을 다시 봤을 때 아까 그 내용이 그대로면, 정작 이 기능이 필요한
  // 순간에 아무 일도 안 일어나는 것이다.
  it('앱이 다시 앞으로 오면 한 번 더 찾는다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 });

    const before = searchNearbyStores.mock.calls.length;
    // 캐시가 가로채지 않도록 비운다. 실제로는 10분이 지났거나 300m를 움직인 상황이다.
    localStorage.removeItem('nearby-banner:result');
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
    localStorage.removeItem('nearby-banner:result');

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
    localStorage.removeItem('nearby-banner:result');
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText(/스타벅스 서울숲점/)).toBeNull();
  });

  // 찾아둔 결과는 앱을 껐다 켜도 10분간 살아 있어야 한다.
  //
  // 한때 sessionStorage에 뒀다. 웹에서는 탭 하나가 세션이지만 설치한 앱에서는 웹뷰가
  // 죽을 때마다 새 세션이라, 켤 때마다 브랜드 셋을 새로 뒤졌다. 한 번 열 때마다 세 번씩
  // 나간 셈이고, 하루 테스트하다 사람 몫을 다 써서 '오늘은 여기까지예요'를 봤다.
  it('앱을 껐다 켜도 10분 안이면 다시 안 찾는다', async () => {
    const { unmount } = render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 });
    const before = searchNearbyStores.mock.calls.length;

    // 앱을 껐다 켠 셈이다. 세션은 새로 시작되지만 캐시는 남아 있어야 한다.
    unmount();
    sessionStorage.clear();
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
    expect(searchNearbyStores.mock.calls.length).toBe(before);
  });

  // 캐시를 꺼내려면 '지금 자리가 그때와 같은가'를 봐야 하고, 그러려면 위치가 있어야 했다.
  // 그래서 찾아둔 것이 있어도 GPS를 다 기다린 뒤에야 띠가 떴다 — 폰이 좌표를 새로 잡으면
  // 1~8초다. "앱을 켜고 한참 있다가 뜬다"는 말이 여기서 나왔다.
  it('위치를 기다리는 동안 찾아둔 것을 먼저 그린다', async () => {
    localStorage.setItem(
      'nearby-banner:result',
      JSON.stringify({
        ts: Date.now(),
        at: { lat: 37.5, lng: 127.0 },
        best: { brand: '스타벅스', count: 2, store: '스타벅스 서울숲점', distance: 120 },
      })
    );
    // 위치가 영영 안 온다. 그래도 띠는 떠야 한다.
    getFreshPosition.mockImplementation(() => new Promise(() => {}));

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
    // 먼저 그리는 것이지 다시 찾는 것이 아니다.
    expect(searchNearbyStores).not.toHaveBeenCalled();
  });

  // 먼저 그려놓고 권한이 없다는 걸 알게 되면 그것을 걷어야 한다. 그대로 두면 '켜기' 띠가
  // 그 뒤에 가려져서, 권한을 켤 길이 화면에서 사라진다.
  it('권한이 없어진 걸 알면 먼저 그린 것을 걷는다', async () => {
    localStorage.setItem(
      'nearby-banner:result',
      JSON.stringify({
        ts: Date.now(),
        at: { lat: 37.5, lng: 127.0 },
        best: { brand: '스타벅스', count: 2, store: '스타벅스 서울숲점', distance: 120 },
      })
    );
    getFreshPosition.mockRejectedValue({ code: 1 });

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    expect(
      await screen.findByText(/위치 권한을 켜면 근처에서 쓸 수 있는 기프티콘을 알려드려요/, {}, { timeout: 3000 })
    ).toBeTruthy();
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
  const CANT = /지하나 실내에서는 위치가 안 잡힐 수 있어요/;

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

  // 권한을 도로 거둔 것은 장소 탓이 아니다. '지하라서 못 잡았다'고 하면 거짓말이 된다.
  //
  // 예전에는 여기서 조용히 넘어갔는데, 그러면 폰 설정에서 위치를 끄고 앱을 연 사람에게
  // 아무것도 안 떴다. 적어둔 좌표가 남아 있어 '권한 있음'으로 통과한 뒤 여기서 실패하고는
  // 입을 다무는 자리였다. 이제는 그 좌표를 지우고 이 자리에서 다시 물어본다.
  it('권한을 거둔 것은 장소 탓이 아니라 다시 묻는 자리로 간다', async () => {
    getFreshPosition.mockRejectedValue({ code: 1 });

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    expect(
      await screen.findByText(/위치 권한을 켜면 근처에서 쓸 수 있는 기프티콘을 알려드려요/, {}, { timeout: 3000 })
    ).toBeTruthy();
    expect(screen.queryByText(CANT)).toBeNull();
    // 안 지우면 다음에 앱을 열어도 '권한 있음'으로 알고 또 조용해진다.
    expect(forgetCachedPosition).toHaveBeenCalled();
  });

  // 웹뷰가 성공도 실패도 안 부른 경우(no_answer). 사실상 권한 문제라 같은 길로 보낸다.
  it('아무 답도 없을 때도 다시 묻는다', async () => {
    getFreshPosition.mockRejectedValue({ code: 'no_answer' });

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    expect(
      await screen.findByText(/위치 권한을 켜면 근처에서 쓸 수 있는 기프티콘을 알려드려요/, {}, { timeout: 3000 })
    ).toBeTruthy();
    expect(forgetCachedPosition).toHaveBeenCalled();
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
    localStorage.removeItem('nearby-banner:result');
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
    localStorage.removeItem('nearby-banner:result');
    await act(async () => {
      await appStateHandler({ isActive: true });
    });

    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText(CANT)).toBeNull();
  });
});

// 권한을 이미 준 사람에게만 위치를 잡는다. 문제는 "이미 줬는지"를 아는 방법이었다.
// 찾아봤는데 근처에 없는 경우. 그냥 비워두면 '켜기'를 눌러 허락까지 해준 사람에게
// 아무 일도 안 일어난 것으로 보인다 — 버튼이 헛돈 것인지 근처에 없는 것인지가
// 화면에 안 적혀 있었다.
describe('찾아봤는데 없을 때', () => {
  // 그냥 비워두면 '켜기'를 눌러 허락까지 해준 사람에게 아무 일도 안 일어난 것으로 보인다.
  // 버튼이 헛돈 것인지 근처에 없는 것인지가 화면에 안 적혀 있었다.
  const EMPTY = /500m 안에서 쓸 수 있는 기프티콘이 없어요/;

  it('근처에 없으면 없다고 적는다', async () => {
    searchNearbyStores.mockResolvedValue([{ name: '스타벅스 강남점', distance: 1200 }]);

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    expect(await screen.findByText(EMPTY, {}, { timeout: 3000 })).toBeTruthy();
  });

  // 찾기 전에는 아무 말도 하지 않는다. best가 null인 것만으로는 '아직 안 찾았다'와
  // '찾았는데 없다'가 갈리지 않는데, 화면에 적을 말은 그 둘이 서로 다르다.
  it('찾기 전에는 없다고 하지 않는다', async () => {
    searchNearbyStores.mockImplementation(() => new Promise(() => {}));

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);

    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  // 닫는 것은 '지금 쓸 게 없어서 치운다'는 뜻이지 '오늘 하루 안 보겠다'가 아니다.
  // 그래서 날짜로 적어두지 않고, 다시 찾으면 다시 뜬다.
  it('닫으면 사라지고, 다시 찾으면 다시 뜬다', async () => {
    searchNearbyStores.mockResolvedValue([{ name: '스타벅스 강남점', distance: 1200 }]);

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(EMPTY, {}, { timeout: 3000 });

    await act(async () => screen.getByRole('button', { name: '주변 안내 닫기' }).click());
    expect(screen.queryByText(EMPTY)).toBeNull();
    // 오늘 하루를 적어두는 그 자리는 건드리지 않는다.
    expect(localStorage.getItem('nearby-banner-dismissed-on')).toBeNull();

    // 캐시가 가로채지 않도록 비운다. 실제로는 10분이 지났거나 300m를 움직인 상황이다
    // (여기서는 distanceBetween이 늘 0이라 좌표를 바꿔도 같은 자리로 본다).
    localStorage.removeItem('nearby-banner:result');
    await act(async () => appStateHandler({ isActive: true }));

    expect(await screen.findByText(EMPTY, {}, { timeout: 3000 })).toBeTruthy();
  });

  // 이 앱은 계산대 앞에서 열었다 닫았다 하는 앱이다. 홈을 눌렀다 3초 뒤 돌아올 때마다
  // 방금 치운 것이 다시 서면 성가시다. 캐시를 쓴다는 건 다시 찾지 않았다는 뜻이다.
  it('같은 자리에서 다시 열면 닫아둔 채로 있다', async () => {
    searchNearbyStores.mockResolvedValue([{ name: '스타벅스 강남점', distance: 1200 }]);

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(EMPTY, {}, { timeout: 3000 });
    await act(async () => screen.getByRole('button', { name: '주변 안내 닫기' }).click());

    await act(async () => appStateHandler({ isActive: true }));

    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  // 알려줄 기프티콘이 아예 없는 사람에게는 '없어요'도 할 말이 아니다.
  it('알려줄 기프티콘이 없으면 없다고도 하지 않는다', async () => {
    render(
      <NearbyBanner gifticons={[{ id: '9', brand: '스타벅스', status: 'used' }]} onPick={() => {}} />
    );

    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

});

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

// 위치를 한 번도 준 적이 없는 사람. 시스템 창을 들이밀지 않고 이 자리에서 먼저 묻는다.
//
// 안드로이드 위치 권한은 두 번째 거절이 "다시 묻지 않음"이 되어 시스템 설정에 들어가야
// 풀린다. 그래서 시스템 창이 첫 질문이 되면 안 된다 — 앱이 뭘 하는지도 모르는 상태에서
// 물으면 반사적으로 거절하고, 그러면 띠도 매장 찾기도 영영 막힌다.
describe('위치를 아직 안 준 사람에게', () => {
  const ASK = /위치 권한을 켜면 근처에서 쓸 수 있는 기프티콘을 알려드려요/;

  beforeEach(() => {
    hasSavedPosition.mockReturnValue(false);
    readCachedPosition.mockReturnValue(null);
  });

  it('이 자리에서 먼저 물어본다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    expect(await screen.findByText(ASK, {}, { timeout: 3000 })).toBeTruthy();
  });

  // 무시해도 잃는 것이 없어야 한다. 누르기 전에 시스템 창이 뜨면 그 한 번을 태우는 셈이다.
  it('누르기 전에는 위치를 잡아보지 않는다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });
    expect(getFreshPosition).not.toHaveBeenCalled();
  });

  it('켜기를 누르면 그때 잡고, 매장 안내로 바뀐다', async () => {
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });

    await act(async () => screen.getByRole('button', { name: '켜기' }).click());

    expect(getFreshPosition).toHaveBeenCalled();
    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
  });

  // 폰 설정에서 위치 권한을 '허용 안 함'으로 바꿔두면 웹뷰가 아무 답도 안 준다 — 성공도
  // 실패도 안 부른다. 그러면 벽시계(10초)가 칠 때까지 화면에 아무 변화가 없어서 누른 사람
  // 눈에는 버튼이 죽은 것이다. "켜기가 눌리지 않는다"는 말이 여기서 나왔다.
  it('누른 것이 그 자리에서 보인다', async () => {
    getFreshPosition.mockImplementation(() => new Promise(() => {}));

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });
    await act(async () => screen.getByRole('button', { name: '켜기' }).click());

    const button = screen.getByRole('button', { name: '여는 중' });
    expect(button.disabled).toBe(true);
  });

  // 시스템 창이 떴는지는 이쪽에서 알 길이 없다. 그래서 띠를 바꿔치우지 않고 덧붙인다 —
  // 창이 떠 있으면 그 창에 가려 안 보이고, 창이 안 떴다면 이 한 줄이 유일한 길이다.
  it('답이 안 오면 설정으로 가는 길을 덧붙인다', async () => {
    getFreshPosition.mockImplementation(() => new Promise(() => {}));

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });
    await act(async () => screen.getByRole('button', { name: '켜기' }).click());

    const way = await screen.findByRole(
      'button',
      { name: '창이 안 뜨면 설정에서 켜주세요' },
      { timeout: 3000 }
    );
    // 덧붙이는 것이라 원래 문장은 그대로 있어야 한다.
    expect(screen.queryByText(ASK)).toBeTruthy();

    await act(async () => way.click());
    expect(openAppSettings).toHaveBeenCalled();
  });

  // 사람이 창을 보고 거절한 것은 잠긴 것과 다르다. 덧붙였던 길을 걷지 않으면 방금 고른
  // 것을 무르라는 말이 화면에 남는다.
  it('사람이 거절하면 설정 안내를 남기지 않는다', async () => {
    getFreshPosition.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject({ code: 1 }), 1800))
    );

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });
    await act(async () => screen.getByRole('button', { name: '켜기' }).click());

    // 거절이 오기 전에 길이 먼저 덧붙는다(창을 읽는 동안이다).
    await screen.findByRole('button', { name: '창이 안 뜨면 설정에서 켜주세요' }, { timeout: 3000 });

    await waitFor(() => expect(screen.queryByText(ASK)).toBeNull(), { timeout: 3000 });
    expect(screen.queryByText(/설정에서 위치 권한을 켜주세요/)).toBeNull();
    expect(screen.queryByRole('button', { name: '설정 열기' })).toBeNull();
  });

  // 시스템 창은 한 번뿐이라 아껴야 하지만, 우리 띠는 몇 번이든 다시 물을 수 있다.
  // 그렇다고 거절한 그날 또 물으면 조르는 것이 된다.
  // 사람이 창을 보고 거절한 경우. 즉시 돌아오는 거절은 뜻이 달라서(창이 아예 안 뜬 것)
  // 여기서는 사람이 누르는 시간만큼 늦춰 흉내낸다.
  it('거절하면 그날은 다시 묻지 않는다', async () => {
    getFreshPosition.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject({ code: 1 }), 450))
    );

    const { unmount } = render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });
    await act(async () => screen.getByRole('button', { name: '켜기' }).click());
    // 거절이 450ms 뒤에 온다(사람이 창을 읽고 누르는 시간). 그때까지 기다린다.
    await waitFor(() => expect(screen.queryByText(ASK)).toBeNull(), { timeout: 2000 });

    unmount();
    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText(ASK)).toBeNull();
  });

  it('알려줄 기프티콘이 없으면 묻지도 않는다', async () => {
    render(<NearbyBanner gifticons={[{ id: '9', brand: '스타벅스', status: 'used' }]} onPick={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByText(ASK)).toBeNull();
  });

  // 묻고 있는 사이에 마지막 기프티콘을 써버리면, 알려줄 것이 없는데 물음만 남는다.
  it('묻는 중에 기프티콘이 없어지면 물음도 걷는다', async () => {
    const { rerender } = render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });

    rerender(<NearbyBanner gifticons={GIFTICONS.map((g) => ({ ...g, status: 'used' }))} onPick={() => {}} />);
    expect(screen.queryByText(ASK)).toBeNull();
  });

  // 거절한 뒤 앱을 뒤로 보냈다 다시 여는 것은 흔한 일이다. 그때 다시 찾으면서 물음이
  // 되살아나면, 방금 거절한 사람에게 같은 것을 또 들이미는 셈이다.
  // 안드로이드는 두 번 거절당하면 그때부터 창을 안 띄우고 곧장 거절을 돌려준다.
  // 그러면 '켜기'가 눌러도 아무 일이 없는 버튼이 된다 — 고장으로 읽힌다.
  // 남은 길은 폰 설정 하나뿐이라 그리로 데려다준다.
  it('창이 안 뜨고 거절이 돌아오면 설정으로 데려다준다', async () => {
    getFreshPosition.mockRejectedValue({ code: 1 });

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });
    await act(async () => screen.getByRole('button', { name: '켜기' }).click());

    expect(screen.queryByText(ASK)).toBeNull();
    expect(screen.getByText(/설정에서 위치 권한을 켜주세요/)).toBeTruthy();

    await act(async () => screen.getByRole('button', { name: '설정 열기' }).click());
    expect(openAppSettings).toHaveBeenCalled();
  });

  // 브라우저에는 열어줄 설정 화면이 없다. 버튼 대신 어디를 눌러야 하는지를 적는다.
  it('설정 화면을 못 여는 곳에서는 버튼 없이 길만 알려준다', async () => {
    canOpenAppSettings.mockReturnValue(false);
    getFreshPosition.mockRejectedValue({ code: 1 });

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });
    await act(async () => screen.getByRole('button', { name: '켜기' }).click());

    expect(screen.getByText(/자물쇠를 눌러 위치를 허용/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: '설정 열기' })).toBeNull();
  });

  it('거절한 뒤 앱을 다시 열어도 그날은 안 묻는다', async () => {
    getFreshPosition.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject({ code: 1 }), 450))
    );

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    await screen.findByText(ASK, {}, { timeout: 3000 });
    await act(async () => screen.getByRole('button', { name: '켜기' }).click());
    await waitFor(() => expect(screen.queryByText(ASK)).toBeNull(), { timeout: 2000 });

    localStorage.removeItem('nearby-banner:result');
    await act(async () => {
      await appStateHandler({ isActive: true });
    });

    expect(screen.queryByText(ASK)).toBeNull();
  });

  // 매장 찾기에서 이미 허락을 받았으면 물어볼 것이 없다. 그때부터는 바로 띠가 돈다.
  it('매장 찾기에서 이미 허락했으면 묻지 않고 바로 띄운다', async () => {
    hasSavedPosition.mockReturnValue(true);

    render(<NearbyBanner gifticons={GIFTICONS} onPick={() => {}} />);
    expect(await screen.findByText(/스타벅스 서울숲점/, {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByText(ASK)).toBeNull();
  });
});
