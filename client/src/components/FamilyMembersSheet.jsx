import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import RenameSheet from './RenameSheet';
import { useFamily } from '../FamilyContext';
import { renameFamily } from '../family';
import { OWNER_TAG_PALETTE, memberTagColorClass } from '../utils/tagColor';
import { formatDate } from '../utils/date';

export default function FamilyMembersSheet({ onClose }) {
  const { family, members, user, refreshFamily } = useFamily();
  const [renameOpen, setRenameOpen] = useState(false);

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

        <ul className="m-0 flex list-none flex-col gap-1 px-5 pt-2">
          {members.map((member) => (
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
