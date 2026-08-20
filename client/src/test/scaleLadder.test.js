import { describe, expect, it } from 'vitest';
import { barcodeScaleLadder } from '../utils/gallery';

// 바코드를 읽어볼 배율의 사다리.
//
// 실물로 잰 결과가 근거다(2026-08-20): 카카오 카드(800x1670)는 원본과 2배 확대에서
// 전부 실패하고, 0.96~0.45 축소 구간에서 전부 읽혔다. 두 장은 0.45까지 내려가야 했다.
// 그래서 사다리는 축소가 먼저고, 확대는 작은 그림(기프티쇼 450px류)에만 붙는다.
// 숫자를 바꾸려면 scratchpad의 실측(ladder-verify)부터 다시 돌려야 한다.

describe('barcodeScaleLadder', () => {
  it('카카오 카드 크기(1670)는 축소 세 단을 지나 원본으로 끝난다', () => {
    const ladder = barcodeScaleLadder(1670);
    expect(ladder.map((f) => Number(f.toFixed(2)))).toEqual([0.96, 0.69, 0.45, 1]);
  });

  it('정밀 판은 더 촘촘히 내려간다', () => {
    const ladder = barcodeScaleLadder(1670, true);
    // 실측에서 0.45 이하로 내려가야 읽히는 카드가 있었다 — 그 단이 있어야 한다.
    expect(ladder.some((f) => f <= 0.46)).toBe(true);
    expect(ladder.length).toBeGreaterThan(barcodeScaleLadder(1670).length);
  });

  it('작은 그림(450)은 원본을 먼저 보고 확대로 끝난다', () => {
    expect(barcodeScaleLadder(450)).toEqual([1, 0.7, 2]);
    expect(barcodeScaleLadder(450, true)).toEqual([1, 0.7, 2, 3]);
  });

  it('큰 그림은 확대하지 않는다 — 실측에서 확대는 전부 실패했다', () => {
    expect(barcodeScaleLadder(2000).every((f) => f <= 1)).toBe(true);
  });

  it('크기를 모르면 원본 한 번만 본다', () => {
    expect(barcodeScaleLadder(0)).toEqual([1]);
    expect(barcodeScaleLadder(NaN)).toEqual([1]);
  });
});
