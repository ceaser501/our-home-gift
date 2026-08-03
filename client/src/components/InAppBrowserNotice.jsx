import { useState } from 'react';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from './Logo';
import { detectInAppBrowser, openInExternalBrowser, isIos } from '../utils/browser';

const IN_APP_LABEL = {
  kakaotalk: '카카오톡',
  naver: '네이버 앱',
  instagram: '인스타그램',
  facebook: '페이스북',
  line: '라인',
  daum: '다음 앱',
};

// 카카오톡 등 인앱 브라우저에서는 홈 화면 추가(설치)도 안 되고 구글 로그인도 막히는 경우가
// 많아서, 앱을 쓰기 전에 크롬/사파리로 옮겨가도록 진입 시점에 전체 화면으로 안내한다.
export default function InAppBrowserNotice({ inApp, onSkip }) {
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const label = IN_APP_LABEL[inApp] || '이 앱';

  function handleOpen() {
    if (!openInExternalBrowser(inApp)) setShowGuide(true);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowGuide(true);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex flex-col items-center gap-3">
        <Logo className="size-14" />
        <h1 className="m-0 text-xl font-bold text-foreground">모아콘</h1>
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <p className="m-0 text-sm font-semibold text-foreground">{label}에서는 정상적으로 이용하기 어려워요.</p>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          크롬이나 사파리로 열면 로그인도 잘 되고, 홈 화면에 추가해서 앱처럼 쓸 수 있어요.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2">
        <Button type="button" size="lg" onClick={handleOpen} className="w-full rounded-xl">
          <ExternalLink className="size-4" />
          브라우저로 열기
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={handleCopy} className="w-full rounded-xl">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? '복사했어요! 브라우저에 붙여넣기' : '링크 복사하기'}
        </Button>
      </div>

      {showGuide && (
        <p className="m-0 text-center text-xs leading-relaxed text-muted-foreground">
          {isIos() ? (
            <>
              오른쪽 아래 <b className="font-semibold text-foreground">···</b> 버튼 → {' '}
              <b className="font-semibold text-foreground">다른 브라우저로 열기</b>를 선택해주세요.
            </>
          ) : (
            <>
              오른쪽 위 <b className="font-semibold text-foreground">⋮</b> 버튼 → {' '}
              <b className="font-semibold text-foreground">다른 브라우저로 열기</b>를 선택해주세요.
            </>
          )}
        </p>
      )}

      <button type="button" onClick={onSkip} className="text-xs text-muted-foreground underline">
        그냥 여기서 볼게요
      </button>
    </div>
  );
}
