import { describe, expect, it } from 'vitest';

// 공유 사진의 액자 자르기와 검은 여백 자르기.
//
// 이 기능의 약속은 '원본을 그대로 보낸다'였다. 바코드가 든 카드 안쪽을 한 픽셀이라도
// 바꾸면 그 약속이 깨지고, 그건 '선물했는데 못 썼다'가 된다.
//
// 그래서 이 시험이 보는 것은 **잘라내는가**보다 **안 건드려야 할 때 물러서는가**다.
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

// cropFrame이 기대하는 만큼만 흉내 낸 2d 컨텍스트.
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

const { cropFrame, trimLetterbox } = await import('../utils/shareGifticon');

// 자른 뒤 남는 액자 조각을 칠하는 바탕색(연보라)
const BG = [0xF0, 0xEF, 0xFF];
const KAKAO_YELLOW = [0xFE, 0xE5, 0x00];
const WHITE = [0xFF, 0xFF, 0xFF];

function run(img) {
  const ctx = fakeCtx(img);
  const box = cropFrame(ctx, 0, 0, img.w, img.h, BG);
  return { ok: box !== null, box, ctx };
}

describe('자르는 경우', () => {
  it('카톡 노란 액자를 잘라낸다 — 카드만 남는다', () => {
    const img = makeImage({ w: 40, h: 60, border: KAKAO_YELLOW, inner: WHITE });
    const { box } = run(img);
    expect(box).toEqual({ x: 4, y: 4, w: 32, h: 52 });
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
    // 흰 종이에 찍은 사진일 수 있다. 잘라내면 사진을 망친다.
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
    expect(cropFrame(ctx, 0, 0, 10, 10, BG)).toBe(null);
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
    const { box } = run(img);
    // 카드 바로 바깥 한 줄(depth = pad-1)까지 잘려야 한다 — 여기가 줄이 남던 자리다
    expect(box).toEqual({ x: 10, y: 10, w: 80, h: 130 });
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

    // 한가운데는 기준색에서 90을 넘게 떨어져 있으니 잘려 나가면 안 된다
    // 여기서는 번진 넓이가 절반을 넘어서 아예 물러선다. 물러서지 않더라도 한가운데는
    // 남아 있어야 한다.
    const { box } = run(img);
    if (box) {
      expect(box.x).toBeLessThan(100);
      expect(box.x + box.w).toBeGreaterThan(100);
    }
    const o = ((100 * w) + 100) * 4;
    expect([img.data[o], img.data[o + 1], img.data[o + 2]]).not.toEqual(BG);
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

// 카톡 선물함은 상품 사진을 액자와 **같은 노랑** 위에 얹는다(상품 그림이 투명 배경).
// 번지기가 상품 둘레를 다 돌아 들어가서, 치킨만 보라 바탕에 오려 붙인 꼴이 됐다 —
// 2026-09-25 실기(BBQ)에서 나왔다. 그 뒤 칠하지 않고 잘라내게 바꿨다(2026-09-26).
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

  it('바깥 액자는 잘려 나간다', () => {
    const { box } = run(kakao());
    expect(box.x).toBe(F);
    expect(box.w).toBe(W - F * 2);
    expect(box.y + box.h).toBe(H - F);
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
    const { box } = run(img);
    // 상품 윗변(20)에서 액자 두께(8)만큼 위에서 자른다. 그 사이는 노랑 그대로다.
    expect(box.y).toBe(20 - F);
    expect(px(img, 50, 16)).toEqual(Y);
  });

  it('⚠️ 카드 옆구리 반달 홈은 바탕색으로 칠한다 — 남기면 연보라 액자에 노란 반달이 박힌다', () => {
    const img = kakao();
    run(img);
    expect(px(img, F + 1, NOTCH.y)).toEqual(BG);
    expect(px(img, W - 2 - F, NOTCH.y)).toEqual(BG);
  });

  it('카드 안쪽은 그대로다', () => {
    const img = kakao();
    run(img);
    expect(px(img, 50, 130)).toEqual(WHITE);
  });
});

// 폰 화면째로 캡처한 기프티콘은 위아래가 까맣다. 그대로 넣으면 액자 안에 검은
// 덩어리가 들어간다. **자르기만 한다** — 남은 부분은 한 픽셀도 안 바뀐다.
describe('검은 여백 자르기', () => {
  function letterbox({ w, h, top, bottom, content }) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = y < top || y >= h - bottom ? [0, 0, 0] : content(x, y);
        const o = (y * w + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    return { getImageData: () => ({ data }) };
  }

  it('위아래 검은 띠를 잘라낸다', () => {
    const ctx = letterbox({ w: 50, h: 100, top: 12, bottom: 9, content: () => [0, 80, 160] });
    expect(trimLetterbox(ctx, 50, 100)).toEqual({ x: 0, y: 12, w: 50, h: 79 });
  });

  it('좌우는 안 자른다', () => {
    const ctx = letterbox({ w: 50, h: 100, top: 0, bottom: 0, content: (x) => (x < 5 ? [0, 0, 0] : [0, 80, 160]) });
    expect(trimLetterbox(ctx, 50, 100)).toEqual({ x: 0, y: 0, w: 50, h: 100 });
  });

  it('검은 머리에 글자가 박혀 있으면 내용이라 안 자른다', () => {
    const ctx = letterbox({
      w: 50, h: 100, top: 0, bottom: 0,
      content: (x, y) => (y < 10 && x > 10 && x < 30 && y % 2 === 0 ? [255, 255, 255] : y < 10 ? [0, 0, 0] : [0, 80, 160]),
    });
    expect(trimLetterbox(ctx, 50, 100).y).toBeLessThan(2);
  });

  it('온통 까만 사진은 손대지 않는다', () => {
    const ctx = letterbox({ w: 50, h: 100, top: 0, bottom: 0, content: (x, y) => (y === 50 ? [255, 255, 255] : [0, 0, 0]) });
    expect(trimLetterbox(ctx, 50, 100)).toEqual({ x: 0, y: 0, w: 50, h: 100 });
  });

  it('그림을 못 꺼내면 사진 전체', () => {
    const ctx = { getImageData: () => { throw new Error('tainted'); } };
    expect(trimLetterbox(ctx, 50, 100)).toEqual({ x: 0, y: 0, w: 50, h: 100 });
  });
});
