import { useState } from 'react';
import { Pencil, UserPlus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import RenameSheet from './RenameSheet';
import { useFamily } from '../FamilyContext';
import { approveJoinRequest, rejectJoinRequest, renameFamily } from '../family';
import { OWNER_TAG_PALETTE, memberTagColorClass } from '../utils/tagColor';
import { formatDate } from '../utils/date';

export default function FamilyMembersSheet({ onClose }) {
  const { family, members, user, joinRequests, refreshFamily } = useFamily();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deciding, setDeciding] = useState(null);
  const [error, setError] = useState('');

  async function decide(request, approve) {
    setDeciding(request.id);
    setError('');
    try {
      await (approve ? approveJoinRequest(request.id) : rejectJoinRequest(request.id));
      await refreshFamily();
    } catch (err) {
      setError(err.message || '처리하지 못했어요.');
    } finally {
      setDeciding(null);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle className="flex items-center gap-1">
            <span className="min-w-0 truncate">{family.name}</span>
            <button
              type="button"
              onClick={() => setRenameOpen(true)}
              aria-label="가족 이름 바꾸기"
              className="shrink-0 rounded-full p-1.5 text-muted-foreground"
            >
              <Pencil className="size-4" />
            </button>
          </SheetTitle>
        </SheetHeader>

        <div className="px-5 pb-2">
          <p className="m-0 text-xs text-muted-foreground">
            초대코드 <span className="font-mono font-semibold tracking-wider text-foreground">{family.invite_code}</span> 를
            알려주면 가족이 참여할 수 있어요.
          </p>
        </div>

        {/* 초대 코드는 짧아서 우연히 맞힐 수도 있다. 그래서 코드가 맞아도 여기서 승인해야 들어온다. */}
        {joinRequests.length > 0 && (
          <div className="mx-5 mt-2 flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="m-0 flex items-center gap-1.5 text-xs font-semibold text-primary">
              <UserPlus className="size-4" />
              참여를 기다리는 사람이 {joinRequests.length}명 있어요
            </p>
            {joinRequests.map((request) => (
              <div key={request.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{request.display_name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg px-3"
                  disabled={deciding === request.id}
                  onClick={() => decide(request, false)}
                >
                  거절
                </Button>
                <Button size="sm" className="h-8 rounded-lg px-3" disabled={deciding === request.id} onClick={() => decide(request, true)}>
                  승인
                </Button>
              </div>
            ))}
            {error && <p className="m-0 text-xs text-destructive">{error}</p>}
          </div>
        )}

        {/* 대표는 "가장 먼저 들어온 사람"이다(목록은 들어온 순서대로 온다). 가족을 만든 사람이
            늘 첫 번째라 평소에는 만든 사람이지만, 그 사람이 나가면 다음으로 먼저 들어온
            사람이 자연히 대표가 된다. 따로 넘겨주는 기능은 없다. */}
        <ul className="m-0 flex list-none flex-col gap-1 px-5 pt-2">
          {members.map((member, index) => (
            <li key={member.user_id} className="flex items-center gap-3 rounded-xl px-1 py-2.5">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                  memberTagColorClass(member) ?? OWNER_TAG_PALETTE[0]
                }`}
              >
                {member.display_name.slice(0, 3)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-foreground">
                  {member.display_name}
                  {member.user_id === user.id && <span className="ml-1.5 text-xs font-normal text-primary">나</span>}
                  {/* 권한이 더 있는 건 아니고, 누구에게 물어보면 되는지 알려주는 표시다. */}
                  {index === 0 && (
                    <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground">
                      대표
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(member.created_at)}부터 함께</span>
              </span>
            </li>
          ))}
        </ul>

        {renameOpen && (
          <RenameSheet
            title="가족 이름 바꾸기"
            label="가족 이름"
            description="가족 모두에게 보이는 이름이에요."
            initialValue={family.name}
            placeholder="예: 우리 가족"
            onSubmit={async (name) => {
              await renameFamily(family.id, name);
              await refreshFamily();
            }}
            onClose={() => setRenameOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
