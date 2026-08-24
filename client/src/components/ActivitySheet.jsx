import { CheckCircle2, Megaphone, PackagePlus, RotateCcw, Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import useBackClose from '../utils/useBackClose';
import { remainingLabel } from '../utils/notices';

// 무슨 일이 있었는지 한 줄로 읽히게 한다. 아이콘은 카드 아래 버튼과 같은 것을 쓴다.
// 목록에서 "사용완료"를 누른 그 동작이 여기 이 줄이 됐다는 걸 그림으로 잇는다.
const KIND = {
  created: { icon: PackagePlus, tone: 'text-primary', verb: '올렸어요' },
  used: { icon: CheckCircle2, tone: 'text-success', verb: '썼어요' },
  unused: { icon: RotateCcw, tone: 'text-muted-foreground', verb: '사용을 취소했어요' },
  // 금액권을 조금 쓴 것. 얼마를 썼는지가 핵심이라 아래에서 금액을 끼워 넣는다.
  spent: { icon: Wallet, tone: 'text-success', verb: '썼어요' },
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

// 공지 한 건. 맨 위에 고정된 것과 목록에 섞인 것이 같은 모양을 쓴다 — 같은 글인데
// 자리에 따라 달라 보이면 두 가지로 읽힌다. 다른 것은 배경과 붙어 있는 위치뿐이다.
function NoticeRow({ notice, pinned = false }) {
  const remaining = remainingLabel(notice);
  return (
    <div
      className={
        pinned
          ? 'flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3'
          : 'flex items-start gap-3 border-b border-border py-3.5 last:border-b-0'
      }
    >
      <Megaphone className="mt-0.5 size-4.5 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 제목에는 break-keep을 걸지 않는다. 걸면 어절 단위로만 줄이 바뀌어서, 오른쪽에
            두세 글자 자리가 남아 있어도 다음 어절이 통째로 내려간다 — 제목이 끝까지 안 차고
            잘린 것처럼 보인다. 고정 자리는 상자 여백(px-3.5)만큼 폭이 더 좁아서 더 자주 그랬다.
            본문은 반대로 break-keep을 남긴다. 문단으로 읽는 글이라 어절이 갈리면 눈에 걸린다. */}
        <p className="m-0 text-sm leading-relaxed font-semibold text-foreground">{notice.title}</p>
        {/* 게시일자는 적지 않는다. 노출기한이 하루 안쪽일 때만 남은 시간을 적는다 —
            점검이 언제 끝나는지가 곧 언제부터 다시 등록할 수 있는지라서다.
            자세한 이유는 client/src/utils/notices.js의 remainingLabel 참고. */}
        {remaining && <p className="m-0 mt-0.5 text-xs font-semibold text-primary">{remaining}</p>}
        {/* 줄바꿈을 그대로 살린다. 공지는 문단으로 쓰는 글이라 한 덩어리로 뭉치면 읽기 어렵다. */}
        {notice.body && (
          <p className="m-0 mt-1 text-xs leading-relaxed break-keep whitespace-pre-line text-muted-foreground">
            {notice.body}
          </p>
        )}
      </div>
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

  const empty = items.length === 0 && pinnedNotices.length === 0;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>알림</SheetTitle>
        </SheetHeader>

        {/* 중요 공지는 스크롤해도 안 사라진다. 아래로 내려가다 보면 놓치는데, 놓쳐도
            되는 것이면 애초에 중요 표시를 안 했을 것이다. */}
        {pinnedNotices.length > 0 && (
          <div className="sticky top-0 z-10 flex flex-col gap-2 bg-background px-5 pt-2 pb-3">
            {pinnedNotices.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} pinned />
            ))}
          </div>
        )}

        <div className="flex flex-col px-5 pt-2">
          {empty && (
            <div className="py-10 text-center text-muted-foreground">
              <p className="m-0 text-sm">아직 알림이 없어요.</p>
              <p className="m-0 mt-1.5 text-[13px] break-keep">가족이 기프티콘을 올리거나 쓰면 여기에 쌓여요.</p>
            </div>
          )}

          {items.map((item) => {
            if (item.notice) return <NoticeRow key={item.key} notice={item.notice} />;

            const activity = item.activity;
            const kind = KIND[activity.kind] || KIND.created;
            const Icon = kind.icon;
            // 이번에 새로 생긴 것만 표시한다. 열어보면 다 읽음이 되므로, 이 표시는
            // "지금 열었을 때 무엇이 새것이었나"를 알려주는 한 번짜리다.
            const isNew = new Date(activity.created_at).getTime() > readCutoff;

            return (
              <div key={item.key} className="flex items-start gap-3 border-b border-border py-3.5 last:border-b-0">
                <Icon className={`mt-0.5 size-4.5 shrink-0 ${kind.tone}`} />
                {/* 기프티콘 이름을 앞세우고 누가 무엇을 했는지는 아래에 둔다.
                    "○○을(를) 썼어요"로 이으면 이름 끝 글자마다 조사가 달라져서, 어느
                    쪽으로 적어도 어색한 줄이 생긴다("콜라1.25L을(를)"). 줄을 나누면
                    조사를 쓸 일이 없어지고, 무엇에 대한 소식인지도 먼저 읽힌다. */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="m-0 text-sm leading-relaxed font-semibold break-keep text-foreground">
                    {activity.gifticon_name}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                    {activity.actor_name || '누군가'}님이{' '}
                    {activity.amount ? `${Number(activity.amount).toLocaleString('ko-KR')}원 ` : ''}
                    {kind.verb} · {timeAgo(activity.created_at)}
                  </p>
                </div>
                {isNew && <i className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-label="새 알림" />}
              </div>
            );
          })}

          {/* 왜 예전 것이 없는지 말해준다. 없어진 게 아니라 지운 것임을 알면 찾아 헤매지 않는다. */}
          {activities.length > 0 && (
            <p className="m-0 py-4 text-center text-xs text-muted-foreground">30일이 지난 알림은 자동으로 지워져요.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
