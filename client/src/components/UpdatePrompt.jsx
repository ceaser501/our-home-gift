import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { checkForUpdate, dismissUpdate } from '../utils/appVersion';
import useBackClose from '../utils/useBackClose';

// 앱을 다시 볼 때마다 서버에 묻지는 않는다. 스토어 버전은 하루에 몇 번 바뀌는 값이 아니다.
const RECHECK_MS = 10 * 60 * 1000;

// 「새 버전이 있어요」. 앱에서만 뜬다(웹은 새 판을 알아서 새로고침한다).
//
// 로그인 화면 바깥에 둔다(main.jsx). 강제 업데이트는 로그인보다 앞서야 한다 — 옛 버전이
// 로그인 자체에서 막히는 경우가 강제를 켜는 가장 흔한 이유다.
//
// 강제일 때는 닫을 길을 모두 막는다. 버튼도 하나, 바깥을 눌러도 뒤로가기도 그대로다.
export default function UpdatePrompt() {
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    let lastChecked = 0;
    let alive = true;
    async function check() {
      if (document.hidden || Date.now() - lastChecked < RECHECK_MS) return;
      lastChecked = Date.now();
      const next = await checkForUpdate();
      if (alive) setUpdate(next);
    }
    function onVisible() {
      if (!document.hidden) check();
    }
    check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!update) return null;
  return <UpdateDialog update={update} onClose={() => setUpdate(null)} />;
}

function UpdateDialog({ update, onClose }) {
  const { force, latest, releasedOn, storeUrl } = update;

  const keepUsing = useCallback(() => {
    dismissUpdate(latest);
    onClose();
  }, [latest, onClose]);

  // 강제일 때는 뒤로가기로 닫히지 않는다(아무 일도 안 한다).
  useBackClose(force ? () => {} : keepUsing);

  function goToStore() {
    // 스토어 주소는 앱 밖에서 열린다(캐패시터가 스토어 앱으로 넘긴다). tmap.js와 같은 길이다.
    window.location.href = storeUrl;
  }

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center px-8"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="update-title"
    >
      <button
        type="button"
        aria-label={force ? undefined : '닫기'}
        tabIndex={force ? -1 : 0}
        onClick={force ? undefined : keepUsing}
        className="absolute inset-0 bg-black/50"
      />
      <div className="animate-splash-in relative w-full max-w-[322px] rounded-[18px] bg-card px-5 pt-[22px] pb-[18px] shadow-xl">
        <div className="flex flex-col items-center gap-[9px] text-center">
          <span className="flex size-[46px] items-center justify-center rounded-full bg-primary/10 text-primary">
            <Download className="size-[23px]" />
          </span>
          <p id="update-title" className="m-0 text-[17.5px] leading-snug font-bold tracking-[-0.02em] break-keep text-foreground">
            새 버전이 있어요
          </p>
          <p className="m-0 text-sm font-medium tabular-nums text-muted-foreground">
            {latest}
            {releasedOn && ` (${releasedOn})`}
          </p>
          {force && (
            <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
              업데이트해야 계속 쓸 수 있어요.
            </p>
          )}
        </div>

        {/* 세로로 쌓는다. 두 버튼 글이 길어서 가로로 두면 한쪽이 두 줄로 접힌다. */}
        <div className="mt-[18px] flex flex-col gap-2">
          <Button type="button" onClick={goToStore} className="h-[50px] w-full rounded-[13px] text-[15.5px] font-bold">
            업데이트 하러 가기
          </Button>
          {!force && (
            <Button
              type="button"
              variant="outline"
              onClick={keepUsing}
              className="h-12 w-full rounded-xl text-[14.5px] font-semibold text-foreground/80"
            >
              그대로 사용하기
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
