import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AlertDialog from '../components/AlertDialog';
import { groupDigits } from '../components/BarcodeModal';
import { formatShortDate } from '../utils/date';

vi.mock('../utils/useBackClose', () => ({ default: () => {} }));

// 되돌릴 수 없는 물음만 버튼을 세로로 쌓는다.
//
// 가로로 나란하면 엄지가 스치는 자리에 취소와 삭제가 둘 다 있어서, 되돌릴 수 없는 쪽이
// 오탭으로 눌린다. 반대로 되돌릴 수 있는 물음까지 세로로 만들면 창만 길어진다.
function buttonRow() {
  // 확인 버튼의 부모가 버튼 줄이다.
  return screen.getByText('삭제').closest('div');
}

describe('삭제 확인창', () => {
  it('위험한 물음은 버튼을 세로로 쌓고 삭제가 위에 온다', () => {
    render(
      <AlertDialog
        tone="danger"
        title="이 기프티콘을 삭제할까요?"
        subject="아이스 카페 아메리카노 T"
        warning="되돌릴 수 없어요"
        confirmLabel="삭제"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const row = buttonRow();
    expect(row.className).toContain('flex-col');
    // 세로일 때는 DOM 순서가 곧 화면 순서다. 첫 버튼이 삭제여야 한다.
    expect(row.querySelectorAll('button')[0].textContent).toBe('삭제');
  });

  it('이름을 따옴표 문장에서 빼내 한 줄로 세운다', () => {
    render(
      <AlertDialog
        tone="danger"
        title="이 기프티콘을 삭제할까요?"
        subject="아이스 카페 아메리카노 T"
        warning="되돌릴 수 없어요"
        confirmLabel="삭제"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('아이스 카페 아메리카노 T')).toBeTruthy();
    expect(screen.getByText('되돌릴 수 없어요')).toBeTruthy();
    expect(screen.queryByText(/목록에서 사라져요/)).toBeNull();
  });

  // 되돌릴 수 있는 물음은 예전처럼 가로다. 그리고 가로일 때 취소는 왼쪽이어야 한다 —
  // DOM에서는 확인이 먼저지만 flex-row-reverse가 자리를 되돌린다.
  it('되돌릴 수 있는 물음은 가로 그대로', () => {
    render(
      <AlertDialog
        title="이어서 올릴까요?"
        confirmLabel="계속"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const row = screen.getByText('계속').closest('div');
    expect(row.className).toContain('flex-row-reverse');
    expect(row.className).not.toContain('flex-col');
  });
});

describe('바코드 번호를 네 자리씩 끊는다', () => {
  it('숫자는 끊는다', () => {
    expect(groupDigits('9816401685019')).toBe('9816 4016 85019');
    expect(groupDigits('12345678')).toBe('1234 5678');
  });

  // 편의점 쿠폰의 껍데기처럼 글자가 섞인 값은 어디가 자리인지 알 수 없다. 그대로 둔다.
  it('숫자가 아니면 그대로 둔다', () => {
    expect(groupDigits('IX;1;9816401685019;;')).toBe('IX;1;9816401685019;;');
    expect(groupDigits('')).toBe('');
  });
});

describe('메모 날짜', () => {
  it('올해 것은 연도를 뗀다', () => {
    const year = new Date().getFullYear();
    expect(formatShortDate(`${year}-08-19`)).toBe('08.19');
  });

  // 반년 전 당부와 어제 남긴 말을 가르는 것이 이 날짜의 할 일이다. 해가 지난 것까지
  // '08.19'로 적으면 그 일을 못 한다.
  it('지난 해 것은 연도를 남긴다', () => {
    const last = new Date().getFullYear() - 1;
    expect(formatShortDate(`${last}-08-19`)).toBe(`${last}.08.19`);
  });
});
