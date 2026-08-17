import { describe, expect, it, vi, beforeEach } from 'vitest';

// 막대를 못 읽으면 대신 쓸 것이 인쇄된 숫자를 모델이 눈으로 읽은 값뿐이다. 그건 검산
// 자리가 없어서 6을 5로 읽어도 그냥 5가 된다 — 매장에서 안 찍히는 번호가 저장되고,
// 뒤늦게 알아볼 방법도 없다. 그러니 넘기기 전에 한 번 더 애써봐야 한다.
//
// 등록 화면은 한 번만 보고 있었다. 사진첩 훑기 쪽에는 있는 두 번째 판이 여기엔 없었다.

const attempts = [];
const answers = { plain: null, deep: null };

class FakeReader {
  constructor(hints) {
    this.deep = Boolean(hints);
  }

  async decodeFromCanvas() {
    const kind = this.deep ? 'deep' : 'plain';
    attempts.push(kind);
    if (!answers[kind]) throw new Error('못 읽음');
    return {
      getText: () => answers[kind],
      getBarcodeFormat: () => 1,
      // 좌표가 없으면 바코드를 잘라내지 않는다. 자르는 일은 캔버스가 필요해서 여기선 뺀다.
      getResultPoints: () => [],
    };
  }
}

vi.mock('@zxing/browser', () => ({ BrowserMultiFormatReader: FakeReader }));
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { 1: 'CODE_128' },
  DecodeHintType: { TRY_HARDER: 'TRY_HARDER' },
}));
vi.mock('../api', () => ({ analyzeGifticonImages: vi.fn() }));
vi.mock('../utils/scanCache', () => ({ readCachedInfo: () => null, writeCachedInfo: () => {} }));

const { decodeBarcode } = await import('../utils/imageAnalyze');

beforeEach(() => {
  attempts.length = 0;
  answers.plain = null;
  answers.deep = null;
});

describe('등록 화면이 막대를 읽는 방법', () => {
  it('한 번에 읽히면 두 번 보지 않는다', async () => {
    answers.plain = '713353422322';

    const found = await decodeBarcode({});

    expect(found.code).toBe('713353422322');
    expect(attempts).toEqual(['plain']);
  });

  // 흐릿하거나 막대가 작게 찍힌 사진이다. 여기서 포기하면 눈으로 읽은 숫자가 대신 들어간다.
  it('처음에 못 읽으면 정밀 탐색으로 한 번 더 본다', async () => {
    answers.deep = '713353422322';

    const found = await decodeBarcode({});

    expect(found.code).toBe('713353422322');
    expect(found.codeType).toBe('CODE_128');
    expect(attempts).toEqual(['plain', 'deep']);
  });

  it('두 번 다 못 읽으면 번호 없이 넘긴다', async () => {
    const found = await decodeBarcode({});

    expect(found.code).toBeNull();
    expect(attempts).toEqual(['plain', 'deep']);
  });
});
