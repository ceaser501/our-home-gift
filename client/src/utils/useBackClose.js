import { useEffect, useRef } from 'react';

// 뒤로가기를 누르면 앱이 꺼지는 문제를 막는다.
//
// 설치해서 쓰면 뒤로가기는 폰의 시스템 버튼이다. 그런데 이 앱은 화면을 주소로 나누지 않고
// 상태로만 열고 닫아서(라우터가 없다), 시트가 떠 있어도 브라우저가 보기에는 여전히 첫
// 페이지다. 그래서 바코드를 띄워놓고 뒤로가기를 누르면 바코드가 닫히는 게 아니라
// 앱이 통째로 꺼졌다. 브라우저에서는 그냥 앞 사이트로 나가버린다.
//
// 시트가 열릴 때 히스토리에 표시를 하나 쌓아두고, 뒤로가기가 그 표시를 걷어내면 시트를
// 닫는다. 사용자에게는 "뒤로가기 = 이 창 닫기"로 보인다.
//
// 시트가 겹쳐 뜨는 자리가 많아서(가족 → 이름 바꾸기, 주변 매장 → 매장 상세) 표시마다
// 고유 번호를 단다. 번호가 없으면 위엣것을 닫았을 때 아래것까지 한꺼번에 닫힌다.
let seq = 0;

// onClose가 null이면 아무것도 하지 않는다. 컴포넌트 안에서 열고 닫는 시트
// (카드 메뉴처럼)가 그 형태로 쓴다 — 훅은 조건부로 부를 수 없기 때문이다.
export default function useBackClose(onClose) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const active = Boolean(onClose);

  useEffect(() => {
    if (!active) return undefined;

    const id = ++seq;
    window.history.pushState({ sheet: id }, '');

    function onPop() {
      // 내 표시가 아직 남아 있으면 내 차례가 아니다 — 위에 겹쳐 뜬 시트가 닫힌 것이다.
      if (window.history.state?.sheet === id) return;
      closeRef.current?.();
    }
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      // 화면 안의 X나 배경을 눌러 닫은 경우다. 쌓아둔 표시가 그대로 남아 있으면 다음
      // 뒤로가기가 그것을 걷어내느라 한 번 헛돈다(눌러도 아무 일이 없다). 지금 걷어낸다.
      // 뒤로가기로 닫힌 경우에는 표시가 이미 사라져 있어서 여기를 지나간다.
      if (window.history.state?.sheet === id) window.history.back();
    };
  }, [active]);
}
