import { useEffect, useState } from 'react';
import { Download, ExternalLink, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isStandalone, isIos, detectInAppBrowser, openInExternalBrowser } from '../utils/browser';

const DISMISS_KEY = 'install-prompt-dismissed';

const IN_APP_LABEL = {
  kakaotalk: '카카오톡',
  naver: '네이버 앱',
  instagram: '인스타그램',
  facebook: '페이스북',
  line: '라인',
  daum: '다음 앱',
};

// 홈 화면에 추가(설치)를 안내하는 상단 배너. 상황에 따라 세 가지로 동작한다.
//  - 크롬 계열: beforeinstallprompt를 잡아뒀다가 눌렀을 때 네이티브 설치창을 띄운다.
//  - 카카오톡 등 인앱 브라우저: 설치 기능 자체가 없어서 크롬/사파리로 옮겨가도록 안내한다.
//  - 아이폰 사파리: 자동 설치창이 없어서 "공유 → 홈 화면에 추가"를 직접 안내한다.
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

  const inApp = detectInAppBrowser();
  const canPrompt = Boolean(deferredPrompt);
  if (!inApp && !canPrompt && !isIos()) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  async function handleAction() {
    if (inApp) {
      if (!openInExternalBrowser(inApp)) setShowGuide((v) => !v);
      return;
    }
    if (canPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') setDismissed(true);
      return;
    }
    setShowGuide((v) => !v);
  }

  const message = inApp
    ? `${IN_APP_LABEL[inApp] || '이 앱'}에서는 설치가 안 돼요. 브라우저로 열어주세요.`
    : '홈 화면에 추가하면 앱처럼 바로 열 수 있어요.';

  return (
    <div className="mb-2 flex w-full flex-col gap-2 rounded-xl border border-border bg-accent/60 p-3">
      <div className="flex items-center gap-2.5">
        {inApp ? (
          <ExternalLink className="size-4 shrink-0 text-primary" />
        ) : (
          <Download className="size-4 shrink-0 text-primary" />
        )}
        <p className="m-0 flex-1 text-xs text-foreground">{message}</p>
        <Button type="button" size="sm" onClick={handleAction} className="shrink-0">
          {inApp ? '열기' : '설치'}
        </Button>
        <button type="button" onClick={handleDismiss} aria-label="안내 닫기" className="shrink-0 text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>

      {showGuide && (
        <p className="m-0 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <Share className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {inApp ? (
              <>
                오른쪽 아래 <b className="font-semibold text-foreground">···</b> 버튼을 누른 뒤{' '}
                <b className="font-semibold text-foreground">다른 브라우저로 열기</b>를 선택해주세요.
              </>
            ) : (
              <>
                사파리 아래쪽 <b className="font-semibold text-foreground">공유</b> 버튼을 누른 뒤{' '}
                <b className="font-semibold text-foreground">홈 화면에 추가</b>를 선택해주세요.
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
