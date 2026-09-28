import { describe, expect, it, vi, beforeEach } from 'vitest';

// 아이폰 사진첩 훑기(2026-09-27)와 함께 들어온 규칙들.
//
//   - 아이폰 앱에서도 훑기가 켜진다
//   - 기본은 설치한 날 0시부터, 더 예전은 '최근 1개월 · 최근 3개월'로 늘린다
//   - 한 번에 200장까지만 읽고, 남은 장수를 돌려준다. 이어서 보는 건 그 창 안에서만이고,
//     남긴 채 닫으면 다음 기본 찾기는 그 사진을 건너뛴다(markPassed)
//
// 네이티브는 없다. listImages가 무엇을 받았는지와 무엇을 돌려줬는지만 본다.

const nativeGallery = vi.hoisted(() => ({}));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => nativeGallery }));

const { isGalleryScanSupported, scanGallery, scanRangeOptions, rangeStartOf, markPassed } = await import('../utils/gallery');

const DAY = 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  localStorage.clear();
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
  nativeGallery.getStatus = vi.fn(async () => ({ granted: true, partial: false, installedAt: now() - 2 * DAY }));
  nativeGallery.listImages = vi.fn(async () => ({ images: [], since: now() - 2 * DAY, folders: [] }));
  nativeGallery.readImage = vi.fn(async () => ({ data: '', width: 1, height: 1 }));
});

describe('어디서 켜지나', () => {
  it('아이폰 앱에서 켜진다', () => {
    expect(isGalleryScanSupported()).toBe(true);
  });

  it('안드로이드 앱에서도 그대로 켜진다', () => {
    window.Capacitor.getPlatform = () => 'android';
    expect(isGalleryScanSupported()).toBe(true);
  });

  it('웹에서는 안 켜진다', () => {
    window.Capacitor = undefined;
    expect(isGalleryScanSupported()).toBe(false);
  });
});

describe('훑는 기간', () => {
  it('기본은 설치한 날 — 네이티브에 0을 넘긴다', async () => {
    await scanGallery({});
    expect(nativeGallery.listImages).toHaveBeenCalledWith(expect.objectContaining({ since: '0' }));
  });

  it('최근 1개월이면 달력으로 한 달 전 그날 0시부터 본다', async () => {
    await scanGallery({ range: '1m' });
    const since = Number(nativeGallery.listImages.mock.calls[0][0].since);
    const today = new Date();
    const expected = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    expected.setDate(Math.min(today.getDate(), new Date(expected.getFullYear(), expected.getMonth() + 1, 0).getDate()));
    expect(since).toBe(Math.floor(expected.getTime() / 1000));
  });

  it('9월 28일의 최근 1개월은 8월 28일, 최근 3개월은 6월 28일', () => {
    const today = new Date(2026, 8, 28, 14, 0);
    expect(new Date(rangeStartOf('1m', today) * 1000)).toEqual(new Date(2026, 7, 28));
    expect(new Date(rangeStartOf('3m', today) * 1000)).toEqual(new Date(2026, 5, 28));
  });

  it('그달에 없는 날이면 마지막 날로 — 3월 31일의 한 달 전은 2월 28일', () => {
    expect(new Date(rangeStartOf('1m', new Date(2027, 2, 31)) * 1000)).toEqual(new Date(2027, 1, 28));
  });

  it('⚠️ 설치일보다 좁아지지 않는다 — 석 달 전에 깐 사람의 1개월은 설치일부터', async () => {
    const installedAt = now() - 100 * DAY;
    nativeGallery.getStatus = vi.fn(async () => ({ granted: true, partial: false, installedAt }));
    await scanGallery({ range: '1m' });
    expect(Number(nativeGallery.listImages.mock.calls[0][0].since)).toBe(installedAt);
  });

  it('고를 수 있는 기간은 설치일보다 예전으로 가는 것만', () => {
    expect(scanRangeOptions(now() - 2 * DAY).map((o) => o.key)).toEqual(['1m', '3m']);
    expect(scanRangeOptions(now() - 50 * DAY).map((o) => o.key)).toEqual(['3m']);
    expect(scanRangeOptions(now() - 100 * DAY)).toEqual([]);
  });
});

