import { describe, expect, it, vi, beforeEach } from 'vitest';

// 상품명만 잘라 한 번 더 읽히는 길.
//
// 틀리는 항목이 상품명 하나로 몰려 있다. 금액·기한·상호는 숫자거나 아는 이름이라 잘
// 읽는데, 상품명은 처음 보는 한글 덩어리라 획 하나로 갈린다(떠먹는 → 따먹는). 게다가
// 틀린 방식이 조용해서 멀쩡한 이름처럼 등록된다.
//
// 여기서 보는 건 네 가지다 — 다시 읽은 값으로 갈아끼우는가, 못 물어봤을 때 앞 값이
// 살아남는가, 확인을 건너뛴 것과 확인해서 같았던 것을 구분하는가, 그리고 이름이 없으면
// 헛물어보지 않는가.

const analyzeGifticonImages = vi.fn();
const verifyGifticonName = vi.fn();

vi.mock('../api', () => ({
  analyzeGifticonImages: (...args) => analyzeGifticonImages(...args),
  verifyGifticonName: (...args) => verifyGifticonName(...args),
}));

vi.mock('../utils/scanCache', () => ({
  readCachedInfo: () => null,
  writeCachedInfo: () => {},
}));

const { readGifticonInfo } = await import('../utils/imageAnalyze');

const NAME_BOX = { image: 1, x: 10, y: 20, width: 70, height: 6 };

function serverSays(extra) {
  return {
    name: '따먹는 스트로베리 케이크',
    nameBox: NAME_BOX,
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

// 자르는 일에는 캔버스가 필요하다. jsdom에는 없어서, 자를 원본이 없는 상태로 부른다 —
// 그러면 cropNameBox까지 못 가고 확인을 건너뛴다. 자른 그림을 넣어야 하는 경우는
// sourceFiles를 채워 따로 만든다.
function prepared(sourceFiles) {
  return {
    code: '713353422322',
    codeType: 'CODE_128',
    uploads: [{}],
    storageFiles: [],
    sourceFiles,
  };
}

beforeEach(() => {
  analyzeGifticonImages.mockReset();
  verifyGifticonName.mockReset();
});

describe('상품명 재확인', () => {
  // 자를 원본이 없으면 물어볼 그림도 없다. 그때 이름이 사라지거나 빈칸이 되면 안 된다 —
  // 확인은 이미 나온 답을 낫게 만드는 곁가지지, 답을 만드는 자리가 아니다.
  it('자를 원본이 없으면 앞서 읽은 이름이 그대로 남는다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays());

    const info = await readGifticonInfo(prepared());

    expect(info.name).toBe('따먹는 스트로베리 케이크');
    expect(info.meta.nameUnchecked).toBe(true);
    expect(verifyGifticonName).not.toHaveBeenCalled();
  });

  // 이름을 아예 못 읽은 건은 확인할 것이 없다. 빈칸을 잘라 보내봐야 값만 나간다.
  it('이름이 비어 있으면 물어보지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ name: '', nameBox: null }));

    const info = await readGifticonInfo(prepared());

    expect(info.name).toBe('');
    expect(info.meta.nameUnchecked).toBeUndefined();
    expect(verifyGifticonName).not.toHaveBeenCalled();
  });

  // 서버가 네모를 못 짚으면(옛 함수이거나 좌표가 엉뚱해서 걸러졌거나) 자를 데가 없다.
  it('네모를 못 짚으면 확인을 건너뛴 것으로 남긴다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ nameBox: null }));

    const info = await readGifticonInfo(prepared());

    expect(info.name).toBe('따먹는 스트로베리 케이크');
    expect(info.meta.nameUnchecked).toBe(true);
  });
});
