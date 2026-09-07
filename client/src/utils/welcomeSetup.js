import { isNativeApp } from './browser';

// 첫 설정 화면(WelcomeSetupScreen)을 봤는지.
//
// 계정마다 따로 적는다. 한 폰을 가족이 나눠 쓰기도 하고, 시험 삼아 여러 계정으로
// 들어가 보기도 한다 — 앞사람이 봤다고 뒷사람에게 안 보여주면 그 사람은 자동 찾기가
// 왜 안 도는지 영영 모른다(가족 아이디를 계정마다 적어두는 것과 같은 사정이다).
//
// 앱에서만 띄운다. 사진첩을 훑는 일이 앱에만 있고, 웹에서 이 화면을 세우면 브라우저로
// 잠깐 열어본 사람에게 알림 권한부터 묻게 된다.
const KEY = 'moacon:welcome-setup';

function keyFor(userId) {
  return `${KEY}:${userId}`;
}

export function needsWelcomeSetup(userId) {
  if (!isNativeApp() || !userId) return false;
  try {
    return window.localStorage.getItem(keyFor(userId)) !== '1';
  } catch {
    // 못 읽으면 안 띄운다. 매번 뜨는 화면이 되는 것보다 한 번도 안 뜨는 편이 낫다 —
    // 켜고 끄는 자리는 내 메뉴에 그대로 있다.
    return false;
  }
}

export function markWelcomeSetupDone(userId) {
  try {
    window.localStorage.setItem(keyFor(userId), '1');
  } catch {
    // 못 적으면 다음에 또 뜬다. 그때 다시 시작하기를 누르면 될 뿐 잃는 것은 없다.
  }
}
