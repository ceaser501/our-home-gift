import { describe, expect, it } from 'vitest';
import { readableCode } from '../components/BarcodeModal';

// 매장에서 점원에게 불러줄 번호.
//
// QR에는 값만 들어 있지 않다. 편의점 쿠폰은 IX;1;9816401685019;; 같은 모양이라,
// 화면에 그대로 띄우면 읽을 수가 없다. 그림은 껍데기까지 그대로 그려야 하므로
// (리더기가 원본과 같게 읽어야 한다) 보여주는 값만 따로 벗긴다.
describe('사람에게 보여줄 번호', () => {
  it('QR의 형식 껍데기를 벗긴다', () => {
    expect(readableCode('IX;1;9816401685019;;')).toBe('9816401685019');
  });

  it('숫자만 있으면 그대로 둔다', () => {
    expect(readableCode('6307614555891369')).toBe('6307614555891369');
  });

  // 어느 쪽이 번호인지 모르면 벗기지 않는다. 잘못된 번호를 자신 있게 보여주는 것이
  // 읽기 어려운 값을 보여주는 것보다 나쁘다 — 매장에서 안 되는 이유를 알 수가 없다.
  it('숫자 덩어리가 둘이면 원래 값을 그대로 보여준다', () => {
    expect(readableCode('AB;123456;789012;')).toBe('AB;123456;789012;');
  });

  it('짧은 숫자는 번호로 보지 않는다', () => {
    expect(readableCode('IX;1;;')).toBe('IX;1;;');
  });

  it('값이 없으면 빈 문자열', () => {
    expect(readableCode(null)).toBe('');
  });
});
