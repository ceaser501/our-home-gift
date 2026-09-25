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

const { paintFrame, violetHeader } = await import('../utils/shareGifticon');

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
    // 재는 자리(모서리에서 안쪽 pad만큼)를 다른 색으로 바꾼다.
    // pad = max(2, round(min(40,60) * 0.01)) = 2
    const o = ((57 * 40) + 37) * 4;
    img.data[o] = 10; img.data[o + 1] = 200; img.data[o + 2] = 90;

    const { ok, ctx } = run(img);
    expect(ok).toBe(false);
    expect(ctx.painted).toBe(false);
  });

  // 진짜 카톡 캡처에서 이것 때문에 한 번 물러섰다. 맨 끝 픽셀은 둥근 모서리와
  // 압축으로 섞여서, 넷이 (248,220,59)부터 (117,100,134)까지 벌어져 있었다.
  // 3px 안쪽은 넷 다 같은 노랑이었다.
  it('⚠️ 맨 끝 픽셀이 섞여 있어도 액자로 알아본다', () => {
    const img = makeImage({ w: 40, h: 60, border: KAKAO_YELLOW, inner: WHITE });
    // 네 모서리의 맨 끝 픽셀만 엉뚱한 색으로 더럽힌다
    [[0, 0], [39, 0], [0, 59], [39, 59]].forEach(([x, y]) => {
      const o = (y * 40 + x) * 4;
      img.data[o] = 117; img.data[o + 1] = 100; img.data[o + 2] = 134;
    });

    expect(run(img).ok).toBe(true);
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

// 액자는 단색이 아니다. 카톡 캡처는 카드 밑에 그림자가 깔려서 같은 노랑이
// (255,222,33)에서 (195,185,96)까지 흐른다. 기준색 하나에 매달렸더니 그 경사
// 중간에서 끊겨 맨 아래에 노란 줄이 남았다 — 2026-09-18에 실기에서 나왔다.
describe('그림자가 깔린 액자', () => {
  // 바깥에서 안으로 갈수록 어두워지는 테두리 + 한가운데 흰 카드
  function shaded({ w, h, from, to, pad }) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const depth = Math.min(x, y, w - 1 - x, h - 1 - y);
        let c;
        if (depth >= pad) {
          c = [255, 255, 255];                       // 카드
        } else {
          const t = depth / pad;                      // 0 바깥 → 1 안쪽
          c = from.map((v, i) => Math.round(v + (to[i] - v) * t));
        }
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    return { w, h, data };
  }

  // 액자가 그림의 3할쯤. 실제 카톡 캡처가 그 정도다(재보니 15%).
  const SHADED = { w: 100, h: 150, from: [255, 222, 33], to: [195, 185, 96], pad: 10 };

  it('⚠️ 경사를 끝까지 따라가 노란 줄을 안 남긴다', () => {
    const img = shaded(SHADED);
    const { ok } = run(img);
    expect(ok).toBe(true);

    // 카드 바로 바깥 한 줄(depth = pad-1)까지 보라가 됐는가 — 여기가 줄이 남던 자리다
    const o = ((75 * 100) + 9) * 4;
    expect([img.data[o], img.data[o + 1], img.data[o + 2]]).toEqual(VIOLET);
  });

  it('카드 안쪽은 여전히 그대로다', () => {
    const img = shaded(SHADED);
    run(img);
    const o = ((75 * 100) + 50) * 4;
    expect([img.data[o], img.data[o + 1], img.data[o + 2]]).toEqual(WHITE);
  });

  it('⚠️ 울타리 — 아주 완만한 경사를 타고 사진 속까지 걸어가지 않는다', () => {
    // 한 칸에 1씩만 흐르면 옆끼리는 늘 비슷해서, 울타리가 없으면 끝까지 걸어간다.
    const w = 200, h = 200;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const depth = Math.min(x, y, w - 1 - x, h - 1 - y);
        const v = Math.max(0, 200 - depth);          // 바깥 200 → 안쪽으로 1씩
        data[o] = v; data[o + 1] = Math.round(v * 0.8); data[o + 2] = 40; data[o + 3] = 255;
      }
    }
    const img = { w, h, data };
    run(img);

    // 한가운데는 기준색에서 90을 넘게 떨어져 있으니 안 칠해져야 한다
    const o = ((100 * w) + 100) * 4;
    expect([img.data[o], img.data[o + 1], img.data[o + 2]]).not.toEqual(VIOLET);
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

// 글자는 '띠'가 아니라 '보라 덩어리'의 한가운데에 놓여야 한다.
//
// 액자를 칠하고 나면 띠와 사진 위쪽 테두리가 이어져 보이는 보라가 두꺼워진다. 실측:
// 카톡 캡처는 띠가 87px인데 보라 머리가 128px이었고(액자가 41px 더), 글자는 87px
// 기준으로 놓여서 위에 붙어 보였다 — 2026-09-18에 실기에서 나왔다.
describe('보라 머리 재기', () => {
  const V = [0x5B, 0x4F, 0xE8];

  // 위 band줄은 띠(보라), 그 아래 extra줄은 칠해진 액자(보라), 그다음이 내용.
  function canvas({ w, band, extra, h }) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const violet = y < band + extra;
        const c = violet ? V : [255, 255, 255];
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    return {
      getImageData: (x, y, gw, gh) => {
        const out = new Uint8ClampedArray(gw * gh * 4);
        for (let yy = 0; yy < gh; yy++) {
          for (let xx = 0; xx < gw; xx++) {
            const from = ((y + yy) * w + (x + xx)) * 4;
            const to = (yy * gw + xx) * 4;
            out[to] = data[from]; out[to + 1] = data[from + 1];
            out[to + 2] = data[from + 2]; out[to + 3] = 255;
          }
        }
        return { data: out, width: gw, height: gh };
      },
    };
  }

  it('액자가 칠해졌으면 그만큼 더 내려간다', () => {
    // 띠 40 + 액자 25 = 보라 머리 65
    const ctx = canvas({ w: 30, band: 40, extra: 25, h: 200 });
    expect(violetHeader(ctx, 30, 40, 160)).toBe(65);
  });

  it('액자가 없으면 띠에서 멈춘다', () => {
    const ctx = canvas({ w: 30, band: 40, extra: 0, h: 200 });
    expect(violetHeader(ctx, 30, 40, 160)).toBe(40);
  });

  it('⚠️ 온통 보라여도 띠의 두 배를 안 넘는다', () => {
    // 이걸 안 막으면 글자가 사진 한복판에 떨어진다.
    const ctx = canvas({ w: 30, band: 40, extra: 1000, h: 200 });
    expect(violetHeader(ctx, 30, 40, 160)).toBe(80);
  });

  it('그림을 못 꺼내면 띠 그대로 쓴다', () => {
    const ctx = { getImageData: () => { throw new Error('tainted'); } };
    expect(violetHeader(ctx, 30, 40, 160)).toBe(40);
  });
});

// 카톡 선물함은 상품 사진을 액자와 **같은 노랑** 위에 얹는다(상품 그림이 투명 배경).
// 번지기가 상품 둘레를 다 돌아 들어가서, 치킨만 보라 바탕에 오려 붙인 꼴이 됐다 —
// 2026-09-25 실기(BBQ)에서 나왔다.
describe('액자와 같은 색의 상품 칸', () => {
  const Y = [255, 222, 33];
  const RED = [200, 40, 30];
  const W = 100, H = 160, F = 8;          // 액자 두께 8
  const CARD_TOP = 60;                    // 카드는 60부터 아래 — 실제처럼 한가운데가 카드다
  const NOTCH = { y: 120, r: 4 };         // 카드 옆구리 반달 홈

  // 노란 바탕 + 위쪽에 빨간 상품 + 아래쪽 흰 카드(옆구리에 반달 홈)
  function kakao() {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let c = Y;
        const inCard = y >= CARD_TOP && y < H - F && x >= F && x < W - F;
        const inNotch = Math.hypot(x - F, y - NOTCH.y) < NOTCH.r || Math.hypot(x - (W - 1 - F), y - NOTCH.y) < NOTCH.r;
        if (inCard && !inNotch) c = WHITE;
        if (y >= 20 && y < 45 && x >= 30 && x < 70) c = RED;   // 상품
        const o = (y * W + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    return { w: W, h: H, data };
  }
  const px = (img, x, y) => { const o = (y * W + x) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2]]; };

  it('바깥 액자는 보라가 된다', () => {
    const img = kakao();
    expect(run(img).ok).toBe(true);
    expect(px(img, 2, 2)).toEqual(VIOLET);
    expect(px(img, 2, 100)).toEqual(VIOLET);
    expect(px(img, 50, H - 2)).toEqual(VIOLET);
  });

  it('⚠️ 상품 칸의 노랑은 남긴다', () => {
    const img = kakao();
    run(img);
    // 상품 바로 옆과 상품과 카드 사이 — 번지기가 돌아 들어가던 자리
    expect(px(img, 20, 30)).toEqual(Y);
    expect(px(img, 50, 52)).toEqual(Y);
    expect(px(img, 50, 30)).toEqual(RED);
  });

  it('상품 위로는 액자 두께만큼 노랑을 남겨 상자처럼 보이게 한다', () => {
    const img = kakao();
    run(img);
    // 상품 윗변(20)에서 조금 위는 노랑, 맨 위 액자는 보라
    expect(px(img, 50, 16)).toEqual(Y);
    expect(px(img, 50, 1)).toEqual(VIOLET);
  });

  it('⚠️ 카드 옆구리 반달 홈은 칠한다 — 남기면 보라 액자에 노란 반달이 박힌다', () => {
    const img = kakao();
    run(img);
    expect(px(img, F + 1, NOTCH.y)).toEqual(VIOLET);
    expect(px(img, W - 2 - F, NOTCH.y)).toEqual(VIOLET);
  });

  it('카드 안쪽은 그대로다', () => {
    const img = kakao();
    run(img);
    expect(px(img, 50, 130)).toEqual(WHITE);
  });
});
