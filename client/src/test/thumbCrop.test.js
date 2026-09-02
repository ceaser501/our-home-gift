import { describe, expect, it, vi, beforeEach } from 'vitest';

// 목록 썸네일. 모델이 짚어준 상품 사진 자리를 그대로 믿으면 안 된다.
//
// 실제로 이런 것들이 목록에 남았다 — 배스킨라빈스 카드의 '유효기간 연장 및 환불이
// 불가합니다'가 적힌 검은 상자, BBQ 카드의 바코드 블록. 모델은 "상품 사진이 있는 네모"를
// 물으면 화면에서 제일 큰 네모를 고르는 버릇이 있다.
//
// 프롬프트로도 막지만 그건 부탁이라, 우리가 아는 사실로 한 번 더 검산한다.

const analyzeGifticonImages = vi.fn();

vi.mock('../api', () => ({
  analyzeGifticonImages: (...args) => analyzeGifticonImages(...args),
  verifyGifticonName: () => Promise.resolve({ name: null, why: null }),
}));

const { readGifticonInfo, boxHolds, toSquare, looksLikeTextPanel } = await import('../utils/imageAnalyze');

beforeEach(() => vi.clearAllMocks());

// ── 막대 자리인가 ────────────────────────────────────────────────────────
//
// 막대 자리는 zxing이 이미 읽어뒀다(prepareImages). 짐작이 아니라 잰 값이라 프롬프트보다
// 단단하다. 막대의 가운데가 썸네일 네모 안에 들면 같은 자리를 가리킨 것으로 본다 —
// 1D 막대는 납작하고 QR은 네모라 모양이 제각각인데, 가운데 한 점이면 둘 다 똑같이 잰다.
describe('막대 자리를 짚었는지 보는 자', () => {
  // BBQ 카드가 그랬다. 노란 띠 아래 막대와 번호가 통째로 썸네일이 됐다.
  it('막대를 감싸는 네모는 걸러낸다', () => {
    const thumb = { x: 10, y: 40, width: 80, height: 40 };
    const barcode = { x: 20, y: 55, width: 60, height: 6 };

    expect(boxHolds(thumb, barcode)).toBe(true);
  });

  // 막대는 아래에 있고 상품 사진은 위에 있다. 이건 제대로 짚은 것이다.
  it('다른 자리를 짚었으면 통과시킨다', () => {
    const thumb = { x: 20, y: 5, width: 60, height: 30 };
    const barcode = { x: 20, y: 70, width: 60, height: 6 };

    expect(boxHolds(thumb, barcode)).toBe(false);
  });

  it('막대를 못 읽었으면 아무것도 걸러내지 않는다', () => {
    expect(boxHolds({ x: 0, y: 0, width: 100, height: 100 }, null)).toBe(false);
  });
});

// 사진이 두 장일 때, 막대가 있는 장과 상품 사진이 있는 장이 다르면 겹칠 일이 없다.
describe('막대가 다른 사진에 있으면', () => {
  it('같은 자리라도 상관하지 않는다', async () => {
    analyzeGifticonImages.mockResolvedValue({
      name: '아이스 아메리카노',
      brand: '스타벅스',
      amount: null,
      expiresAt: '2026-12-31',
      category: '카페',
      code: '1111111111',
      isVoucher: false,
      // 2번 사진을 가리키는데 들고 온 사진은 한 장뿐이라, 자를 대상이 없어 그대로 끝난다.
      thumbnail: { image: 2, x: 20, y: 55, width: 60, height: 30 },
    });

    const info = await readGifticonInfo({
      code: '1111111111',
      codeType: 'CODE_128',
      barcodeCropBlob: null,
      barcodeImage: 1,
      barcodeBox: { x: 20, y: 55, width: 60, height: 6 },
      storageFiles: [],
      uploads: [{ mediaType: 'image/jpeg', data: 'AAAA' }],
    });

    expect(info.thumbCropBlob).toBeNull();
  });
});

// ── 정사각형으로 맞추기 ──────────────────────────────────────────────────
//
// 목록 칸은 정사각형이라, 가로로 긴 그림을 넣으면 그 칸이 양옆을 다시 잘라낸다.
// 상품이 한쪽에 치우쳐 있으면 화면에서 사라진다.
describe('정사각형으로 맞출 때', () => {
  it('짧은 쪽을 가운데 기준으로 늘린다', () => {
    // 가로 60, 세로 20짜리를 60×60으로. 세로 가운데(30)를 지켜야 한다.
    expect(toSquare(10, 20, 60, 20, 200, 200)).toEqual({ x: 10, y: 0, side: 60 });
  });

  it('사진 가장자리에 닿으면 안쪽으로 민다', () => {
    // 오른쪽 끝에 붙은 네모. 밖으로 나가지 않게 왼쪽으로 밀린다.
    expect(toSquare(170, 10, 30, 60, 200, 200)).toEqual({ x: 140, y: 10, side: 60 });
  });

  it('사진보다 커질 수는 없다', () => {
    const square = toSquare(0, 0, 100, 40, 100, 40);
    expect(square.side).toBe(40);
    expect(square.x).toBeGreaterThanOrEqual(0);
    expect(square.y).toBe(0);
  });
});

// ── 글자판인가 사진인가 ──────────────────────────────────────────────────
//
// 배스킨라빈스 카드의 검은 약관 상자가 상품 사진으로 뽑혀 목록에 남았다.
// 글자판은 둘이 함께 나타난다 — 바탕색 하나가 거의 다 차지하고, 색이랄 게 없다.
function fakeCtx(pixel) {
  const side = 40;
  const data = new Uint8ClampedArray(side * side * 4);
  for (let i = 0; i < side * side; i += 1) {
    const [r, g, b] = pixel(i, side);
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return { getImageData: () => ({ data }), side };
}

describe('글자판인지 재는 자', () => {
  it('검은 바탕에 흰 글자는 글자판으로 본다', () => {
    // 90%는 검정 바탕, 10%만 흰 글자.
    const ctx = fakeCtx((i) => (i % 10 === 0 ? [255, 255, 255] : [10, 10, 10]));
    expect(looksLikeTextPanel(ctx, ctx.side, ctx.side)).toBe(true);
  });

  it('색이 흩어진 사진은 통과시킨다', () => {
    const ctx = fakeCtx((i) => [(i * 7) % 256, (i * 13) % 256, (i * 29) % 256]);
    expect(looksLikeTextPanel(ctx, ctx.side, ctx.side)).toBe(false);
  });

  // 흰 접시에 담긴 검은 커피처럼 색이 거의 없는 사진도 있다. 밝기가 흩어져 있으면
  // 글자판이 아니다 — 하나만 보고 버리면 이런 것이 억울하게 걸린다.
  it('색이 없어도 밝기가 흩어졌으면 사진으로 본다', () => {
    const ctx = fakeCtx((i) => {
      const v = (i * 3) % 256;
      return [v, v, v];
    });
    expect(looksLikeTextPanel(ctx, ctx.side, ctx.side)).toBe(false);
  });

  it('캔버스를 못 읽으면 버리지 않는다', () => {
    const broken = {
      getImageData: () => {
        throw new Error('tainted');
      },
    };
    expect(looksLikeTextPanel(broken, 40, 40)).toBe(false);
  });
});
