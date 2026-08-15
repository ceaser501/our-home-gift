import { describe, expect, it, vi } from 'vitest';
import { openAfterClose } from '../utils/sheetSwap';

// 시트를 닫으면서 다른 시트를 여는 자리.
//
// ── 이 테스트가 무엇을 못 보는지 먼저 ────────────────────────────────────────
// 정작 겪은 증상은 여기서 재현되지 않는다. jsdom은 history.back()에 popstate를
// 보내지 않아서, 앞 시트가 남기고 간 popstate를 뒷 시트가 받는 그 장면 자체가 안 만들어진다.
//
// 그래서 증상 재현과 고침 확인은 실제 크로미움에서 따로 했다. useBackClose가 하는 일만
// 그대로 흉내낸 페이지를 띄워보면 이렇게 나온다.
//
//   그냥 열었을 때        다건창: 스스로 닫음 (popstate state=null)
//   openAfterClose로      state={"sheet":4}  — 살아남는다
//
// 여기서 보는 것은 그 아래 한 겹, openAfterClose가 약속한 것뿐이다 — 곧바로 열지 않고,
// popstate가 오면 그때 열고, 안 오면 조금 기다렸다 연다.

describe('openAfterClose', () => {
  it('곧바로 열지 않는다', () => {
    const open = vi.fn();
    openAfterClose(open);
    expect(open).not.toHaveBeenCalled();
  });

  it('popstate가 오면 그때 연다', async () => {
    const open = vi.fn();
    openAfterClose(open);

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('popstate가 안 와도 결국 연다 — 걷어낼 표시가 없던 경우다', async () => {
    const open = vi.fn();
    openAfterClose(open);

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('두 번 열지 않는다', async () => {
    const open = vi.fn();
    openAfterClose(open);

    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(open).toHaveBeenCalledTimes(1);
  });
});
