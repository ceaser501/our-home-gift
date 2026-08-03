import { useState } from 'react';
import { ChevronRight, DoorOpen, LogOut, Receipt } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ThemeToggle from './ThemeToggle';
import NotificationToggle from './NotificationToggle';
import UsageReportSheet from './UsageReportSheet';
import { useFamily } from '../FamilyContext';
import { leaveFamily } from '../family';
import { OWNER_TAG_PALETTE, memberTagColorClass } from '../utils/tagColor';

export default function ProfileMenu({ onClose }) {
  const { family, members, user, refetchFamily, signOut } = useFamily();
  const me = members.find((m) => m.user_id === user.id);
  const myName = me?.display_name || '나';

  const [reportOpen, setReportOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function handleLeave() {
    const message =
      `'${family.name}'에서 나갈까요?\n\n` +
      `내가 등록했거나 내 앞으로 되어 있는 기프티콘은 남은 가족에게 보이지 않게 돼요.\n` +
      `(지워지는 건 아니라서, 다시 참여하면 관리자가 되살릴 수 있어요.)`;
    if (!confirm(message)) return;

    setLeaving(true);
    try {
      await leaveFamily(family.id);
      onClose();
      refetchFamily();
    } catch (err) {
      alert(err.message || '가족에서 나가지 못했어요.');
      setLeaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>내 메뉴</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-3 px-5 pt-2 pb-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
              memberTagColorClass(me) ?? OWNER_TAG_PALETTE[0]
            }`}
          >
            {myName.slice(0, 3)}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold text-foreground">{myName}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </div>

        <div className="flex flex-col px-5">
          <p className="m-0 pb-1 text-xs font-semibold text-muted-foreground">설정</p>
          <ThemeToggle asRow />
          <NotificationToggle asRow />

          <p className="m-0 pt-3 pb-1 text-xs font-semibold text-muted-foreground">기록</p>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm"
          >
            <Receipt className="size-4.5 text-muted-foreground" />
            <span className="flex-1 text-foreground">가족 사용 내역</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>

          <div className="my-2 h-px bg-border" />

          <button
            type="button"
            onClick={handleLeave}
            disabled={leaving}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-destructive disabled:opacity-50"
          >
            <DoorOpen className="size-4.5" />
            <span className="flex-1">{leaving ? '나가는 중…' : '가족 나가기'}</span>
          </button>

          <button
            type="button"
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-foreground"
          >
            <LogOut className="size-4.5 text-muted-foreground" />
            <span className="flex-1">로그아웃</span>
          </button>
        </div>

        {reportOpen && <UsageReportSheet onClose={() => setReportOpen(false)} />}
      </SheetContent>
    </Sheet>
  );
}
