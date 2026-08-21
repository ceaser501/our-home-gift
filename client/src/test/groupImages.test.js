import { describe, expect, it, vi, beforeEach } from 'vitest';

// 직접 고른 사진을 묶는 규칙. 사진첩 훑기와 같은 collect()를 쓰므로, 여기서 보는 것은
// "훑기와 같은 규칙이 적용되는가"다. 두 벌로 갈라지면 "훑으면 묶이는데 직접 올리면
// 안 묶인다" 같은 일이 생긴다.
//
// 캔버스와 zxing은 jsdom에 없다. 사진 한 장이 어떤 바코드를 갖는지만 정해주고, 묶고
// 고르는 판단은 진짜를 돌린다 — 거기가 볼 곳이다.

// 파일 이름 → 그 사진에서 읽힐 바코드. 테스트마다 갈아끼운다.
let barcodes = new Map();
// 파일 이름 → 그 사진의 픽셀 모양.
//   { ink, color } — 그림이 얼마나 차 있고 그중 색이 있는 것이 얼마인지. infoRichness가
//                    이 둘을 더해서 본다. color는 ink 이하여야 한다.
//   { bars: true } — 세로 줄무늬. looksLikeBarcode가 막대로 보는 것.
// 안 적으면 못 보는 사진으로 둔다 — 실제 앱에서도 캔버스를 못 읽으면 그렇게 넘어간다.
let pixels = new Map();

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
  pixels = new Map();
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
        getImageData(_x, _y, width, height) {
          const spec = pixels.get(el.dataset.name);
          if (!spec) throw new Error('픽셀을 볼 수 없음');
          const data = new Uint8ClampedArray(width * height * 4).fill(255);
          if (spec.bars) {
            // 줄마다 같은 자리에서 밝기가 뒤집히는 세로 줄무늬. 막대의 조건이다.
            for (let y = 0; y < height; y += 1) {
              for (let x = 0; x < width; x += 1) {
                const value = x % 4 < 2 ? 0 : 255;
                const i = (y * width + x) * 4;
                data[i] = value;
                data[i + 1] = value;
                data[i + 2] = value;
              }
            }
          } else {
            // 흰 바탕에 정해준 비율만큼 칠한다. 앞쪽은 빨강(색이 있는 픽셀), 뒤는 검정.
            const total = width * height;
            const colored = Math.round(total * (spec.color ?? 0));
            const inked = Math.round(total * (spec.ink ?? 0));
            for (let p = 0; p < inked; p += 1) {
              const i = p * 4;
              data[i] = p < colored ? 255 : 0;
              data[i + 1] = 0;
              data[i + 2] = 0;
            }
          }
          return { data };
        },
      });
      // 줄인 base64. 실제 픽셀은 볼 일이 없다.
      el.toDataURL = () => `data:image/jpeg;base64,${btoa(el.dataset.name || 'x')}`;
    }
    return el;
  });
});

