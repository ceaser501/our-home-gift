import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import AlertDialog from '../components/AlertDialog';
import useBackClose from '../utils/useBackClose';

// 창이 다른 창으로 바뀌는 자리.
//
// 계정 삭제만 두 번 묻는다("계정을 삭제할까요?" → "정말 탈퇴할까요?"). 앱의 다른 창들은
// 겹쳐 뜨거나 하나로 끝나서, 같은 자리에서 창이 통째로 갈리는 곳은 여기뿐이다.
//
// 뒤로가기로 창을 닫으려고 히스토리에 표시를 쌓아두는데, 앞 창이 사라지면서 자기 표시를
// 걷어내는 것과 뒷 창이 자기 표시를 쌓는 것이 겹친다. 걷어내는 일은 브라우저가 조금 있다
// 처리해서, 그 되돌리기가 뒷 창이 쌓아둔 표시 위에 떨어진다. 그러면 화면에 떠 있는 창들이
// 저마다 "내 표시가 없어졌네" 하고 스스로 닫는다 — 누른 적도 없는데 닫힌다.

function settle() {
  // 되돌리기는 다음 차례에 처리된다. 그것이 화면까지 오는 것을 기다린다.
  //
  // 넉넉히 기다린다. 창이 갈릴 때 우리가 스스로 되돌리는 것이 한 번 끼는데, 그것이
  // 끝나기 전에 다음 뒤로가기를 밀어넣으면 jsdom이 뒤엣것을 흘린다(진짜 브라우저에서는
  // 사람이 그렇게 빨리 두 번 누를 일이 없다).
  return act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 150));
  });
}

// 시트도 같은 장치로 뒤로가기를 받는다. 물음창보다 먼저 열려 있어야 실제와 같다.
function SheetLike({ onClose, children }) {
  useBackClose(onClose);
  return children;
}

// 시트가 먼저 열려 있고, 그 안에서 물음창이 나중에 뜬다. 순서가 중요하다 — 한 번에 같이
// 그리면 리액트가 안쪽부터 붙여서 실제와 순서가 뒤집힌다.
function TwoStep({ onSheetClose = () => {} }) {
  const [step, setStep] = useState(null);
  return (
    <SheetLike onClose={onSheetClose}>
      <button type="button" onClick={() => setStep('what')}>
        계정 삭제
      </button>
      {step === 'what' && (
        <AlertDialog
          title="계정을 삭제할까요?"
          confirmLabel="계속"
          onConfirm={() => setStep('sure')}
          onClose={() => setStep(null)}
        />
      )}
      {step === 'sure' && (
        <AlertDialog
          title="정말 탈퇴할까요?"
          confirmLabel="탈퇴하기"
          onConfirm={() => setStep('done')}
          onClose={() => setStep(null)}
        />
      )}
      {step === 'done' && <span>탈퇴를 불렀다</span>}
    </SheetLike>
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('창이 다른 창으로 바뀔 때', () => {
  it('두 번째 물음창이 저절로 닫히지 않는다', async () => {
    render(<TwoStep />);

    await act(async () => screen.getByText('계정 삭제').click());
    await settle();
    await act(async () => screen.getByText('계속').click());
    await settle();

    // 여기서 닫혀 있으면, 탈퇴 버튼을 누를 기회조차 없었던 것이다.
    expect(screen.queryByText('정말 탈퇴할까요?')).toBeTruthy();
  });

  it('두 번째 물음창의 확인이 실제로 눌린다', async () => {
    render(<TwoStep />);

    await act(async () => screen.getByText('계정 삭제').click());
    await settle();
    await act(async () => screen.getByText('계속').click());
    await settle();
    await act(async () => screen.getByText('탈퇴하기').click());

    expect(screen.queryByText('탈퇴를 불렀다')).toBeTruthy();
  });

  // 창이 갈리면서 생긴 되돌리기는 그 아래 있던 시트한테도 "네 표시가 없어졌다"로 보인다.
  // 그래서 물음창만 닫히는 게 아니라 내 메뉴까지 같이 닫혔다.
  it('아래에 있던 시트까지 닫히지 않는다', async () => {
    const sheetClosed = vi.fn();
    render(<TwoStep onSheetClose={sheetClosed} />);

    await act(async () => screen.getByText('계정 삭제').click());
    await settle();
    await act(async () => screen.getByText('계속').click());
    await settle();

    expect(sheetClosed).not.toHaveBeenCalled();
  });

  // 겹쳐 뜬 것을 한 번에 하나씩 닫는 것이 이 장치의 본래 일이다. 고치면서 이게 깨지면
  // 뒤로가기 한 번에 앱이 통째로 꺼지던 자리로 돌아간다.
  it('뒤로가기는 한 번에 하나씩 닫는다', async () => {
    const sheetClosed = vi.fn();
    render(<TwoStep onSheetClose={sheetClosed} />);

    await act(async () => screen.getByText('계정 삭제').click());
    await settle();

    await act(async () => window.history.back());
    await settle();
    expect(screen.queryByText('계정을 삭제할까요?')).toBeNull();
    expect(sheetClosed).not.toHaveBeenCalled();

    await act(async () => window.history.back());
    await settle();
    expect(sheetClosed).toHaveBeenCalled();
  });

  // 원래 하려던 일은 그대로 돼야 한다. 뒤로가기로 물음창을 닫으면 그 창만 닫히고
  // 시트는 남는다.
  it('뒤로가기로 물음창을 닫으면 시트는 남는다', async () => {
    const sheetClosed = vi.fn();
    render(<TwoStep onSheetClose={sheetClosed} />);

    await act(async () => screen.getByText('계정 삭제').click());
    await settle();
    await act(async () => screen.getByText('계속').click());
    await settle();
    await act(async () => window.history.back());
    await settle();

    expect(screen.queryByText('정말 탈퇴할까요?')).toBeNull();
    expect(sheetClosed).not.toHaveBeenCalled();
  });
});
