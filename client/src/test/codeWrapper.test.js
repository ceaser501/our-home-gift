import { describe, expect, it } from 'vitest';
import { readableCode, wrapCode } from '../utils/code';
import { formatDateShortYear } from '../utils/date';

// 편의점 쿠폰의 QR에는 번호만 들어 있지 않다 — IX;1;9816401685019;; 처럼 앞뒤가 붙는다.
// 화면에는 숫자만 보여주고, 저장은 앞뒤까지 그대로 해야 한다. 그 값으로 QR을 다시
// 그리기 때문에, 앞뒤를 잃으면 매장 리더기가 원본과 다르게 읽는다.

const WRAPPED = 'IX;1;9816401685019;;';

describe('바코드 번호의 껍데기', () => {
  it('화면에는 숫자만 보인다', () => {
    expect(readableCode(WRAPPED)).toBe('9816401685019');
  });

  it('고쳐 적으면 원래 껍데기에 도로 끼워 넣는다', () => {
    expect(wrapCode(WRAPPED, '1234567890123')).toBe('IX;1;1234567890123;;');
  });

  it('껍데기가 없던 번호는 적은 그대로다', () => {
    expect(wrapCode('9816401685019', '123')).toBe('123');
    expect(wrapCode('', '123')).toBe('123');
  });

  // 빈 번호에 껍데기만 남으면 그건 번호가 아니다.
  it('다 지우면 껍데기도 같이 지운다', () => {
    expect(wrapCode(WRAPPED, '')).toBe('');
  });
});

// 목록 카드의 기한은 자리가 빠듯하다. 앞 두 자리는 어차피 20이라 아무것도 알려주지 않는다.
describe('목록 기한 날짜', () => {
  it('연도를 두 자리로 줄인다', () => {
    expect(formatDateShortYear('2026-08-27')).toBe('26.08.27');
    expect(formatDateShortYear('2027-12-31')).toBe('27.12.31');
  });

  // 연도를 아주 떼지는 않는다. 올해 것과 내년 것이 섞여 있어서, 없으면 언제까지인지를 잃는다.
  it('연도는 남긴다', () => {
    expect(formatDateShortYear('2026-08-27')).toMatch(/^\d{2}\./);
  });

  it('날짜가 아니면 건드리지 않는다', () => {
    expect(formatDateShortYear('')).toBe('');
    expect(formatDateShortYear(null)).toBe('');
  });
});