// 파일 이름은 아스키로 둔다. 아래 가짜 캔버스가 이름을 btoa로 감싸 base64를 흉내내는데,
// btoa는 한글을 못 받고 통째로 예외를 낸다 — 사진을 못 읽은 것으로 취급되어 후보가 0이 된다.
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

  // 앱 화면을 통째로 찍은 캡처가 여기 걸린다. 68px짜리 썸네일 안의 막대도 zxing은
  // 읽어내서 번호는 맞는데, 그 그림에는 다른 기프티콘이 같이 찍혀 있다. 실제로 스타벅스
  // 쿠폰에 옆칸 BBQ의 26,500원과 2026.11.04가 들어갔다.
  //
  // 예전에는 그것밖에 없으면 "그거라도 쓰자"였다. 등록이 막히는 것보다 낫다고 봤는데,
  // 틀린 값이 들어간 기프티콘은 화면상 멀쩡해서 아무도 안 고친다. 빈칸보다 나쁘다.
  it('작게 찍힌 것밖에 없으면 표시를 달아 넘긴다', async () => {
    barcodes.set('tiny.jpg', { code: '111', coverage: 0.15 });

    const { candidates, tally } = await groupImages([pick('tiny.jpg')]);

    // 후보에서 빼지는 않는다. 몇 건인지 세는 쪽(등록 화면이 다건으로 넘길지 정할 때)은
    // 이것도 한 건으로 세야, 작게 찍힌 다른 기프티콘이 옆 건에 통째로 합쳐지지 않는다.
    expect(candidates).toHaveLength(1);
    expect(candidates[0].tooSmall).toBe(true);
    expect(tally.tooSmall).toBe(1);
  });

  it('큰 사진이 한 장이라도 있으면 표시를 달지 않는다', async () => {
    barcodes.set('big.jpg', { code: '111', coverage: 0.6 });
    barcodes.set('tiny.jpg', { code: '111', coverage: 0.05 });

    const { candidates, tally } = await groupImages([pick('big.jpg'), pick('tiny.jpg')]);

    expect(candidates[0].tooSmall).toBe(false);
    expect(tally.tooSmall).toBe(0);
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

  // 바코드가 없는 사진을 여기서 아무 데도 붙이지 않는다.
  //
  // 한때 후보가 하나뿐이면 그 건에 붙였다. 그런데 바코드 없이 번호만 인쇄된 기프티콘이
  // 있어서(파인트 아이스크림 쿠폰) 그것까지 곁가지로 빨려 들어갔다. 곁가지인지 딴
  // 물건인지는 서버가 읽어야 아는 것이라, 그림을 들려 missed로 돌려보내고 판단은
  // 화면에 맡긴다(GalleryScanSheet의 rescued·foldRescued).
  it('바코드 없는 사진은 그림을 들려 missed로 돌려준다', async () => {
    barcodes.set('original.jpg', { code: '111', coverage: 0.5 });
    // info-shot.jpg는 등록하지 않는다 — 바코드가 없다.

    const { candidates, missed, tally } = await groupImages([pick('original.jpg'), pick('info-shot.jpg')]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].images).not.toContain(btoa('info-shot.jpg'));
    expect(missed).toHaveLength(1);
    // 그림이 없으면 화면이 서버에 물어볼 수가 없다.
    expect(missed[0].data).toBe(btoa('info-shot.jpg'));
    expect(tally.noCode).toBe(1);
  });

  it('후보가 여럿이면 붙이지 않고 뺀다 — 어느 것 옆에 붙는지 알 수 없다', async () => {
    barcodes.set('a.jpg', { code: '111', coverage: 0.6 });
    barcodes.set('b.jpg', { code: '222', coverage: 0.6 });

    const { candidates, missed, tally } = await groupImages([pick('a.jpg'), pick('b.jpg'), pick('c.jpg')]);

    expect(candidates).toHaveLength(2);
    expect(missed).toHaveLength(1);
    expect(tally.noCode).toBe(1);
  });

  // 카톡이 404픽셀로 줄여 보낸 배스킨 카드가 여기 걸린다. 우리가 못 읽었을 뿐 다른
  // 기프티콘일 수 있으니 옆 건에 붙이지 않는다. 대신 직접 올려달라고 알린다.
  it('막대로 보이는데 못 읽은 사진은 붙이지 않고 따로 센다', async () => {
    barcodes.set('original.jpg', { code: '111', coverage: 0.5 });
    pixels.set('baskin.jpg', { bars: true });

    const { candidates, missed, tally } = await groupImages([pick('original.jpg'), pick('baskin.jpg')]);

    expect(candidates[0].images).not.toContain(btoa('baskin.jpg'));
    expect(missed).toHaveLength(1);
    expect(tally.unreadable).toBe(1);
    expect(tally.noCode).toBe(0);
  });

  // 폴더를 모르는 사진(직접 고른 것)에서 무엇을 대표로 보낼지.
  //
  // 예전에는 "바코드가 크게 찍힌 순서"뿐이라 바코드만 큰 캡처가 늘 1등이었다. 상품명도
  // 기한도 없는 그림이 모델에게 갔고, 사용자에게는 "원본을 놔두고 스크린샷을 잡는다"로
  // 보였다. 실측값은 gallery.js의 MIN_INFO_INK 주석에 있다.
  it('바코드만 큰 캡처보다 글자가 있는 원본을 먼저 보낸다', async () => {
    barcodes.set('original.jpg', { code: '111', coverage: 0.45 });
    barcodes.set('barcode-shot.jpg', { code: '111', coverage: 0.9 });
    pixels.set('original.jpg', { ink: 0.435, color: 0.283 });
    pixels.set('barcode-shot.jpg', { ink: 0.031, color: 0 });

    const { candidates } = await groupImages([pick('barcode-shot.jpg'), pick('original.jpg')]);

    expect(candidates[0].images[0]).toBe(btoa('original.jpg'));
  });

  // 태수님이 올린 스타벅스 두 장을 그대로 옮긴 값이다. 둘 다 상품명과 바코드가 있어
  // 거름망은 통과하는데, 유효기간은 원본에만 적혀 있다. 예전에는 coverage로 줄을 세워서
  // 스크린샷이 앞섰다 — "원본을 놔두고 스크린샷을 잡는다"가 이 줄이었다.
  it('둘 다 읽을 것이 있으면 더 꽉 찬 쪽을 먼저 보낸다', async () => {
    barcodes.set('original.jpg', { code: '111', coverage: 0.477 });
    barcodes.set('screenshot.jpg', { code: '111', coverage: 0.512 });
    pixels.set('original.jpg', { ink: 0.587, color: 0.436 });
    pixels.set('screenshot.jpg', { ink: 0.344, color: 0.16 });

    const { candidates } = await groupImages([pick('screenshot.jpg'), pick('original.jpg')]);

    expect(candidates[0].images[0]).toBe(btoa('original.jpg'));
  });

  // 어느 쪽이 원본인지 그림만 보고 맞히는 규칙은 틀릴 수 있다. 기프티쇼 카드는 발행사가
  // 만든 것인데도 흰 바탕에 검은 글자뿐이라 값이 낮게 나온다(색 0.253으로 원본 중 최저).
  // 그때 그 사진을 버리면 거기에만 있는 유효기간이 통째로 사라진다. 뒤로 밀 뿐 버리지
  // 않는다 — 모델은 여러 장을 한 번에 보고 빈칸을 서로 채운다.
  it('값이 낮게 나온 사진도 버리지 않고 뒤에 붙여 보낸다', async () => {
    barcodes.set('rich.jpg', { code: '111', coverage: 0.5 });
    barcodes.set('plain.jpg', { code: '111', coverage: 0.5 });
    pixels.set('rich.jpg', { ink: 0.56, color: 0.436 });
    // 기프티쇼처럼 흰 바탕에 검은 글자뿐이라 합이 거름망 아래로 떨어진 경우.
    pixels.set('plain.jpg', { ink: 0.2, color: 0.02 });

    const { candidates } = await groupImages([pick('plain.jpg'), pick('rich.jpg')]);

    expect(candidates[0].images[0]).toBe(btoa('rich.jpg'));
    expect(candidates[0].images).toHaveLength(2);
  });

  it('한 건뿐이면 후보도 하나다 — 등록 창이 이걸 보고 넘길지 정한다', async () => {
    barcodes.set('a.jpg', { code: '111', coverage: 0.6 });
    barcodes.set('b.jpg', { code: '111', coverage: 0.6 });

    const { candidates } = await groupImages([pick('a.jpg'), pick('b.jpg')], { quick: true });

    expect(candidates).toHaveLength(1);
  });
});
