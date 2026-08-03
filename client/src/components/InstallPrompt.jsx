import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isStandalone, isIos } from '../utils/browser';

const DISMISS_KEY = 'install-prompt-dismissed';

// 크롬(안드로이드/데스크톱)은 beforeinstallprompt 이벤트를 잡아뒀다가 버튼을 눌렀을 때
// 네이티브 설치창을 띄울 수 있다. 아이폰 사파리는 이 이벤트를 지원하지 않아서
// "공유 → 홈 화면에 추가"를 직접 안내하는 수밖에 없다.
// (카카오톡 등 인앱 브라우저는 진입 시점에 InAppBrowserNotice가 따로 안내한다.)
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    function handleBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', () => setDeferredPrompt(null));
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  if (dismissed || isStandalone()) return null;

  const canPrompt = Boolean(deferredPrompt);
  if (!canPrompt && !isIos()) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  async function handleInstall() {
    if (canPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') setDismissed(true);
      return;
    }
    setShowGuide((v) => !v);
  }

  return (
    <div className="mx-5 mb-2 flex flex-col gap-2 rounded-xl border border-border bg-accent/60 p-3">
      <div className="flex items-center gap-2.5">
        <Download className="size-4 shrink-0 text-primary" />
        <p className="m-0 flex-1 text-xs text-foreground">홈 화면에 추가하면 앱처럼 바로 열 수 있어요.</p>
        <Button type="button" size="sm" onClick={handleInstall} className="shrink-0">
          설치
        </Button>
        <button type="button" onClick={handleDismiss} aria-label="안내 닫기" className="shrink-0 text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>

      {showGuide && (
        <p className="m-0 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <Share className="mt-0.5 size-3.5 shrink-0" />
          <span>
            사파리 아래쪽 <b className="font-semibold text-foreground">공유</b> 버튼을 누른 뒤{' '}
            <b className="font-semibold text-foreground">홈 화면에 추가</b>를 선택해주세요.
          </span>
        </p>
      )}
    </div>
  );
}
