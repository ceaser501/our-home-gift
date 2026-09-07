// 로그인하다 실패한 이유를 화면으로 옮기는 자리.
//
// 앱으로 돌아오는 로그인 결과는 리액트 바깥에서 받는다(main.jsx의 watchLoginRedirects).
// 화면이 그려지기 전에도 도착할 수 있어서 그렇게 해뒀는데, 그 바람에 알릴 방법이
// window.alert 하나뿐이었다. 폰이 그리는 회색 상자에 영어가 그대로 뜨고, 앱이 만든
// 다른 창들과 생김새가 아예 달랐다.
//
// 받는 곳과 그리는 곳을 여기서 잇는다. 적어두면 화면 쪽(LoginErrorAlert)이 가져다 그린다.
// 화면이 아직 없을 때 적힌 것도 그려질 때 함께 뜬다.

let current = null;
const listeners = new Set();

function tell() {
  for (const listener of listeners) listener(current);
}

export function setLoginError(message) {
  current = message || null;
  tell();
}

export function clearLoginError() {
  setLoginError(null);
}

export function readLoginError() {
  return current;
}

export function watchLoginError(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
