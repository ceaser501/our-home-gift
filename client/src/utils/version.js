// 지금 화면에 떠 있는 앱이 최신 배포본인지 확인한다.
//
// 홈 화면에 설치해서 쓰면 크롬 UI가 없어서 주소창 새로고침을 할 수 없고, 우리가 만든
// "당겨서 새로고침"은 데이터만 다시 읽을 뿐 앱 코드는 그대로 둔다. 그래서 새 버전을
// 배포해도 사용자는 앱을 완전히 껐다 켜기 전까지 옛 화면을 계속 본다.
//
// 버전 파일을 따로 두지 않고 index.html을 그대로 쓴다. Vite가 빌드할 때마다 자바스크립트
// 파일 이름에 붙는 해시가 달라지므로, 그 주소가 곧 버전 번호다. 별도 파일을 두면 그걸
// 갱신하는 걸 잊었을 때 조용히 틀린 답을 하게 된다.

function currentScriptUrl() {
  return document.querySelector('script[type="module"][src]')?.getAttribute('src') || null;
}

export async function hasNewVersion() {
  const current = currentScriptUrl();
  if (!current) return false;

  try {
    // no-store가 없으면 브라우저가 갖고 있던 옛 index.html을 그대로 내줘서, 새 버전이
    // 올라와 있어도 못 알아본다. 확인하려고 부르는 요청이니 캐시를 쓰면 안 된다.
    const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'no-store' });
    if (!res.ok) return false;

    const html = await res.text();
    const next = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
    return Boolean(next) && next !== current;
  } catch {
    // 인터넷이 끊겼거나 배포 중일 수 있다. 확인에 실패한 것을 "새 버전 있음"으로 보면
    // 멀쩡히 쓰던 화면이 이유 없이 새로 열린다. 모를 때는 그냥 두는 쪽이 낫다.
    return false;
  }
}
