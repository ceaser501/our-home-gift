import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { listNotices } from '../api';
import { formatDate } from '../utils/date';
import useBackClose from '../utils/useBackClose';

// 지난 공지까지 한자리에 모아 보여준다. 배너는 최신 것 하나만 띄우고 닫으면 사라지는데,
// "아까 그거 뭐였지"를 다시 찾을 데가 없으면 공지를 낸 의미가 없다.
export default function NoticesSheet({ onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const [notices, setNotices] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listNotices().then((rows) => {
      if (!cancelled) setNotices(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const now = Date.now();
  // 끝난 것과 아직 도는 것을 갈라 놓는다. 판정은 예전 그대로 — ends_at이 지났는가.
  // 기한을 안 적은 공지는 끝나지 않은 것으로 본다(예전과 같다).
  const ended = (n) => Boolean(n.ends_at) && new Date(n.ends_at).getTime() <= now;
  const live = (notices || []).filter((n) => !ended(n));
  const past = (notices || []).filter(ended);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="px-[18px] pr-14 pb-3">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">공지사항</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-[11px] px-[18px]">
          {notices === null && <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>}

          {notices?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">아직 공지가 없어요.</p>}

          {/* 진행 중인 공지. 지금 읽어야 하는 것이라 카드로 세워둔다.
              뱃지는 '진행 중'이다. 카드가 이미 강조돼 있으니 뱃지가 할 일은 왜 강조됐는지를
              말하는 것인데, '지난 공지'는 강조되지 않은 이유를 설명하는 말이라 여기서는 약하다.

              날짜를 본문 아래로 내렸다. 제목 바로 아래 있으면 눈이 본문에 닿기 전에 날짜를
              먼저 읽는다 — 공지에서 먼저 알아야 하는 것은 무슨 일인가다. */}
          {live.map((notice) => (
            <article
              key={notice.id}
              className="rounded-[14px] border-[1.5px] border-primary bg-primary/4 p-3.5"
            >
              <div className="flex items-center gap-[7px]">
                <span className="shrink-0 rounded-[5px] bg-primary px-[7px] py-0.5 text-[11px] font-bold text-primary-foreground">
                  진행 중
                </span>
                <h3 className="m-0 min-w-0 flex-1 text-[15.5px] font-bold tracking-[-0.015em] break-keep text-foreground">
                  {notice.title}
                </h3>
              </div>
              {/* 줄바꿈을 그대로 살린다. 공지는 문단으로 쓰는 글이라 한 덩어리로 뭉치면 읽기 어렵다. */}
              {notice.body && (
                <p className="m-0 mt-2 text-sm leading-relaxed font-medium break-keep whitespace-pre-line text-foreground/80">
                  {notice.body}
                </p>
              )}
              <p className="m-0 mt-2 text-[12.5px] font-medium tabular-nums text-muted-foreground">
                {formatDate(notice.starts_at)}
              </p>
            </article>
          ))}

          {/* 끝난 공지도 지우지 않고 남긴다. 다만 뱃지를 항목마다 반복하지는 않는다 —
              '지난 공지'가 세 번 나오던 것을 구역 제목 한 번으로 줄였다. */}
          {past.length > 0 && (
            <div className="flex items-center gap-[7px] pt-[3px]">
              <span className="text-[13.5px] font-bold tracking-[-0.01em] text-muted-foreground">지난 공지</span>
              <span className="h-px flex-1 bg-border/60" />
            </div>
          )}

          {past.map((notice) => (
            <article key={notice.id} className="border-b border-border/50 pb-[13px] last:border-b-0">
              <h3 className="m-0 text-[15.5px] font-semibold tracking-[-0.015em] break-keep text-foreground/80">
                {notice.title}
              </h3>
              {notice.body && (
                <p className="m-0 mt-1.5 text-sm leading-relaxed font-medium break-keep whitespace-pre-line text-muted-foreground">
                  {notice.body}
                </p>
              )}
              <p className="m-0 mt-[7px] text-[12.5px] font-medium tabular-nums text-muted-foreground/80">
                {formatDate(notice.starts_at)}
              </p>
            </article>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
