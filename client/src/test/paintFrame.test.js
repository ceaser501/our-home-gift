import { describe, expect, it } from 'vitest';

// 사진 테두리를 보라로 칠하는 일.
//
// 이 기능의 약속은 '원본을 그대로 보낸다'였다. 바코드가 든 카드 안쪽을 한 픽셀이라도
// 칠하면 그 약속이 깨지고, 그건 '선물했는데 못 썼다'가 된다.
//
// 그래서 이 시험이 보는 것은 **칠해지는가**가 아니라 **안 칠해야 할 때 물러서는가**다.
// 칠하는 쪽은 한 판이면 되고, 물러서는 쪽이 넷이다.
//
// jsdom에는 캔버스가 없어서 필요한 만큼만 흉내 낸다 — getImageData / putImageData 둘뿐이다.

// 그림 한 장을 만든다. 테두리 색으로 채우고 가운데에 네모를 놓는다.
function makeImage({ w, h, border, inner, pad = 4 }) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const edge = x < pad || y < pad || x >= w - pad || y >= h - pad;
      const c = edge ? border : inner;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  return { w, h, data };
}

// paintFrame이 기대하는 만큼만 흉내 낸 2d 컨텍스트.
function fakeCtx(img) {
  let out = null;
  return {
    getImageData: () => ({ data: img.data, width: img.w, height: img.h }),
    putImageData: (d) => { out = d; },
    get painted() { return out !== null; },
    pixel(x, y) {
      const o = (y * img.w + x) * 4;
      return [img.data[o], img.data[o + 1], img.data[o + 2]];
    },
  };
}

const { paintFrame } = await import('../utils/shareGifticon');

const VIOLET = [0x5B, 0x4F, 0xE8];
const KAKAO_YELLOW = [0xFE, 0xE5, 0x00];
const WHITE = [0xFF, 0xFF, 0xFF];

function run(img) {
  const ctx = fakeCtx(img);
  const ok = paintFrame(ctx, 0, 0, img.w, img.h, VIOLET);
  return { ok, ctx };
}

describe('칠하는 경우', () => {
  it('카톡 노란 액자를 보라로 바꾼다', () => {
    const img = makeImage({ w: 40, h: 60, border: KAKAO_YELLOW, inner: WHITE });
    const { ok, ctx } = run(img);

    expect(ok).toBe(true);
    // 모서리는 보라가 됐다
    expect(ctx.pixel(0, 0)).toEqual(VIOLET);
    expect(ctx.pixel(39, 59)).toEqual(VIOLET);
  });

  it('⚠️ 카드 안쪽은 한 픽셀도 안 건드린다', () => {
    const img = makeImage({ w: 40, h: 60, border: KAKAO_YELLOW, inner: WHITE });
    run(img);

    // 안쪽(바코드가 있을 자리)이 전부 그대로여야 한다
    for (let y = 4; y < 56; y++) {
      for (let x = 4; x < 36; x++) {
        const o = (y * 40 + x) * 4;
        expect([img.data[o], img.data[o + 1], img.data[o + 2]]).toEqual(WHITE);
      }
    }
  });
});

describe('물러서는 경우 — 여기가 중요하다', () => {
  it('모서리 색이 제각각이면 안 칠한다', () => {
    // 액자가 아니라 그냥 사진이다.
    const img = makeImage({ w: 40, h: 60, border: KAKAO_YELLOW, inner: WHITE });
    // 한 모서리만 다른 색으로 바꾼다
    const o = ((59 * 40) + 39) * 4;
    img.data[o] = 10; img.data[o + 1] = 200; img.data[o + 2] = 90;

    const { ok, ctx } = run(img);
    expect(ok).toBe(false);
    expect(ctx.painted).toBe(false);
  });

  it('흰 배경은 안 칠한다', () => {
    // 흰 종이에 찍은 사진일 수 있다. 보라로 칠하면 사진을 망친다.
    const img = makeImage({ w: 40, h: 60, border: WHITE, inner: [200, 30, 30] });
    expect(run(img).ok).toBe(false);
  });

  it('검은 배경도 안 칠한다', () => {
    const img = makeImage({ w: 40, h: 60, border: [8, 8, 8], inner: [200, 30, 30] });
    expect(run(img).ok).toBe(false);
  });

  it('⚠️ 한가운데까지 번지면 안 칠한다', () => {
    // 테두리와 안쪽이 같은 색 = 액자가 아니라 단색 그림이다.
    const img = makeImage({ w: 41, h: 61, border: KAKAO_YELLOW, inner: KAKAO_YELLOW });
    const { ok, ctx } = run(img);
    expect(ok).toBe(false);
    expect(ctx.painted).toBe(false);
  });

  it('테두리가 절반을 넘게 먹으면 안 칠한다', () => {
    // pad가 커서 '테두리'가 사진의 대부분이다. 액자로 볼 수 없다.
    const img = makeImage({ w: 40, h: 60, border: KAKAO_YELLOW, inner: WHITE, pad: 14 });
    expect(run(img).ok).toBe(false);
  });

  it('그림을 못 꺼내면 조용히 물러선다', () => {
    const ctx = {
      getImageData: () => { throw new Error('tainted canvas'); },
      putImageData: () => { throw new Error('부르면 안 된다'); },
    };
    expect(paintFrame(ctx, 0, 0, 10, 10, VIOLET)).toBe(false);
  });
});

describe('색이 조금 흔들려도 같은 액자로 본다', () => {
  it('jpeg으로 눌린 만큼의 차이는 넘어간다', () => {
    const img = makeImage({ w: 40, h: 60, border: KAKAO_YELLOW, inner: WHITE });
    // 모서리 하나를 살짝 흔든다(압축 잡음 정도)
    const o = 0;
    img.data[o] = 0xFE - 9; img.data[o + 1] = 0xE5 + 7; img.data[o + 2] = 12;

    expect(run(img).ok).toBe(true);
  });
});
