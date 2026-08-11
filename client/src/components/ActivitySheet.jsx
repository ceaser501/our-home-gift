import { CheckCircle2, PackagePlus, RotateCcw, Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import useBackClose from '../utils/useBackClose';

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

export default function ActivitySheet({ activities, lastReadAt, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const readCutoff = lastReadAt ? new Date(lastReadAt).getTime() : 0;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>알림</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col px-5 pt-2">
          {activities.length === 0 && (
            <div className="py-10 text-center text-muted-foreground">
              <p className="m-0 text-sm">아직 알림이 없어요.</p>
              <p className="m-0 mt-1.5 text-[13px] break-keep">가족이 기프티콘을 올리거나 쓰면 여기에 쌓여요.</p>
            </div>
          )}

          {activities.map((item) => {
            const kind = KIND[item.kind] || KIND.created;
            const Icon = kind.icon;
            // 이번에 새로 생긴 것만 표시한다. 열어보면 다 읽음이 되므로, 이 표시는
            // "지금 열었을 때 무엇이 새것이었나"를 알려주는 한 번짜리다.
            const isNew = new Date(item.created_at).getTime() > readCutoff;

            return (
              <div key={item.id} className="flex items-start gap-3 border-b border-border py-3.5 last:border-b-0">
                <Icon className={`mt-0.5 size-4.5 shrink-0 ${kind.tone}`} />
                {/* 기프티콘 이름을 앞세우고 누가 무엇을 했는지는 아래에 둔다.
                    "○○을(를) 썼어요"로 이으면 이름 끝 글자마다 조사가 달라져서, 어느
                    쪽으로 적어도 어색한 줄이 생긴다("콜라1.25L을(를)"). 줄을 나누면
                    조사를 쓸 일이 없어지고, 무엇에 대한 소식인지도 먼저 읽힌다. */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="m-0 text-sm leading-relaxed font-semibold break-keep text-foreground">
                    {item.gifticon_name}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                    {item.actor_name || '누군가'}님이{' '}
                    {item.amount ? `${Number(item.amount).toLocaleString('ko-KR')}원 ` : ''}
                    {kind.verb} · {timeAgo(item.created_at)}
                  </p>
                </div>
                {isNew && <i className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-label="새 알림" />}
              </div>
            );
          })}

          {/* 왜 예전 것이 없는지 말해준다. 없어진 게 아니라 지운 것임을 알면 찾아 헤매지 않는다. */}
          {activities.length > 0 && (
            <p className="m-0 py-4 text-center text-xs text-muted-foreground">60일이 지난 알림은 자동으로 지워져요.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
