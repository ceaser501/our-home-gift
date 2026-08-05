import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { listNotices } from '../api';
import { formatDate } from '../utils/date';

// 지난 공지까지 한자리에 모아 보여준다. 배너는 최신 것 하나만 띄우고 닫으면 사라지는데,
// "아까 그거 뭐였지"를 다시 찾을 데가 없으면 공지를 낸 의미가 없다.
export default function NoticesSheet({ onClose }) {
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

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>공지사항</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col px-5 pt-2">
          {notices === null && <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>}

          {notices?.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">아직 공지가 없어요.</p>}

          {notices?.map((notice) => {
            // 끝난 공지도 지우지 않고 남긴다. 다만 지금 유효한 안내와 섞이면 헷갈리므로
            // "지난 공지"라고 적어 구분한다.
            const ended = notice.ends_at && new Date(notice.ends_at).getTime() <= now;
            return (
              <article key={notice.id} className="border-b border-border py-4 last:border-b-0">
                <div className="flex items-center gap-2">
                  <h3 className="m-0 flex-1 text-sm font-bold break-keep text-foreground">{notice.title}</h3>
                  {ended && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      지난 공지
                    </span>
                  )}
                </div>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">{formatDate(notice.starts_at)}</p>
                {/* 줄바꿈을 그대로 살린다. 공지는 문단으로 쓰는 글이라 한 덩어리로 뭉치면 읽기 어렵다. */}
                {notice.body && (
                  <p className="m-0 mt-2 text-[13px] leading-relaxed break-keep whitespace-pre-line text-foreground/80">
                    {notice.body}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
