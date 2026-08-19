import { describe, expect, it, vi, afterEach } from 'vitest';

// 막대가 있는지만 보는 눈. 읽지는 않는다.
//
// 카톡이 404x677로 줄여 보낸 배스킨라빈스 카드는 막대 하나가 1.4픽셀이라 어떤 배율로도
// 못 읽는다(1·2·3·4·6배를 정밀 탐색 켜고 끄고 열 번 다 재봤다). 그런데 사람 눈에는
// 그 카드에도 바코드가 보인다 — 읽을 수 없을 뿐이다. 그 "보인다"를 흉내낸 것이다.
//
// 가르는 힘은 "세로로 이어지는가"에서 나온다. 글자가 빽빽한 줄도 밝기는 자주 뒤집히지만
// 줄마다 자리가 다르고, 바코드는 위아래가 거의 같은 자리에서 뒤집힌다.

// 늘 같은 그림이 나와야 한다. Math.random을 쓰면 어쩌다 통과하는 판이 생긴다.
function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// 굵기가 제각각인 세로 막대 한 줄. 같은 씨앗을 주면 같은 자리에서 뒤집힌다.
function stripeRow(width, seed) {
  const next = prng(seed);
  const row = new Array(width);
  let x = 0;
  let dark = true;
  while (x < width) {
    const run = 1 + Math.floor(next() * 4);
    for (let i = 0; i < run && x < width; i += 1, x += 1) row[x] = dark ? 0 : 255;
    dark = !dark;
  }
  return row;
}

// jsdom에는 캔버스가 없다. 그림 대신 픽셀을 직접 만들어 넣는다.
function fakeImage(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }

  vi.spyOn(document, 'createElement').mockImplementation(() => ({
    width,
    height,
    getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data }) }),
  }));

  return { naturalWidth: width, naturalHeight: height };
}

const { looksLikeBarcode } = await import('../utils/gallery');

afterEach(() => vi.restoreAllMocks());

describe('막대가 있는지 보기', () => {
  // 흰 바탕 가운데 막대 띠. 띠 안에서는 모든 줄이 같은 자리에서 뒤집힌다.
  it('바코드 띠가 있으면 찾아낸다', () => {
    const bars = stripeRow(240, 42);
    const image = fakeImage(240, 200, (x, y) => (y >= 80 && y <= 140 ? bars[x] : 255));

    expect(looksLikeBarcode(image)).toBe(true);
  });

  // 부드럽게 변하는 그림. 한 줄에서 밝기가 몇 번 안 뒤집힌다.
  it('밋밋한 사진은 아니라고 한다', () => {
    const image = fakeImage(240, 200, (x, y) => 128 + 60 * Math.sin(x / 30) + 40 * Math.sin(y / 25));

    expect(looksLikeBarcode(image)).toBe(false);
  });

  // 여기가 이 검사의 존재 이유다. 뒤집히는 횟수만 보면 이것도 바코드로 잡힌다.
  it('줄마다 자리가 다르면 글자로 보고 넘긴다', () => {
    const rows = Array.from({ length: 200 }, (_, y) => stripeRow(240, 1000 + y));
    const image = fakeImage(240, 200, (x, y) => rows[y][x]);

    expect(looksLikeBarcode(image)).toBe(false);
  });

  // 막대가 아주 얇은 띠로만 있으면 놓친다. 놓치는 쪽이 안전하다 — 이 값으로 무엇을
  // 지우거나 등록하지 않고, "여기 있을지도 모른다"고 말할 뿐이다.
  it('띠가 너무 얇으면 넘긴다', () => {
    const bars = stripeRow(240, 42);
    const image = fakeImage(240, 200, (x, y) => (y >= 100 && y <= 102 ? bars[x] : 255));

    expect(looksLikeBarcode(image)).toBe(false);
  });
});
