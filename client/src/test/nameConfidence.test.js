import { describe, expect, it, vi, beforeEach } from 'vitest';

// 모델이 "상품명을 헷갈렸다"고 말한 것을 화면까지 들고 오는 길.
//
// 이 값이 필요한 이유는 상품명이 틀리는 방식이 조용해서다. 못 읽으면 빈칸이라 눈에
// 띄지만, 떠먹는을 뚜믹는으로 읽으면 멀쩡한 이름처럼 카드에 앉는다. 실제로 그렇게
// 등록됐고, 나중에 목록에서 그게 무슨 기프티콘인지 알 방법이 없었다.
//
// 여기서 보는 건 두 가지뿐이다 — 값이 없는 옛 함수와 섞여도 안 터지는가, 그리고
// 빈 상품명에까지 경고를 붙이지는 않는가.

const analyzeGifticonImages = vi.fn();

vi.mock('../api', () => ({
  analyzeGifticonImages: (...args) => analyzeGifticonImages(...args),
}));

vi.mock('../utils/scanCache', () => ({
  readCachedInfo: () => null,
  writeCachedInfo: () => {},
}));

const { readGifticonInfo } = await import('../utils/imageAnalyze');

function serverSays(extra) {
  return {
    name: '떠먹는 티라미수',
    brand: '투썸플레이스',
    amount: null,
    expiresAt: '2026-12-31',
    category: '카페',
    code: '',
    isVoucher: false,
    thumbnail: null,
    ...extra,
  };
}

const prepared = { code: '713353422322', codeType: 'CODE_128', uploads: [{}], storageFiles: [] };

beforeEach(() => {
  analyzeGifticonImages.mockReset();
});

describe('상품명 확신도', () => {
  it('헷갈렸다고 하면 그대로 들고 온다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ nameUncertain: true }));

    const info = await readGifticonInfo(prepared);

    expect(info.nameUncertain).toBe(true);
  });

  it('또렷하게 읽었으면 붙이지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ nameUncertain: false }));

    const info = await readGifticonInfo(prepared);

    expect(info.nameUncertain).toBe(false);
  });

  // 함수를 아직 안 올린 상태에서 앱만 새것이면 이 값이 안 온다. 그때 undefined가 그대로
  // 화면까지 가면 경고가 붙었다 말았다 한다. 없으면 예전과 똑같이 굴어야 한다.
  it('옛 함수가 값을 안 주면 없는 것으로 본다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays());

    const info = await readGifticonInfo(prepared);

    expect(info.nameUncertain).toBe(false);
  });

  // 상품명을 아예 못 읽은 건은 카드가 이미 "못 읽었어요"로 말한다. 거기에 "확인해주세요"를
  // 겹쳐 붙이면 무엇을 확인하라는 말인지 모른다. 서버가 빈칸에는 헷갈림을 안 붙인다.
  it('상품명이 비었으면 서버가 헷갈림을 붙이지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ name: '', nameUncertain: false }));

    const info = await readGifticonInfo(prepared);

    expect(info.name).toBe('');
    expect(info.nameUncertain).toBe(false);
  });
});
