import { describe, expect, it, vi, beforeEach } from 'vitest';

// 상품명만 한 번 더 읽히는 길.
//
// 틀리는 항목이 상품명 하나로 몰려 있다. 금액·기한·상호는 숫자거나 아는 이름이라 잘
// 읽는데, 상품명은 처음 보는 한글 덩어리라 획 하나로 갈린다(떠먹는 → 따먹는). 게다가
// 틀린 방식이 조용해서 멀쩡한 이름처럼 등록된다.
//
// ── 잘라 보내다가 걷어낸 이야기 ──────────────────────────────────────────────
// 한때 상품명 네모만 잘라 보냈다. 값이 3분의 1이라 그게 나아 보였는데, 좌표가 엉뚱한 데를
// 짚으면 저쪽은 거기 있는 글자를 정직하게 읽어오고 그 값으로 맞게 읽은 이름이 덮인다.
// 배스킨라빈스 카드처럼 맨 위 띠의 인사말("받아랏 내마음")이 제일 크게 적힌 카드가 그렇다.
//
// 막으려고 "앞서 읽은 이름과 너무 다르면 물리친다"를 넣었다가 그것도 걷어냈다. 못 믿는
// 쪽을 자로 삼는 셈이라, 하이쿠가 크게 틀릴수록("또망는 케이크") 맞는 교정을 더 확실히
// 막았다. 게다가 "이쪽이 맞고 하이쿠가 많이 틀림"과 "네모가 딴 데를 짚음"은 둘 다
// "크게 다름"으로 보여서 애초에 가를 수가 없다.
//
// 그래서 사진 한 장을 통째로 준다. 저쪽이 스스로 상품명을 찾으니 좌표가 필요 없고,
// 발행사마다 카드 생김새가 달라도 손댈 것이 없다.

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

function serverSays(extra) {
  return {
    name: '따먹는 스트로베리 케이크',
    nameImage: 2,
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

// 썸네일은 자르지 않게 비워 둔다. 자르는 쪽은 캔버스가 필요한데 jsdom에는 없다.
const FIRST = { mediaType: 'image/jpeg', data: '1번사진' };
const SECOND = { mediaType: 'image/jpeg', data: '2번사진' };
const prepared = { code: '713353422322', codeType: 'CODE_128', uploads: [FIRST, SECOND], storageFiles: [] };

beforeEach(() => {
  analyzeGifticonImages.mockReset();
  verifyGifticonName.mockReset();
});

describe('상품명 재확인', () => {
  // 한 글자든 통째로든, 다시 읽어온 값을 그대로 쓴다. 앞서 읽은 이름과 얼마나 다른지는
  // 보지 않는다 — 그 자를 대면 "또망는 케이크"처럼 크게 틀린 것을 못 고친다.
  it('다시 읽어온 이름으로 갈아끼운다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays());
    verifyGifticonName.mockResolvedValue({ name: '떠먹는 스트로베리 케이크', why: null });

    const info = await readGifticonInfo(prepared);

    expect(info.name).toBe('떠먹는 스트로베리 케이크');
    expect(info.meta.nameChanged).toBe(true);
    expect(info.meta.nameBefore).toBe('따먹는 스트로베리 케이크');
  });

  it('통째로 틀린 것도 고친다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ name: '또망는 케이크' }));
    verifyGifticonName.mockResolvedValue({ name: '떠먹는 스트로베리 케이크', why: null });

    const info = await readGifticonInfo(prepared);

    expect(info.name).toBe('떠먹는 스트로베리 케이크');
  });

  // 상품명이 어느 사진에 있는지는 앞선 분석이 알려준다. 두 번째 사진에 있다고 했으면
  // 두 번째를 보내야 한다 — 첫 장을 보내면 거기엔 이름이 없어서 확인이 헛돈다.
  it('상품명이 있다고 한 사진을 보낸다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ nameImage: 2 }));
    verifyGifticonName.mockResolvedValue({ name: '떠먹는 스트로베리 케이크', why: null });

    await readGifticonInfo(prepared);

    expect(verifyGifticonName).toHaveBeenCalledWith(SECOND);
  });

  // 확인은 이미 나온 답을 낫게 만드는 곁가지다. 여기서 막혔다고 이름이 사라지면 안 된다.
  it('다시 읽지 못하면 앞서 읽은 이름이 남는다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays());
    verifyGifticonName.mockResolvedValue({ name: null, why: '서버 오류' });

    const info = await readGifticonInfo(prepared);

    expect(info.name).toBe('따먹는 스트로베리 케이크');
    expect(info.meta.nameUnchecked).toBe(true);
  });

  // 이 함수는 { name, why }를 준다. 한때 그 덩어리를 통째로 info.name에 넣었고,
  // 화면이 객체를 글자 자리에 그리려다 자동스캔이 하얗게 죽었다. 목이 문자열을
  // 돌려주고 있어서 테스트는 멀쩡히 지나갔다 — 그래서 타입까지 본다.
  it('이름 자리에는 늘 글자만 들어간다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays());
    verifyGifticonName.mockResolvedValue({ name: '떠먹는 스트로베리 케이크', why: null });

    const info = await readGifticonInfo(prepared);

    expect(typeof info.name).toBe('string');
  });

  // 왜 확인을 못 했는지는 화면에 적힌다(테스트 빌드). 이유가 안 실려 오면 그 자리가 빈다.
  it('확인에 실패하면 이유를 남긴다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays());
    verifyGifticonName.mockResolvedValue({ name: null, why: '답이 잘림' });

    const info = await readGifticonInfo(prepared);

    expect(info.meta.verifyWhy).toBe('답이 잘림');
  });

  it('둘이 같게 읽었으면 아무 표시도 남기지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ name: '아이스 아메리카노 T' }));
    verifyGifticonName.mockResolvedValue({ name: '아이스 아메리카노 T', why: null });

    const info = await readGifticonInfo(prepared);

    expect(info.name).toBe('아이스 아메리카노 T');
    expect(info.meta.nameChanged).toBeUndefined();
    expect(info.meta.nameUnchecked).toBeUndefined();
  });

  // 이름을 아예 못 읽은 건은 확인할 것이 없다. 빈칸을 물어봐야 값만 나간다.
  it('이름이 비어 있으면 물어보지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ name: '', nameImage: null }));

    const info = await readGifticonInfo(prepared);

    expect(info.name).toBe('');
    expect(verifyGifticonName).not.toHaveBeenCalled();
  });

  // 함수가 아직 옛것이면 nameImage가 안 온다. 그때 이름이 사라지면 안 된다.
  it('옛 함수가 사진 번호를 안 주면 확인을 건너뛴다', async () => {
    analyzeGifticonImages.mockResolvedValue(serverSays({ nameImage: undefined }));

    const info = await readGifticonInfo(prepared);

    expect(info.name).toBe('따먹는 스트로베리 케이크');
    expect(info.meta.nameUnchecked).toBe(true);
    expect(verifyGifticonName).not.toHaveBeenCalled();
  });
});
