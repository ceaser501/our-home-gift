import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  forgetCachedPosition,
  getFreshPosition,
  hasSavedPosition,
  readCachedPosition,
  saveCachedPosition,
} from '../utils/geolocation';

// 여의도에서 앱을 켰는데 몇 시간 전 서울숲에서 잡아둔 좌표가 그대로 나왔다. 검색은
// 멀쩡했고 — 카카오에 sort=distance로 묻고 500m 안만 띄운다 — 앱이 자기 위치를 잘못
// 알고 있었다. 여기서 지키는 것은 하나다: 오래된 좌표를 현재 위치라고 하지 않는다.

const getCurrentPosition = vi.fn();
const nativeGetCurrentPosition = vi.fn();
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { getCurrentPosition: (...a) => nativeGetCurrentPosition(...a) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  delete window.Capacitor;
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (...args) => getCurrentPosition(...args) },
  });
  getCurrentPosition.mockImplementation((ok) => ok({ coords: { latitude: 37.5, longitude: 126.9 } }));
});

describe('getFreshPosition', () => {
  // 이 한 줄이 서울숲을 불렀다. maximumAge: Infinity는 "나이 상관없이 기기가 마지막으로
  // 잡아둔 것을 달라"는 뜻이고, 이동하는 내내 화면을 꺼두면 그 옛 기억이 계속 이긴다.
  it('나이 제한 없이 옛 좌표를 받아오지 않는다', async () => {
    await getFreshPosition();

    const options = getCurrentPosition.mock.calls[0][2];
    expect(options.maximumAge).toBeLessThanOrEqual(60 * 1000);
    expect(Number.isFinite(options.maximumAge)).toBe(true);
  });

  it('한 번에 못 잡으면 시간을 더 주고 아예 새로 잡는다', async () => {
    getCurrentPosition
      .mockImplementationOnce((_ok, fail) => fail({ code: 3 }))
      .mockImplementationOnce((ok) => ok({ coords: { latitude: 37.5, longitude: 126.9 } }));

    await getFreshPosition();

    const second = getCurrentPosition.mock.calls[1][2];
    expect(second.maximumAge).toBe(0);
    expect(second.timeout).toBeGreaterThan(getCurrentPosition.mock.calls[0][2].timeout);
  });

  it('권한을 거부했으면 다시 묻지 않는다', async () => {
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 1 }));

    await expect(getFreshPosition()).rejects.toBeTruthy();
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

describe('readCachedPosition', () => {
  // 자리마다 견딜 수 있는 나이가 다르다. 매장 찾기는 사용자가 직접 눌러 지도까지 보는
  // 자리지만, "지금 이 근처예요"라고 먼저 말을 거는 띠에게 하루 전 좌표는 다른 동네다.
  it('부르는 쪽이 정한 나이보다 오래됐으면 안 준다', () => {
    saveCachedPosition({ lat: 37.5, lng: 126.9 });
    // 40분 전에 적어둔 것으로 만든다.
    const saved = JSON.parse(localStorage.getItem('moacon:last-position'));
    saved.at = Date.now() - 40 * 60 * 1000;
    localStorage.setItem('moacon:last-position', JSON.stringify(saved));

    expect(readCachedPosition(30 * 60 * 1000)).toBeNull();
    // 하루까지 받는 쪽에는 그대로 준다.
    expect(readCachedPosition()).toEqual({ lat: 37.5, lng: 126.9 });
  });
});

// 안드로이드 웹뷰는 앱 권한이 없으면 성공도 실패도 안 부르고 그냥 조용해진다.
// options.timeout은 좌표를 잡는 시간에만 걸리는 것이라 권한 단계에서 멈춘 것은 못 깨운다.
//
// 그래서 목록 위 띠는 '물어볼까 말까'를 영영 못 정해 아무것도 안 띄웠고, 매장 찾기는
// '주변 매장을 찾고 있어요'에서 끝없이 돌았다. 사용자가 할 수 있는 일이 앱을 끄는 것뿐이었다.
describe('저쪽이 아무 답도 안 할 때', () => {
  it('우리 쪽에서 끝내고 no_answer로 알린다', async () => {
    vi.useFakeTimers();
    // 성공도 실패도 부르지 않는다.
    getCurrentPosition.mockImplementation(() => {});

    const pending = getFreshPosition().then(
      () => ({ ok: true }),
      (err) => ({ code: err?.code })
    );
    await vi.advanceTimersByTimeAsync(11000);

    expect(await pending).toEqual({ code: 'no_answer' });
    // 두 번째 판까지 기다리면 사용자는 30초를 빈 화면 앞에서 보낸다.
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  // 답이 제때 왔으면 우리 시계는 아무 일도 하지 않아야 한다.
  it('제때 답하면 그대로 받는다', async () => {
    const at = await getFreshPosition();
    expect(at).toEqual({ lat: 37.5, lng: 126.9 });
  });
});

// 적어둔 좌표는 "이 사람이 권한을 준 적이 있다"는 증거로도 쓰인다. 권한을 도로 거둬도
// 좌표는 남아 있어서, 그대로 두면 앱이 계속 '권한 있음'으로 알고 물어보지 않는다.
describe('권한이 없다는 걸 알게 되면', () => {
  it('적어둔 좌표를 지워서 다음에 다시 묻게 한다', () => {
    saveCachedPosition({ lat: 37.5, lng: 126.9 });
    expect(hasSavedPosition()).toBe(true);

    forgetCachedPosition();

    expect(hasSavedPosition()).toBe(false);
    expect(readCachedPosition()).toBeNull();
  });
});

// 앱스토어 1.0.1 제보(2026-09-28): 아이폰 앱을 켤 때마다 「"localhost" would like to use
// your current location」 창이 떴다. 앱 안의 웹 화면은 웹 쪽 위치 허락을 기억하지 않는다.
// 아이폰 앱은 웹 위치 요청을 아예 안 쓰고 앱의 위치 기능으로 받는다.
describe('아이폰 앱', () => {
  beforeEach(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  });

  it('⚠️ 웹 위치 요청을 쓰지 않는다 — 켤 때마다 뜨던 창', async () => {
    nativeGetCurrentPosition.mockResolvedValue({ coords: { latitude: 37.52, longitude: 126.92 } });
    await expect(getFreshPosition()).resolves.toEqual({ lat: 37.52, lng: 126.92 });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(nativeGetCurrentPosition.mock.calls[0][0].enableHighAccuracy).toBe(true);
  });

  it('권한 거부는 웹과 같은 code 1로 돌려준다 — 다시 묻지 않는다', async () => {
    nativeGetCurrentPosition.mockRejectedValue(Object.assign(new Error('denied'), { code: 'OS-PLUG-GLOC-0003' }));
    await expect(getFreshPosition()).rejects.toMatchObject({ code: 1 });
    expect(nativeGetCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('시간 안에 못 잡으면 대충이라도 한 번 더 잡는다', async () => {
    nativeGetCurrentPosition
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'OS-PLUG-GLOC-0010' }))
      .mockResolvedValueOnce({ coords: { latitude: 37.5, longitude: 126.9 } });
    await expect(getFreshPosition()).resolves.toEqual({ lat: 37.5, lng: 126.9 });
    expect(nativeGetCurrentPosition.mock.calls[1][0].enableHighAccuracy).toBe(false);
  });
});

describe('갤럭시 앱', () => {
  it('웹 위치 요청 그대로 — 앱 권한을 따라가서 창이 안 뜬다', async () => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    await getFreshPosition();
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(nativeGetCurrentPosition).not.toHaveBeenCalled();
  });
});
