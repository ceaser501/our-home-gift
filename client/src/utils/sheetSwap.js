/**
 * 시트를 닫으면서 다른 시트를 여는 자리.
 *
 * 그냥 둘을 같이 하면 새 시트가 열리자마자 스스로 닫힌다. 실제로 물렸다 — `+`에서
 * 사진을 여러 장 고르면 등록 창이 닫히고 묶어서 넣는 창이 열려야 하는데, 열리는 듯하다
 * 목록으로 튕겨 나왔다.
 *
 * 까닭은 뒤로가기 처리에 있다(client/src/utils/useBackClose.js). 시트가 열릴 때
 * 히스토리에 표시를 하나 쌓고, 닫을 때 그것을 걷어낸다 — `history.back()`. 그런데
 * 그 걷어내기는 그 자리에서 끝나지 않고 popstate로 돌아온다. 돌아오기 전에 새 시트를
 * 열어버리면, 새 시트는 그 popstate를 보고 "내 표시가 없어졌네" 하고 스스로 닫는다.
 * 앞 시트가 남기고 간 인사를 뒷 시트가 자기 것으로 받는 셈이다.
 *
 * 그래서 popstate를 한 번 받고 나서 연다. 안 올 수도 있으니(걷어낼 표시가 이미 없던
 * 경우) 조금 기다렸다가는 그냥 연다.
 *
 * 창 안에서 창을 여는 자리에는 setTimeout(fn, 0)으로 충분했다. 거기는 표시를 쌓는
 * 쪽이 아니라 화면 덮개만 정리하면 되는 자리였다. 여기는 히스토리가 걸려 있어서 한 박자
 * 쉬는 것으로는 모자란다 — 언제 돌아오는지가 브라우저에 달렸다.
 */
const FALLBACK_MS = 150;

export function openAfterClose(open) {
  if (typeof window === 'undefined') {
    open();
    return;
  }

  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', go);
    clearTimeout(timer);
    open();
  };

  window.addEventListener('popstate', go);
  const timer = setTimeout(go, FALLBACK_MS);
}
