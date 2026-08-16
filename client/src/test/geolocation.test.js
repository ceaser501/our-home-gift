import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getFreshPosition, readCachedPosition, saveCachedPosition } from '../utils/geolocation';

// 여의도에서 앱을 켰는데 몇 시간 전 서울숲에서 잡아둔 좌표가 그대로 나왔다. 검색은
// 멀쩡했고 — 카카오에 sort=distance로 묻고 500m 안만 띄운다 — 앱이 자기 위치를 잘못
// 알고 있었다. 여기서 지키는 것은 하나다: 오래된 좌표를 현재 위치라고 하지 않는다.

const getCurrentPosition = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
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
