// 서비스워커는 두 가지 일을 한다. 푸시 알림을 받는 일(client/src/push.js)과,
// "공유 → 모아콘"으로 들어온 이미지를 가로채는 일(client/src/utils/shareTarget.js)이다.
//
// 예전에는 알림을 켤 때만 등록했는데, 그러면 알림을 한 번도 안 켠 사람은 서비스워커가
// 없어서 공유가 통째로 실패한다(가로챌 것이 없으니 요청이 정적 호스팅으로 그냥 나가고,
// POST를 받아줄 서버가 없어 오류 화면이 뜬다). 그래서 앱을 열 때 항상 등록해둔다.

export function isServiceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export async function registerServiceWorker() {
  if (!isServiceWorkerSupported()) return null;
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

// 등록 직후에는 아직 installing/waiting 상태일 수 있어서, 바로 showNotification 같은 것을
// 부르면 실패한다. 활성화될 때까지 기다린 등록 객체를 돌려준다.
export async function readyServiceWorker() {
  await registerServiceWorker();
  return navigator.serviceWorker.ready;
}
