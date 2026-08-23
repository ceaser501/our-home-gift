import { BellOff, CheckCircle2, Megaphone, PackagePlus, RotateCcw, Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import NotificationToggle from './NotificationToggle';
import useBackClose from '../utils/useBackClose';
import { remainingLabel } from '../utils/notices';
import { cn } from '@/lib/utils';

// 무슨 일이 있었는지 한 줄로 읽히게 한다. 아이콘은 카드 아래 버튼과 같은 것을 쓴다.
// 목록에서 "사용완료"를 누른 그 동작이 여기 이 줄이 됐다는 걸 그림으로 잇는다.
//
// 아이콘을 동그란 바탕에 담는다. 예전에는 아이콘만 떠 있어서 눈이 글자를 읽고 나서야
// 무슨 일인지 알았다. 바탕색이 있으면 종류가 색으로 먼저 읽힌다 — 썼다는 초록, 올렸다는
// 보라, 취소는 회색. 새 색은 만들지 않고 앱에 있는 것만 쓴다.
const KIND = {
  created: { icon: PackagePlus, bg: 'bg-accent', fg: 'text-primary', verb: '올렸어요' },
  used: { icon: CheckCircle2, bg: 'bg-success/12', fg: 'text-success', verb: '썼어요' },
  unused: { icon: RotateCcw, bg: 'bg-secondary', fg: 'text-muted-foreground', verb: '사용을 취소했어요' },
  // 금액권을 조금 쓴 것. 얼마를 썼는지가 핵심이라 아래에서 금액을 끼워 넣는다.
  spent: { icon: Wallet, bg: 'bg-success/12', fg: 'text-success', verb: '썼어요' },
};

// "3분 전"처럼 적는다. 알림은 방금 무슨 일이 있었나를 보는 자리라, 날짜보다 얼마나
// 지났는지가 먼저 읽혀야 한다. 하루가 넘어가면 그때부터 날짜로 적는다.
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  const d = new Date(then);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 구역 제목. "새 소식"은 보라에 개수까지, "지난 소식"은 회색에 개수 없이.
// 지난 것이 몇 개인지는 알 필요가 없다 — 세어봐야 할 일이 생기지 않는다.
function SectionTitle({ label, count, accent }) {
  return (
    <div className="flex items-center gap-[7px] pb-1.5">
      <span
        className={cn(
          'text-[13.5px] font-bold tracking-[-0.01em]',
          accent ? 'text-primary' : 'text-muted-foreground'
        )}
      >
        {label}
      </span>
      {count > 0 && (
        <span className="rounded-[9px] bg-primary px-1.5 py-px text-[11.5px] font-bold tabular-nums text-primary-foreground">
          {count}
        </span>
      )}
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
}

// 맨 위에 고정되는 공지 카드.
//
// 확성기 아이콘을 '공지' 뱃지로 바꿨다. 아이콘은 무슨 뜻인지 한 번 배워야 알고, 글자는
// 바로 안다. 자리도 덜 쓴다.
//
// 남은 시간("2시간 뒤 끝나요")을 제목 아래 별도 줄에서 제목 줄 오른쪽으로 옮겼다.
// 무슨 공지인가와 언제까지인가는 한눈에 같이 봐야 하는 값이고, 줄을 따로 쓰면 이 카드가
// 세 줄이 된다 — 목록 맨 위를 차지하는 카드라 한 줄이 곧 목록 한 줄이다.
//
// 제목은 한 줄로 자른다. 남은 시간까지 놓이면 제목 자리가 좁아지는데, 잘려도 바로 아래
// 본문이 같은 이야기를 이어서 한다.
function PinnedNotice({ notice }) {
  const remaining = remainingLabel(notice);
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] border-[1.5px] border-primary bg-primary/4 px-3.5 py-[13px]">
      <div className="flex items-center gap-[7px]">
        <span className="shrink-0 rounded-[5px] bg-primary px-[7px] py-0.5 text-[11px] font-bold text-primary-foreground">
          공지
        </span>
        <p className="m-0 min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.015em] text-foreground">
          {notice.title}
        </p>
        {/* 게시일자는 적지 않는다. 노출기한이 하루 안쪽일 때만 남은 시간을 적는다 —
            점검이 언제 끝나는지가 곧 언제부터 다시 등록할 수 있는지라서다.
            자세한 이유는 client/src/utils/notices.js의 remainingLabel 참고. */}
        {remaining && <span className="shrink-0 text-[12.5px] font-bold text-primary">{remaining}</span>}
      </div>
      {/* 줄바꿈을 그대로 살린다. 공지는 문단으로 쓰는 글이라 한 덩어리로 뭉치면 읽기 어렵다. */}
      {notice.body && (
        <p className="m-0 text-[13px] leading-relaxed font-medium break-keep whitespace-pre-line text-muted-foreground">
          {notice.body}
        </p>
      )}
    </div>
  );
}

