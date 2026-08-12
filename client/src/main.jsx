import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import { watchForUpdates } from './utils/appUpdate.js'
import { registerServiceWorker } from './utils/serviceWorker.js'
import { watchLoginRedirects } from './utils/deepLink.js'

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
    // 로그인 화면은 자기가 띄운 창이 아닌 곳에서 온 실패를 알 방법이 없어서 여기서 알린다.
    window.alert(err.message)
  },
}).catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
