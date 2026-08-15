import { describe, expect, it, vi, beforeEach } from 'vitest';

// 직접 고른 사진을 묶는 규칙. 사진첩 훑기와 같은 collect()를 쓰므로, 여기서 보는 것은
// "훑기와 같은 규칙이 적용되는가"다. 두 벌로 갈라지면 "훑으면 묶이는데 직접 올리면
// 안 묶인다" 같은 일이 생긴다.
//
// 캔버스와 zxing은 jsdom에 없다. 사진 한 장이 어떤 바코드를 갖는지만 정해주고, 묶고
// 고르는 판단은 진짜를 돌린다 — 거기가 볼 곳이다.

// 파일 이름 → 그 사진에서 읽힐 바코드. 테스트마다 갈아끼운다.
let barcodes = new Map();

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    async decodeFromCanvas(canvas) {
      const found = barcodes.get(canvas.dataset.name);
      if (!found) throw new Error('not found');
      return {
        getText: () => found.code,
        getBarcodeFormat: () => 1,
        // 가로 폭의 몇 할을 차지하는지를 좌표 두 점으로 흉내낸다. 바코드가 너무 작게
        // 찍힌 사진을 빼는 규칙(MIN_BARCODE_COVERAGE)이 이 값을 본다.
        getResultPoints: () => [
          { getX: () => 0, getY: () => 0 },
          { getX: () => canvas.width * found.coverage, getY: () => 0 },
        ],
      };
    }
  },
}));

vi.mock('@zxing/library', () => ({
  BarcodeFormat: { 1: 'CODE_128' },
  DecodeHintType: { TRY_HARDER: 'TRY_HARDER' },
}));

const { groupImages } = await import('../utils/gallery');

// 캔버스도 이미지 로딩도 jsdom에는 없다. 사진 한 장이 그림 한 장으로 이어지도록,
// 파일 이름을 캔버스까지 들고 간다 — 위 가짜 판독기가 그 이름으로 답을 고른다.
beforeEach(() => {
  vi.restoreAllMocks();
  barcodes = new Map();
  localStorage.clear();

  let loading = null;
  globalThis.URL.createObjectURL = (file) => {
    loading = file.name;
    return `blob:${file.name}`;
  };
  globalThis.URL.revokeObjectURL = () => {};

  globalThis.Image = class {
    set src(value) {
      this._name = value.startsWith('blob:') ? value.slice(5) : loading;
      setTimeout(() => this.onload?.(), 0);
    }
    get naturalWidth() {
      return 1000;
    }
    get naturalHeight() {
      return 2000;
    }
  };

  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = realCreate(tag);
    if (tag === 'canvas') {
      el.getContext = () => ({
        drawImage(image) {
          el.dataset.name = image._name;
        },
        set imageSmoothingEnabled(_v) {},
        set imageSmoothingQuality(_v) {},
      });
      // 줄인 base64. 실제 픽셀은 볼 일이 없다.
      el.toDataURL = () => `data:image/jpeg;base64,${btoa(el.dataset.name || 'x')}`;
    }
    return el;
  });
});

function pick(name) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

describe('groupImages — 고른 사진을 묶는다', () => {
  it('바코드가 같은 사진은 한 건으로 묶는다', async () => {
    barcodes.set('a.jpg', { code: '111', coverage: 0.6 });
    barcodes.set('b.jpg', { code: '111', coverage: 0.5 });
    barcodes.set('c.jpg', { code: '222', coverage: 0.6 });

    const { candidates } = await groupImages([pick('a.jpg'), pick('b.jpg'), pick('c.jpg')]);

    expect(candidates.map((c) => c.code)).toEqual(['111', '222']);
    // 같은 번호의 두 장이 함께 등록에 넘어가야 한다. 원본에만 유효기간이 있고 캡처에는
    // 바코드만 있는 식이라, 한 장만 넘기면 빈칸이 남는다.
    expect(candidates[0].images).toHaveLength(2);
  });

  it('바코드가 너무 작게 찍힌 사진은 빼고 고른다', async () => {
    // 목록 화면을 통째로 찍은 캡처. 같은 번호를 담고 있어도 읽을 정보가 없고, 옆에 찍힌
    // 다른 기프티콘의 유효기간을 이 기프티콘 것으로 읽어올 수 있다.
    barcodes.set('big.jpg', { code: '111', coverage: 0.6 });
    barcodes.set('tiny.jpg', { code: '111', coverage: 0.05 });

    const { candidates } = await groupImages([pick('big.jpg'), pick('tiny.jpg')]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].images).toHaveLength(1);
  });

  it('이미 등록된 번호는 후보에서 뺀다', async () => {
    barcodes.set('a.jpg', { code: '111', coverage: 0.6 });
    barcodes.set('b.jpg', { code: '222', coverage: 0.6 });

    const { candidates, tally } = await groupImages([pick('a.jpg'), pick('b.jpg')], {
      isRegistered: async (code) => code === '111',
    });

    expect(candidates.map((c) => c.code)).toEqual(['222']);
    expect(tally.alreadyHave).toBe(1);
  });

  it('바코드를 못 읽은 사진은 missed로 돌려준다', async () => {
    barcodes.set('a.jpg', { code: '111', coverage: 0.6 });
    // b.jpg는 등록하지 않는다 — 판독기가 못 찾는다.

    const { candidates, missed } = await groupImages([pick('a.jpg'), pick('b.jpg')]);

    expect(candidates).toHaveLength(1);
    expect(missed).toHaveLength(1);
  });

  it('한 건뿐이면 후보도 하나다 — 등록 창이 이걸 보고 넘길지 정한다', async () => {
    barcodes.set('a.jpg', { code: '111', coverage: 0.6 });
    barcodes.set('b.jpg', { code: '111', coverage: 0.6 });

    const { candidates } = await groupImages([pick('a.jpg'), pick('b.jpg')], { quick: true });

    expect(candidates).toHaveLength(1);
  });
});
