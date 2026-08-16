import { useEffect, useRef } from 'react';

// 뒤로가기를 누르면 앱이 꺼지는 문제를 막는다.
//
// 설치해서 쓰면 뒤로가기는 폰의 시스템 버튼이다. 그런데 이 앱은 화면을 주소로 나누지 않고
// 상태로만 열고 닫아서(라우터가 없다), 창이 떠 있어도 브라우저가 보기에는 여전히 첫
// 페이지다. 그래서 바코드를 띄워놓고 뒤로가기를 누르면 바코드가 닫히는 게 아니라 앱이
// 통째로 꺼졌다. 브라우저에서는 그냥 앞 사이트로 나가버린다.
//
// ── 예전에는 창마다 표시를 하나씩 쌓았다가 크게 데였다 ──
//
// 창이 열릴 때마다 히스토리에 자기 번호를 쌓고, 창마다 "지금 표시가 내 번호가 아니면 내가
// 닫힌 것"으로 판단했다. 겹쳐 뜨기만 하면 맞는 규칙이었는데, 창이 다른 창으로 갈리는 자리가
// 하나 있었다 — 계정 삭제다("계정을 삭제할까요?" → "정말 탈퇴할까요?").
//
// 거기서 앞 창이 자기 표시를 걷어내는 일(history.back)과 뒷 창이 자기 표시를 쌓는 일이 같은
// 차례에 겹친다. 걷어내기는 브라우저가 조금 있다 처리하는데, 크로미움에서 그 되돌리기는
// 취소되지 않고 그대로 실행된다. 그래서 뒷 창이 막 열리자마자 popstate가 떨어지고, 그때
// 히스토리의 표시는 뒷 창의 번호가 아니다. 뒷 창은 "내가 닫혔구나" 하고 스스로 닫혔다.
//
// 그래서 계정 삭제는 두 번째 물음창이 뜨자마자 사라졌다. 탈퇴 버튼을 누를 기회가 없었으니
// 서버까지 간 적도 없다. 한참을 서버에서 원인을 찾았다.
//
// ── 지금은 표시를 하나만 쓴다 ──
//
// 몇 개가 열려 있든 히스토리에는 "무언가 열려 있다" 표시 하나만 둔다. 뒤로가기가 그 표시를
// 걷어가면 맨 위 창 하나를 닫고, 아직 남은 게 있으면 표시를 다시 세운다. 무엇을 닫을지는
// 히스토리가 아니라 이 줄(stack)이 정한다.
//
// 창이 다른 창으로 갈릴 때는 열린 개수가 줄지 않으므로 아무것도 걷어내지 않는다. 위에서
// 데인 그 되돌리기 자체가 생기지 않는다. 우리가 되돌리는 때는 마지막 창까지 다 닫혔을
// 때뿐이고, 그때는 닫을 것이 없어서 그 popstate가 아무 일도 하지 않는다.

const MARK = 'moacon-sheet';

// 지금 열려 있는 창들. 나중에 열린 것이 뒤에 온다.
const stack = [];

let listening = false;

function marked() {
  return window.history.state?.sheet === MARK;
}

function mark() {
  window.history.pushState({ sheet: MARK }, '');
}

function onPop() {
  const top = stack[stack.length - 1];
  // 우리가 걷어낸 표시다(마지막 창까지 닫혀서). 닫을 것이 없다.
  if (!top) return;

  top.close();
  // 아직 열려 있는 것이 남았으면 표시를 다시 세운다. 다음 뒤로가기가 그것을 닫는다.
  // 닫히는 창의 자리는 아직 이 줄에 남아 있으므로 '나 말고 더 있나'는 1보다 큰지로 본다.
  if (stack.length > 1) mark();
}

function ensureListening() {
  if (listening) return;
  listening = true;
  window.addEventListener('popstate', onPop);
}

// onClose가 null이면 아무것도 하지 않는다. 컴포넌트 안에서 열고 닫는 시트
// (카드 메뉴처럼)가 그 형태로 쓴다 — 훅은 조건부로 부를 수 없기 때문이다.
export default function useBackClose(onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const active = Boolean(onClose);

  useEffect(() => {
    if (!active) return undefined;

    ensureListening();

    const entry = { close: () => closeRef.current?.() };
    const first = stack.length === 0;
    stack.push(entry);
    // 표시는 첫 창일 때만 세운다. 위에 겹쳐 뜨는 창은 이미 세워진 것을 같이 쓴다.
    if (first && !marked()) mark();

    return () => {
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1);
      // 화면에서 닫아도 표시는 걷어내지 않는다.
      //
      // 예전에는 여기서 history.back()으로 걷어냈다. 그 되돌리기가 늦게 도착하는 것이
      // 이 파일의 모든 사고의 원인이었다 — 그 사이에 다른 창이 열려 있으면 그 창이
      // 대신 닫힌다. 계정 삭제가 딱 그랬다.
      //
      // 안 걷어내면 표시가 하나 남는데, 다음에 창이 열릴 때 그것을 그대로 다시 쓴다
      // (위의 marked() 검사). 그래서 쌓이지 않는다. 대신 아무것도 안 열린 상태에서
      // 뒤로가기를 누르면 그 한 번이 이 남은 표시를 걷어내느라 헛돈다. 창 하나를 못 쓰게
      // 만드는 것보다 이편이 낫다.
    };
  }, [active]);
}
