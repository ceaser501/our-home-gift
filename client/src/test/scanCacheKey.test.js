import { describe, expect, it, vi, beforeEach } from 'vitest';

// 읽은 결과를 바코드 번호에 매달아 두는 자리(테스트 빌드 전용 캐시).
//
// 번호만으로 매달아 두면, 같은 기프티콘에 정보 화면을 한 장 더해 다시 올려도 예전 답이
// 그대로 나온다. 새로 넣은 사진은 모델이 보지도 못하는데, 화면에는 사진이 세 장 멀쩡히
// 붙어 있어서 "금액 화면을 같이 올렸는데 금액이 안 채워진다"로만 보인다. 캐시를
// 의심하기 어려운 종류의 고장이라 여기서 지킨다.

const analyzeGifticonImages = vi.fn();
const store = new Map();

vi.mock('../api', () => ({
  analyzeGifticonImages: (...args) => analyzeGifticonImages(...args),
}));

vi.mock('../utils/scanCache', () => ({
  readCachedInfo: (key) => store.get(key) || null,
  writeCachedInfo: (key, info) => {
    if (key && info) store.set(key, info);
  },
}));

const { readGifticonInfo } = await import('../utils/imageAnalyze');

function said(amount) {
  return {
    name: '황올반+BBQ양념반+콜라1.25L',
    brand: 'BBQ',
    amount,
    expiresAt: '2026-11-04',
    category: '외식/배달',
    code: '713353422322',
    isVoucher: false,
    thumbnail: null,
  };
}

function prepared(count) {
  return {
    code: '713353422322',
    codeType: 'CODE_128',
    barcodeCropBlob: null,
    storageFiles: Array.from({ length: count }, () => null),
    uploads: Array.from({ length: count }, (_, i) => `사진${i + 1}`),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
});

describe('읽기 결과를 다시 쓰는 기준', () => {
  it('사진 장수가 그대로면 다시 읽지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue(said(null));

    await readGifticonInfo(prepared(2));
    await readGifticonInfo(prepared(2));

    expect(analyzeGifticonImages).toHaveBeenCalledTimes(1);
  });

  // 정보 화면을 한 장 더해 올린 경우다. 사진이 늘었으면 답이 달라질 수 있다.
  it('사진을 더해서 올리면 다시 읽는다', async () => {
    analyzeGifticonImages.mockResolvedValueOnce(said(null));
    await readGifticonInfo(prepared(2));

    analyzeGifticonImages.mockResolvedValueOnce(said(26500));
    const again = await readGifticonInfo(prepared(3));

    expect(analyzeGifticonImages).toHaveBeenCalledTimes(2);
    expect(again.amount).toBe(26500);
  });
});
