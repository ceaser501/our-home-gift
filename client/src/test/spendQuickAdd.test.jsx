import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

// 잔액 입력의 빠른 입력(+1만 / +5천 / +1천).
//
// 계산대에서 키패드를 여섯 번 두드리는 대신 두 번으로 끝내려고 붙였다. 대신 넘치면 안 된다 —
// 3만원권에 4만원을 적어놓고 빨간 글씨로 나무라는 것보다, 애초에 잔액에서 멈추는 편이 낫다.

vi.mock('../utils/useBackClose', () => ({ default: () => {} }));

const { default: SpendSheet } = await import('../components/SpendSheet');

const VOUCHER = {
  id: 'v-1',
  name: '신세계상품권',
  amount: 50000,
  spent_amount: 18000, // 남은 금액 32,000원
  is_voucher: true,
};

function press(label) {
  return act(async () => {
    screen.getByText(label).click();
  });
}

// 지우기는 글자가 아니라 필드 안의 ⊗ 다. 읽어주는 기계에게만 이름이 있다.
function pressClear() {
  return act(async () => {
    screen.getByLabelText('지우기').click();
  });
}

function amountBox() {
  return screen.getByLabelText('이번에 쓴 금액');
}

describe('빠른 입력은 잔액에서 멈춘다', () => {
  it('+1만을 네 번 눌러도 남은 32,000원을 넘지 않는다', async () => {
    render(<SpendSheet gifticon={VOUCHER} onSpend={vi.fn()} onClose={vi.fn()} />);

    await press('+1만');
    expect(amountBox().value).toBe('10,000');
    await press('+1만');
    await press('+1만');
    expect(amountBox().value).toBe('30,000');
    await press('+1만');
    // 30,000 + 10,000 = 40,000이지만 잔액이 32,000이라 거기서 멈춘다.
    expect(amountBox().value).toBe('32,000');
  });

  it('단위끼리 더해진다', async () => {
    render(<SpendSheet gifticon={VOUCHER} onSpend={vi.fn()} onClose={vi.fn()} />);

    await press('+5천');
    await press('+1천');
    expect(amountBox().value).toBe('6,000');
  });

  it('지우기는 빈칸으로 되돌린다', async () => {
    render(<SpendSheet gifticon={VOUCHER} onSpend={vi.fn()} onClose={vi.fn()} />);

    await press('+1만');
    await pressClear();
    expect(amountBox().value).toBe('');
  });

  // 얼마 쓸지 정하는 근거다. 크기는 입력보다 한 단 아래로 물러났지만 값은 그대로 있어야 한다.
  it('남은 금액과 권종이 함께 보인다', () => {
    render(<SpendSheet gifticon={VOUCHER} onSpend={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('32,000원')).toBeTruthy();
    expect(screen.getByText(/5만원권/)).toBeTruthy();
  });

  // '전액'은 값을 채우기만 한다. 저장은 아래 버튼 하나가 맡는다 —
  // 되돌릴 수 없는 동작이 두 군데 있으면 잘못 누르기 쉽다.
  it("'전액'은 잔액을 채워넣을 뿐 저장하지 않는다", async () => {
    const onSpend = vi.fn();
    render(<SpendSheet gifticon={VOUCHER} onSpend={onSpend} onClose={vi.fn()} />);

    await press('전액');
    expect(amountBox().value).toBe('32,000');
    expect(onSpend).not.toHaveBeenCalled();
  });

  // 지우기는 적기 전에는 없다. 빈 칸 옆에 지우는 것이 서 있으면 무엇을 지우라는 말인지 모른다.
  it('지우기는 값이 있을 때만 나온다', async () => {
    render(<SpendSheet gifticon={VOUCHER} onSpend={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByLabelText('지우기')).toBeNull();
    await press('+1천');
    expect(screen.getByLabelText('지우기')).toBeTruthy();
  });
});
