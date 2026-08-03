// 홈 화면에 설치한 앱은 한 번 띄워두면 브라우저 탭처럼 계속 살아 있어서, 새 버전을
// 올려도 사용자가 앱을 완전히 종료했다 켜기 전까지는 예전 화면이 그대로 남는다.
// (재설치는 필요 없다.) 그래서 앱이 다시 화면에 나올 때마다 배포된 index.html을 확인해
// 새 빌드가 올라와 있으면 조용히 새로고침한다.

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
// 서버 앞단 캐시가 예전 index.html을 계속 내려주면 새로고침이 반복될 수 있어서,
// 같은 버전으로는 한 번만 새로고침하도록 기록해둔다.
const RELOADED_KEY = 'moacon:reloaded-for';
const ENTRY_RE = /src="([^"]*assets\/index-[^"]+\.js)"/;

function toPath(src) {
  return new URL(src, window.location.href).pathname;
}

function currentEntryPath() {
  const el = document.querySelector('script[type="module"][src*="assets/"]');
  return el ? toPath(el.getAttribute('src')) : null;
}

async function latestEntryPath() {
  // cache: 'reload'은 네트워크에서 새로 받아오면서 브라우저 캐시도 같이 갱신해줘서,
  // 곧바로 새로고침했을 때 새 HTML이 뜨는 걸 보장한다.
  const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'reload' });
  if (!res.ok) return null;
  const match = (await res.text()).match(ENTRY_RE);
  return match ? toPath(match[1]) : null;
}

// 기프티콘 입력 중에 새로고침하면 쓰던 내용이 날아가므로, 시트가 열려 있으면 미룬다.
function isBusy() {
  return Boolean(document.querySelector('[data-slot="sheet-content"]'));
}

export function watchForUpdates() {
  const current = currentEntryPath();
  if (!current) return; // 개발 서버에서는 빌드 파일이 없으니 아무것도 하지 않는다

  let checking = false;

  async function check() {
    if (checking || document.hidden || isBusy()) return;
    checking = true;
    try {
      const latest = await latestEntryPath();
      if (!latest || latest === current) return;
      if (sessionStorage.getItem(RELOADED_KEY) === latest) return;
      sessionStorage.setItem(RELOADED_KEY, latest);
      window.location.reload();
    } catch {
      // 네트워크가 안 되면 다음 기회에 다시 확인한다
    } finally {
      checking = false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
  setInterval(check, CHECK_INTERVAL_MS);
  check();
}