// 목록에 섞여 내려오는 공지 한 줄.
//
// 이름 앞에 작은 뱃지를 붙인다. 가족 활동과 공지는 성격이 전혀 달라서 읽기 전에 알아야
// 하는데, 예전에는 확성기 아이콘 하나로만 갈렸다.
// 이 줄만 items-start다 — 본문이 두 줄이 될 수 있다.
function NoticeRow({ notice }) {
  return (
    <div className="flex items-start gap-[11px] border-b border-border/50 py-3 last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent">
        <Megaphone className="size-[18px] text-primary" strokeWidth={2.2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 rounded-[5px] bg-accent px-1.5 py-0.5 text-[10.5px] font-bold text-primary">
            공지
          </span>
          <p className="m-0 min-w-0 flex-1 text-[15px] leading-snug font-semibold tracking-[-0.015em] break-keep text-foreground/80">
            {notice.title}
          </p>
        </div>
        {notice.body && (
          <p className="m-0 mt-[3px] text-[13px] leading-snug font-medium break-keep whitespace-pre-line text-muted-foreground">
            {notice.body}
          </p>
        )}
      </div>
    </div>
  );
}

// 가족이 한 일 한 줄.
function ActivityRow({ activity, isNew }) {
  const kind = KIND[activity.kind] || KIND.created;
  const Icon = kind.icon;

  return (
    <div className="flex items-center gap-[11px] border-b border-border/50 py-3 last:border-b-0">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', kind.bg)}>
        <Icon className={cn('size-[18px]', kind.fg)} strokeWidth={2.2} />
      </span>
      {/* 기프티콘 이름을 앞세우고 누가 무엇을 했는지는 아래에 둔다.
          "○○을(를) 썼어요"로 이으면 이름 끝 글자마다 조사가 달라져서, 어느 쪽으로
          적어도 어색한 줄이 생긴다("콜라1.25L을(를)"). 줄을 나누면 조사를 쓸 일이
          없어지고, 무엇에 대한 소식인지도 먼저 읽힌다. */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'm-0 truncate text-[15px] leading-snug font-semibold tracking-[-0.015em]',
            isNew ? 'text-foreground' : 'text-foreground/80'
          )}
        >
          {activity.gifticon_name}
        </p>
        <p className="m-0 mt-0.5 text-[13px] font-medium text-muted-foreground">
          {activity.actor_name || '누군가'}님이{' '}
          {/* 금액은 굵게. 이 줄에서 실제로 확인하는 값이라, 문장에 섞여 있으면 다시 읽게 된다. */}
          {activity.amount ? (
            <b className="font-bold tabular-nums text-foreground/80">
              {Number(activity.amount).toLocaleString('ko-KR')}원
            </b>
          ) : null}
          {activity.amount ? ' ' : ''}
          {kind.verb} · {timeAgo(activity.created_at)}
        </p>
      </div>
      {isNew && <i className="size-2 shrink-0 rounded-full bg-primary" aria-label="새 알림" />}
    </div>
  );
}

