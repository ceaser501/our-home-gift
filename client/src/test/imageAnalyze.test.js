import { describe, expect, it, vi, beforeEach } from 'vitest';

// 바코드 번호를 고르는 규칙만 본다. 이건 터지는 실수가 아니라 어긋나는 실수라, 화면을
// 띄워보는 것으로는 안 잡힌다 — 화면은 멀쩡히 잘 돌고, 다만 틀린 번호가 저장된다.
//
// 실제로 두 번 물렸다. 한 번은 이미 등록한 기프티콘이 다시 잡혀 또 등록됐고(훑기는 A로
// 묻는데 등록은 B로 들어갔다), 또 한 번은 모델이 눈으로 읽은 숫자가 그대로 바코드가
// 됐다. 뒤엣것은 매장에서 안 찍힌다.

const analyzeGifticonImages = vi.fn();

vi.mock('../api', () => ({
  analyzeGifticonImages: (...args) => analyzeGifticonImages(...args),
  // 사진이 한 장이면 상품명 확인이 나란히 출발한다. 여기서는 그 답을 쓰지 않지만,
  // 없으면 부르다 터진다.
  verifyGifticonName: () => Promise.resolve({ name: null, why: null }),
}));

vi.mock('../utils/scanCache', () => ({
  readCachedInfo: () => null,
  writeCachedInfo: () => {},
}));

const { readGifticonInfo } = await import('../utils/imageAnalyze');

// 썸네일을 안 자르게 thumbnail은 비워 둔다. 자르는 쪽은 캔버스가 필요한데 여기엔 없다.
function modelSays(code) {
  return {
    name: '아이스 아메리카노',
    brand: '스타벅스',
    amount: null,
    expiresAt: '2026-12-31',
    category: '카페',
    code,
    isVoucher: false,
    thumbnail: null,
  };
}

function prepared(scannedCode) {
  return {
    code: scannedCode,
    codeType: scannedCode ? 'CODE_128' : null,
    barcodeCropBlob: null,
    storageFiles: [],
    uploads: [{ mediaType: 'image/jpeg', data: 'AAAA' }],
  };
}

beforeEach(() => vi.clearAllMocks());

describe('readGifticonInfo — 어느 번호를 쓰나', () => {
  it('막대와 인쇄된 숫자가 갈리면 막대 쪽을 쓰고, 갈렸다는 말은 하지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue(modelSays('9999999999'));

    const info = await readGifticonInfo(prepared('1111111111'));

    expect(info.code).toBe('1111111111');
    // 갈렸다는 건 둘 중 하나가 틀렸다는 뜻인데, 틀린 쪽은 거의 항상 인쇄된 숫자다.
    // 막대에는 검산 자리가 있어 안 맞으면 값을 아예 안 내놓고, 눈으로 읽는 쪽에는
    // 그런 장치가 없다. 그걸 알리면 맞는 값을 놓고 사람을 세워두는 일이 대부분이 된다.
    expect(info).not.toHaveProperty('codeConflict');
  });

  it('여기서 막대를 못 읽어도, 부르는 쪽이 아는 번호가 있으면 그것을 쓴다', async () => {
    // 훑기는 tryHarder로 읽고 이쪽 decodeBarcode는 그냥 읽는다. 저쪽만 성공하는 사진이
    // 있는데, 그때 모델이 읽은 숫자로 흘러가면 훑기가 묶은 번호와 등록되는 번호가 갈린다.
    analyzeGifticonImages.mockResolvedValue(modelSays('9999999999'));

    const info = await readGifticonInfo(prepared(null), { knownCode: '1111111111' });

    expect(info.code).toBe('1111111111');
  });

  it('막대를 어디서도 못 읽었을 때만 인쇄된 숫자를 쓴다', async () => {
    analyzeGifticonImages.mockResolvedValue(modelSays('9999999999'));

    const info = await readGifticonInfo(prepared(null));

    expect(info.code).toBe('9999999999');
  });

  it('둘이 같으면 그대로 쓴다', async () => {
    analyzeGifticonImages.mockResolvedValue(modelSays('1111111111'));

    const info = await readGifticonInfo(prepared('1111111111'));

    expect(info.code).toBe('1111111111');
  });
});

// 파는 곳이 어디에도 안 적힌 기프티콘이 있다. 편의점 증정품 QR이 그렇다 — 상품명만
// 크게 박혀 있고 어느 편의점에서 쓰는지는 화면 어디에도 없다. 못 읽은 게 아니라 없는
// 것이라, 다시 찍어도 영영 안 나온다. 그것 때문에 등록을 막을 이유가 없다.
describe('상호와 상품명 중 하나만 읽혔을 때', () => {
  it('상호가 없으면 상품명으로 채운다', async () => {
    analyzeGifticonImages.mockResolvedValue({
      ...modelSays('9816401685019'),
      brand: '',
      name: '썬키스트)애사비제로스파클링500',
    });

    const info = await readGifticonInfo(prepared(null));

    expect(info.name).toBe('썬키스트)애사비제로스파클링500');
    expect(info.brand).toBe('썬키스트)애사비제로스파클링500');
  });

  it('상품명이 없으면 상호로 채운다', async () => {
    analyzeGifticonImages.mockResolvedValue({ ...modelSays('111'), name: '', brand: '스타벅스' });

    const info = await readGifticonInfo(prepared(null));

    expect(info.name).toBe('스타벅스');
    expect(info.brand).toBe('스타벅스');
  });

  // 이름도 파는 곳도 모르면 넣어봐야 목록에서 그게 무엇인지 알아볼 수가 없다.
  it('둘 다 없으면 채우지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue({ ...modelSays('111'), name: '', brand: '' });

    const info = await readGifticonInfo(prepared(null));

    expect(info.name).toBe('');
    expect(info.brand).toBeNull();
  });
});

// 훑기는 막대를 읽어 번호와 형식을 둘 다 들고 온다. 그런데 등록에 넘길 때 여기서 다시
// 읽다가 실패하면, 번호는 넘겨받은 것으로 살아남고 형식만 비어버렸다. 그러면 화면이
// 막대를 그릴 규격을 몰라 바코드를 아예 못 보여준다 — 계산대에서 못 쓰는 기프티콘이 된다.
describe('넘겨받은 바코드 형식', () => {
  it('여기서 못 읽었어도 부르는 쪽이 아는 형식을 쓴다', async () => {
    analyzeGifticonImages.mockResolvedValue(modelSays(''));

    const info = await readGifticonInfo(prepared(null), {
      knownCode: '713353422322',
      knownType: 'CODE_128',
    });

    expect(info.code).toBe('713353422322');
    expect(info.codeType).toBe('CODE_128');
  });
});