describe('한 번에 다 못 보면', () => {
  it('⚠️ 이미 본 사진을 빼고 나서 200장을 고르고, 남은 장수를 돌려준다', async () => {
    // 최신 50장은 이미 '기프티콘 아님'으로 치운 것. 그 뒤로 300장이 새것.
    const images = Array.from({ length: 350 }, (_, i) => ({ id: `p${i}`, name: '', addedAt: now() - i, bucket: '' }));
    localStorage.setItem('moacon:gallery-dismissed', JSON.stringify(images.slice(0, 50).map((image) => image.id)));
    nativeGallery.listImages = vi.fn(async () => ({ images, since: 0, folders: [] }));

    // 실제로 읽는 판(캔버스·zxing)은 여기서 볼 것이 아니라 바로 멈춘다. 무엇을 읽기로
    // 골랐는지는 멈추기 전에 정해진다.
    const stop = new AbortController();
    stop.abort();
    const scan = await scanGallery({ signal: stop.signal });

    // 목록은 넉넉히 받는다 — 최신 200장만 받으면 이미 본 것에 막혀 더 나아가지 못한다.
    expect(nativeGallery.listImages.mock.calls[0][0].limit).toBeGreaterThanOrEqual(1000);
    expect(scan.scanned).toBe(200);
    expect(scan.more).toBe(100);
  });
});

describe('이어서 찾기', () => {
  it('⚠️ 이 창에 이미 올라온 사진은 건너뛴다 — 찾은 것 위에 새것만 더해진다', async () => {
    const images = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: '', addedAt: now() - i, bucket: '' }));
    nativeGallery.listImages = vi.fn(async () => ({ images, since: 0, folders: [] }));
    const stop = new AbortController();
    stop.abort();
    const scan = await scanGallery({ signal: stop.signal, skipIds: new Set(['p0', 'p1']) });
    expect(scan.scanned).toBe(3);
  });
});

describe('남기고 닫은 사진', () => {
  const images = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: '', addedAt: now() - i, bucket: '' }));
  const stopped = () => {
    const stop = new AbortController();
    stop.abort();
    return stop.signal;
  };

  it('200장을 넘는 것은 leftIds로 돌려준다', async () => {
    const many = Array.from({ length: 203 }, (_, i) => ({ id: `q${i}`, name: '', addedAt: now() - i, bucket: '' }));
    nativeGallery.listImages = vi.fn(async () => ({ images: many, since: 0, folders: [] }));
    const scan = await scanGallery({ signal: stopped() });
    expect(scan.leftIds).toEqual(['q200', 'q201', 'q202']);
  });

  it('⚠️ 기본 찾기는 건너뛰고, 기간을 직접 고르면 다시 본다', async () => {
    nativeGallery.listImages = vi.fn(async () => ({ images, since: 0, folders: [] }));
    markPassed(['p3', 'p4']);
    expect((await scanGallery({ signal: stopped(), skipPassed: true })).scanned).toBe(3);
    expect((await scanGallery({ signal: stopped(), range: '1m' })).scanned).toBe(5);
  });
});

// B안(2026-09-28): 지금 사진을 읽는 동안 폰은 다음 사진을 준비한다.
describe('다음 사진 미리 받기', () => {
  it('앞 사진이 아직 안 왔어도 다음 사진을 이미 달라고 해뒀다', async () => {
    const images = Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, name: '', addedAt: now() - i, bucket: '' }));
    nativeGallery.listImages = vi.fn(async () => ({ images, since: 0, folders: [] }));
    // 시험에는 사진을 펼칠 곳이 없어서, 받는 순간 실패하게 둔다('열지 못한 사진'으로 세고
    // 넘어간다). 여기서 보는 것은 언제 달라고 했는지뿐이다.
    let release;
    const first = new Promise((_resolve, reject) => {
      release = () => reject(new Error('시험'));
    });
    nativeGallery.readImage = vi.fn(({ id }) => (id === 'p0' ? first : Promise.reject(new Error('시험'))));

    const scanning = scanGallery({});
    await vi.waitFor(() => expect(nativeGallery.readImage.mock.calls.map(([arg]) => arg.id)).toContain('p1'));
    release();
    const scan = await scanning;
    expect(scan.scanned).toBe(3);
    // 한 장씩만 앞서 받는다 — 같은 사진을 두 번 달라고 하지 않는다.
    expect(nativeGallery.readImage).toHaveBeenCalledTimes(3);
  });
});