export default function ActivitySheet({
  activities,
  pinnedNotices = [],
  listedNotices = [],
  lastReadAt,
  onClose,
}) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const readCutoff = lastReadAt ? new Date(lastReadAt).getTime() : 0;

  // 고정 자리를 넘은 공지는 활동과 시간순으로 섞인다. 셋 이상 고정하면 정작 가족
  // 활동이 안 보인다.
  const items = [
    ...activities.map((a) => ({ key: `a-${a.id}`, at: a.created_at, activity: a })),
    ...listedNotices.map((n) => ({ key: `n-${n.id}`, at: n.starts_at, notice: n })),
  ].sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

  // 새것과 지난 것을 갈라 놓는다. 기준은 예전부터 쓰던 readCutoff 그대로다 — 새 기준을
  // 만들면 종에 붙는 숫자와 이 화면이 서로 다른 말을 하게 된다.
  //
  // 이미 시간순으로 세워 둔 목록이라 새것이 위에 몰려 있다. 자르기만 하면 된다.
  const fresh = items.filter((item) => new Date(item.at || 0).getTime() > readCutoff);
  const past = items.filter((item) => new Date(item.at || 0).getTime() <= readCutoff);

  const empty = items.length === 0 && pinnedNotices.length === 0;

  function renderItem(item) {
    return item.notice ? (
      <NoticeRow key={item.key} notice={item.notice} />
    ) : (
      <ActivityRow
        key={item.key}
        activity={item.activity}
        // 이번에 새로 생긴 것만 표시한다. 열어보면 다 읽음이 되므로, 이 표시는
        // "지금 열었을 때 무엇이 새것이었나"를 알려주는 한 번짜리다.
        isNew={new Date(item.activity.created_at).getTime() > readCutoff}
      />
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="px-[18px] pr-14 pb-3">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">알림</SheetTitle>
        </SheetHeader>

        {/* 중요 공지는 스크롤해도 안 사라진다. 아래로 내려가다 보면 놓치는데, 놓쳐도
            되는 것이면 애초에 중요 표시를 안 했을 것이다. */}
        {pinnedNotices.length > 0 && (
          <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background px-[18px] pb-3">
            {pinnedNotices.map((notice) => (
              <PinnedNotice key={notice.id} notice={notice} />
            ))}
          </div>
        )}

        {empty ? (
          <>
            <div className="flex flex-col items-center gap-3.5 px-[30px] pt-7 pb-[18px]">
              <span className="flex size-16 items-center justify-center rounded-full bg-secondary">
                <BellOff className="size-[30px] text-muted-foreground/70" strokeWidth={1.8} />
              </span>
              <div className="flex flex-col items-center gap-[7px]">
                <p className="m-0 text-[17px] font-bold tracking-[-0.02em] text-foreground">아직 알림이 없어요</p>
                <p className="m-0 text-center text-sm leading-relaxed font-medium break-keep text-muted-foreground">
                  가족이 기프티콘을 올리거나 쓰면
                  <br />
                  여기에 쌓여요
                </p>
              </div>
            </div>

            {/* 알림이 없는 사람 중 상당수는 푸시가 꺼져 있어서 없는 것이다. 그 스위치는
                내 메뉴 안에 있어서 이 화면과 이어지지 않는다 — 여기서 바로 켤 수 있게 한다. */}
            <div className="mx-[18px] mt-1.5 border-t border-border/50 pt-3.5">
              <NotificationToggle asRow />
            </div>
          </>
        ) : (
          <div className="flex flex-col px-[18px]">
            {/* 안 읽은 것이 없으면 구역을 나누지 않는다. 한쪽이 비어 있는 칸막이는
                칸막이가 아니라 그냥 줄 하나다. */}
            {fresh.length > 0 && (
              <>
                <SectionTitle label="새 소식" count={fresh.length} accent />
                {fresh.map(renderItem)}
              </>
            )}

            {past.length > 0 && (
              <div className={fresh.length > 0 ? 'pt-3' : undefined}>
                {fresh.length > 0 && <SectionTitle label="지난 소식" />}
                {past.map(renderItem)}
              </div>
            )}

            {/* 왜 예전 것이 없는지 말해준다. 없어진 게 아니라 지운 것임을 알면 찾아 헤매지 않는다. */}
            {activities.length > 0 && (
              <p className="m-0 py-4 text-center text-[12.5px] font-medium text-muted-foreground">
                30일이 지난 알림은 자동으로 지워져요
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
