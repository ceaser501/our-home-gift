import { useState } from 'react';
import { Check, Clock, KeyRound, Plus, Users } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFamily } from '../FamilyContext';
import { createFamily, requestJoinFamily } from '../family';
import { cn } from '@/lib/utils';

// 보는 가족을 바꾸는 창. 한 사람이 여러 가족에 속할 수 있어서(연인끼리 하나, 부모님과 하나)
// 여기서 오가며 본다.
//
// 새 가족을 만들거나 초대 코드로 들어가는 것도 이 창 안에서 화면만 바꿔 처리한다.
// 창을 하나 더 띄우면 목록 위에 창이 두 겹 쌓여서, 어디까지 닫아야 하는지 헷갈린다.
export default function FamilySwitcherSheet({ onClose }) {
  const { families, family, members, user, switchFamily } = useFamily();
  const myName = members.find((m) => m.user_id === user.id)?.display_name || '';

  const [mode, setMode] = useState('list'); // list | create | join
  const [familyName, setFamilyName] = useState('우리 가족');
  const [memberName, setMemberName] = useState(myName);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingFor, setPendingFor] = useState(null);

  async function pick(id) {
    if (id === family.id) {
      onClose();
      return;
    }
    await switchFamily(id);
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      if (mode === 'create') {
        const created = await createFamily(familyName.trim(), memberName.trim());
        await switchFamily(created.id);
        onClose();
        return;
      }

      // 초대 코드가 맞아도 바로 들어가지지 않는다. 기존 구성원이 승인해야 한다.
      const result = await requestJoinFamily(code.trim(), memberName.trim());
      if (result.status === 'joined') {
        await switchFamily(result.family_id);
        onClose();
        return;
      }
      setPendingFor(result.family_name);
      setSubmitting(false);
    } catch (err) {
      setError(err.message || (mode === 'create' ? '가족을 만들지 못했어요.' : '초대 코드로 참여하지 못했어요.'));
      setSubmitting(false);
    }
  }

  const title = pendingFor ? '승인을 기다리는 중' : mode === 'create' ? '새 가족 만들기' : mode === 'join' ? '초대 코드로 참여' : '가족 바꾸기';

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        {pendingFor ? (
          <div className="flex flex-col items-center gap-3 px-8 py-8 text-center">
            <Clock className="size-7 text-primary" />
            <p className="m-0 text-sm font-semibold text-foreground">'{pendingFor}'에 참여를 신청했어요</p>
            <p className="m-0 text-xs leading-relaxed break-keep text-muted-foreground">
              그 가족의 구성원이 승인하면 목록에 나타나요. 초대 코드를 알려준 분에게 확인해달라고 말씀해주세요.
            </p>
            <Button className="mt-1 w-full rounded-xl" onClick={onClose}>
              알겠어요
            </Button>
          </div>
        ) : mode === 'list' ? (
          <>
            <p className="m-0 px-5 pb-2 text-xs text-muted-foreground">
              기프티콘은 가족마다 따로 모여요. 보고 싶은 가족을 고르세요.
            </p>

            <ul className="m-0 flex list-none flex-col p-0 px-5">
              {families.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => pick(item.id)}
                    className="flex w-full items-center gap-3 border-b border-border py-3 text-left text-sm last:border-b-0"
                  >
                    <Users className="size-4.5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn('truncate', item.id === family.id ? 'font-bold text-primary' : 'text-foreground')}>
                        {item.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">초대코드 {item.invite_code}</span>
                    </span>
                    {item.id === family.id && <Check className="size-4.5 shrink-0 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-col gap-2 px-5">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl"
                onClick={() => {
                  setError('');
                  setMode('create');
                }}
              >
                <Plus className="size-4" /> 새 가족 만들기
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl"
                onClick={() => {
                  setError('');
                  setMode('join');
                }}
              >
                <KeyRound className="size-4" /> 초대 코드로 참여
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 px-5 pt-2">
            {mode === 'create' ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="switch-fam-name">가족 이름</Label>
                {/* autoComplete="off": 예전에 적었던 값이 아래로 뜨지 않게 한다. */}
                <Input
                  id="switch-fam-name"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="예: 부모님댁"
                  maxLength={20}
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="switch-fam-code">초대 코드</Label>
                <Input
                  id="switch-fam-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="6자리 코드"
                  className="tracking-[0.2em] uppercase"
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="switch-my-name">이 가족에서 쓸 내 이름</Label>
              <Input
                id="switch-my-name"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="예: 태수"
                maxLength={20}
                autoComplete="off"
                required
              />
            </div>

            {error && <p className="m-0 text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setMode('list')}>
                뒤로
              </Button>
              <Button type="submit" className="flex-1 rounded-xl" disabled={submitting}>
                {submitting ? '잠시만요…' : mode === 'create' ? '만들기' : '참여하기'}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
