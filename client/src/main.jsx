import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { watchForUpdates } from './utils/appUpdate.js'
import { registerServiceWorker } from './utils/serviceWorker.js'
import { watchLoginRedirects } from './utils/deepLink.js'
import { isNativeApp } from './utils/browser.js'
import { catchInviteFromUrl } from './utils/inviteLink.js'
import { applyUiScale, watchSystemUiScale } from './utils/uiScale.js'
import { setLoginError } from './utils/loginError.js'
import { dropStaleCaches } from './utils/staleCache.js'
import { watchForegroundPush } from './utils/foregroundPush.js'

// 안드로이드 웹뷰는 내비게이션 바 높이를 env(safe-area-inset-bottom)으로 알려주지 않는다.
// 그래서 화면 맨 아래 버튼이 제스처 바에 물려 눌리지 않았다. CSS가 그 사실을 알 수 있게
// 표시를 달아준다(index.css의 --safe-bottom). 웹에서는 붙지 않아 아무 영향이 없다.
if (isNativeApp() && window.Capacitor?.getPlatform?.() === 'android') {
  document.documentElement.classList.add('is-native-android')
}

// 새 판으로 올라왔으면 계산해둔 값을 버린다.
//
// 맨 앞이어야 한다. 아래에서 그 값들을 읽기 시작하므로, 여기서 안 버리면 이번 실행은
// 옛 값으로 한 바퀴 돈다. "업데이트하면 이상한데 지우고 깔면 된다"가 그 자리였다.
dropStaleCaches(`${__APP_VERSION__} ${__BUILD_DATE__}`)

// 초대 링크(?join=CODE)로 들어왔으면 그 코드를 붙들어둔다.
//
// 로그인 화면이 그려지기 전에 해야 한다. 링크를 눌러 온 사람은 대개 로그인 전이고,
// 로그인은 카카오·구글 화면을 다녀오는 길이라 그 사이에 주소가 통째로 갈린다.
catchInviteFromUrl()

// 화면 크기를 폰 설정에 맞춘다(index.css의 --ui-scale).
// 실패해도(플러그인이 없는 옛 빌드 등) 기본 크기로 그대로 돌아간다.
applyUiScale().catch(() => {})
watchSystemUiScale()

// 앱을 보고 있는 중에 온 알림을 갤럭시에서도 그린다. 웹·아이폰에서는 아무 일도 안 한다.
watchForegroundPush().catch(() => {})

watchForUpdates()

// 알림과 "공유 → 모아콘" 둘 다 서비스워커가 있어야 동작한다. 알림을 켜지 않은 사람도
// 공유는 되어야 해서 로그인 여부와 상관없이 여기서 먼저 등록해둔다.
// 실패해도(사파리 사생활 보호 모드 등) 나머지 기능은 그대로 동작하므로 조용히 넘긴다.
registerServiceWorker().catch(() => {})

// 앱에서 소셜 로그인을 마치고 돌아오는 것을 받는다. 웹에서는 아무 일도 하지 않는다.
// 로그인 화면이 그려지기 전에 걸어둬야 한다 — 커스텀 탭이 빨리 닫히면 화면이 준비되기
// 전에 돌아올 수 있고, 그때 받을 사람이 없으면 로그인 결과가 그대로 버려진다.
watchLoginRedirects({
  onError(err) {
    // 로그인 화면은 자기가 띄운 창이 아닌 곳에서 온 실패를 알 방법이 없다. 적어두면
    // 화면 쪽(AuthGate의 LoginErrorAlert)이 앱 모양의 창으로 그린다.
    setLoginError(err.message)
  },
}).catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </StrictMode>,
)
