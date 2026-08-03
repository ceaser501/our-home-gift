import { useEffect, useState } from 'react';
import { Download, ExternalLink, MoreVertical, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isStandalone, isIos, isAndroid, detectInAppBrowser, openInExternalBrowser } from '../utils/browser';

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
  // beforeinstallprompt는 페이지가 뜨자마자 발생해서 이 컴포넌트가 그려지기 전에 지나간다.
  // index.html의 인라인 스크립트가 미리 잡아둔 이벤트를 여기서 받아 쓴다.
  const [deferredPrompt, setDeferredPrompt] = useState(() => window.__installPromptEvent || null);
  const [showGuide, setShowGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  useEffect(() => {
    function sync() {
      setDeferredPrompt(window.__installPromptEvent || null);
    }
    // 아직 이벤트가 안 왔을 수도 있으니 이후에 도착하는 것도 계속 받는다.
    window.addEventListener('installpromptready', sync);
    return () => window.removeEventListener('installpromptready', sync);
  }, []);

  if (dismissed || isStandalone()) return null;

  const inApp = detectInAppBrowser();
  const canPrompt = Boolean(deferredPrompt);
  // 크롬이 설치 이벤트를 안 주는 경우에도(이미 설치했거나 조건 미달) 안드로이드/아이폰에서는
  // 메뉴로 직접 추가할 수 있으므로 안내는 띄워준다. 예전에는 여기서 그냥 사라져버려서
  // 정작 설치가 필요한 사용자에게 아무 안내도 보이지 않았다.
  if (!inApp && !canPrompt && !isIos() && !isAndroid()) return null;

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

  // 한글은 기본값(break-word)이면 "브라우저"처럼 단어 중간에서 잘리므로 단어 단위로 끊는다.

  // 화면 좌우 끝까지 꽉 채우는 상단 알림 바. 안쪽 여백은 본문(px-5)과 맞춘다.
  return (
    <div className="flex w-full flex-col gap-2 border-b border-border bg-accent/60 px-5 py-3">
      <div className="flex items-center gap-2.5">
        {inApp ? (
          <ExternalLink className="size-4 shrink-0 text-primary" />
        ) : (
          <Download className="size-4 shrink-0 text-primary" />
        )}
        <p className="m-0 flex-1 text-xs break-keep text-foreground">{message}</p>
        <Button type="button" size="sm" onClick={handleAction} className="shrink-0">
          {inApp ? '열기' : canPrompt ? '설치' : '설치방법'}
        </Button>
        <button type="button" onClick={handleDismiss} aria-label="안내 닫기" className="shrink-0 text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>

      {showGuide && (
        <p className="m-0 flex items-start gap-1.5 text-xs leading-relaxed break-keep text-muted-foreground">
          {isIos() && !inApp ? (
            <Share className="mt-0.5 size-3.5 shrink-0" />
          ) : (
            <MoreVertical className="mt-0.5 size-3.5 shrink-0" />
          )}
          <span>
            {inApp ? (
              <>
                오른쪽 아래 <b className="font-semibold text-foreground">···</b> 버튼을 누른 뒤{' '}
                <b className="font-semibold text-foreground">다른 브라우저로 열기</b>를 선택해주세요.
              </>
            ) : isIos() ? (
              <>
                사파리 아래쪽 <b className="font-semibold text-foreground">공유</b> 버튼을 누른 뒤{' '}
                <b className="font-semibold text-foreground">홈 화면에 추가</b>를 선택해주세요.
              </>
            ) : (
              <>
                크롬 오른쪽 위 <b className="font-semibold text-foreground">⋮</b> 버튼을 누른 뒤{' '}
                <b className="font-semibold text-foreground">앱 설치</b> 또는{' '}
                <b className="font-semibold text-foreground">홈 화면에 추가</b>를 선택해주세요.
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
