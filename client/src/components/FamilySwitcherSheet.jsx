import { useState } from 'react';
import { Check, ChevronRight, Clock, Home } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFamily } from '../FamilyContext';
import { createFamily, requestJoinFamily } from '../family';
import { forgetInviteCode } from '../utils/inviteLink';
import { cn } from '@/lib/utils';
import useBackClose from '../utils/useBackClose';

// 보는 가족을 바꾸는 창. 한 사람이 여러 가족에 속할 수 있어서(연인끼리 하나, 부모님과 하나)
// 여기서 오가며 본다.
//
// 새 가족을 만들거나 초대 코드로 들어가는 것도 이 창 안에서 화면만 바꿔 처리한다.
// 창을 하나 더 띄우면 목록 위에 창이 두 겹 쌓여서, 어디까지 닫아야 하는지 헷갈린다.
export default function FamilySwitcherSheet({ onClose, initialCode = '' }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { families, family, members, user, switchFamily } = useFamily();
  const myName = members.find((m) => m.user_id === user.id)?.display_name || '';

  // 초대 링크를 눌러 온 사람에게는 참여 칸을 이미 열어 코드까지 채워서 보여준다.
  // 그러라고 링크를 만든 것이다 — 목록을 보여주고 '가족 추가하기'를 찾게 하면 걸음이
  // 도로 늘어난다.
  const [mode, setMode] = useState(initialCode ? 'join' : 'list'); // list | create | join
  const [familyName, setFamilyName] = useState('우리집');
  const [memberName, setMemberName] = useState(myName);
  const [code, setCode] = useState(initialCode);
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
      // 링크로 들고 온 코드는 다 썼다. 남겨두면 다음에 앱을 열 때 또 이 창이 열린다.
      forgetInviteCode();
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
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        {pendingFor ? (
          <div className="flex flex-col items-center gap-3 px-8 py-8 text-center">
            <Clock className="size-7 text-primary" />
            <p className="m-0 text-base font-semibold text-foreground">'{pendingFor}'에 참여를 신청했어요</p>
            <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
              그 가족의 구성원이 승인하면 목록에 나타나요. 초대 코드를 알려준 분에게 확인해달라고 말씀해주세요.
            </p>
            <Button className="mt-1 w-full rounded-xl" onClick={onClose}>
              알겠어요
            </Button>
          </div>
        ) : mode === 'list' ? (
          <>
            {/* 이 창을 처음 여는 사람에게는 이 한 줄이 창 전체의 설명이다. 다른 회색
                글씨와 같은 크기로 두면 그냥 지나친다. 한 단 키워둔다. */}
            <p className="m-0 px-5 pb-2 text-sm break-keep text-muted-foreground">
              기프티콘은 가족마다 따로 모여요. 보고 싶은 가족을 고르세요.
            </p>

            {/* 가족마다 눌리는 면을 준다. 예전에는 글자 색만 다른 두 줄이라 목록으로 안
                보였다 — 이 창의 목적이 고르는 것인데, 무엇을 누르는지가 안 보였다.
                적는 값은 이름과 상태뿐이다. families에는 id·name·invite_code밖에 없어서
                구성원 수나 기프티콘 개수는 쓸 수가 없다(없는 데이터를 지어내지 않는다). */}
            <ul className="m-0 flex list-none flex-col gap-2 p-0 px-5">
              {families.map((item) => {
                const isCurrent = item.id === family.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => pick(item.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-colors',
                        isCurrent ? 'border-[1.5px] border-primary bg-primary/4' : 'border border-border bg-card'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-11 shrink-0 items-center justify-center rounded-[13px]',
                          isCurrent ? 'bg-primary' : 'bg-secondary'
                        )}
                      >
                        <Home
                          className={cn('size-5', isCurrent ? 'text-primary-foreground' : 'text-muted-foreground')}
                          strokeWidth={2.1}
                        />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-base font-semibold tracking-[-0.015em] text-foreground">
                          {item.name}
                        </span>
                        <span className="text-[12.5px] font-medium tracking-[-0.01em] text-muted-foreground">
                          {isCurrent ? '지금 보는 중' : '눌러서 바꾸기'}
                        </span>
                      </div>
                      {isCurrent ? (
                        <Check className="size-[19px] shrink-0 text-primary" strokeWidth={2.6} />
                      ) : (
                        <ChevronRight className="size-[17px] shrink-0 text-muted-foreground/70" strokeWidth={2.2} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* 위 목록은 고르는 자리이고 여기는 만드는 자리다. 성격이 달라서 제목으로 가른다.
                초대 코드는 뺐다 — 고르는 화면에 코드가 왜 있는지 알 수 없고, 코드를 전달하는
                자리는 가족 관리다.
                '이름 바꾸기'도 뺐다. 목록의 세 번째 항목처럼 보여서, 누르면 가족이 바뀔 것처럼
                읽혔다. 이름 바꾸기는 가족 관리 안에 있다. */}
            <div className="mt-4 flex flex-col gap-2 px-5">
              <p className="m-0 px-0.5 text-[13px] font-bold tracking-[-0.01em] text-muted-foreground">가족 추가하기</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-xl text-[14.5px] font-semibold"
                  onClick={() => {
                    setError('');
                    setMode('create');
                  }}
                >
                  새로 만들기
                </Button>
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-xl text-[14.5px] font-semibold"
                  onClick={() => {
                    setError('');
                    setMode('join');
                  }}
                >
                  초대 코드로 참여
                </Button>
              </div>
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
                  /* 고정폭 글꼴과 넓은 자간은 값이 들어온 뒤에만 쓴다. 빈 칸에 미리 걸면
                     예시 문구가 이미 적힌 코드처럼 보인다. */
                  className={cn('uppercase', code && 'font-mono tracking-[0.12em]')}
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
