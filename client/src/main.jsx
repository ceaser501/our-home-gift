import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import { watchForUpdates } from './utils/appUpdate.js'
import { registerServiceWorker } from './utils/serviceWorker.js'

watchForUpdates()

// 알림과 "공유 → 모아콘" 둘 다 서비스워커가 있어야 동작한다. 알림을 켜지 않은 사람도
// 공유는 되어야 해서 로그인 여부와 상관없이 여기서 먼저 등록해둔다.
// 실패해도(사파리 사생활 보호 모드 등) 나머지 기능은 그대로 동작하므로 조용히 넘긴다.
registerServiceWorker().catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
