import { useState } from 'react';
import { Pencil, Share2, UserPlus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import RenameSheet from './RenameSheet';
import CopyButton from './CopyButton';
import { useFamily } from '../FamilyContext';
import { approveJoinRequest, rejectJoinRequest, renameFamily } from '../family';
import { OWNER_TAG_PALETTE, memberTagColorClass } from '../utils/tagColor';
import { formatDate } from '../utils/date';
import useBackClose from '../utils/useBackClose';

// 초대를 카카오톡 대화방으로 바로 보낸다.
//
// 카카오 SDK로 직접 보내는 방법도 있지만 그러려면 JS 키·도메인 등록·메시지 템플릿이
// 먼저 갖춰져야 하고, 그래봐야 갈 수 있는 곳이 카카오톡 하나로 줄어든다. 폰이 가진
// 공유창을 부르면 카카오톡·문자·메일이 한꺼번에 뜨고, 어느 것을 고를지는 보내는
// 사람이 정한다.
//
// 공유창이 없는 곳(대개 데스크톱 브라우저)에서는 버튼을 아예 그리지 않는다. 옆에
// 복사가 있어서 할 일이 막히지는 않는다.
function ShareInviteButton({ family }) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (!canShare) return null;

  async function handleShare() {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}`;
    try {
      await navigator.share({
        title: '모아콘 가족 초대',
        text: `모아콘에서 '${family.name}' 가족에 참여해보세요.\n초대코드: ${family.invite_code}\n\n`,
        url,
      });
    } catch {
      // 공유창을 그냥 닫은 것도 여기로 온다. 취소한 사람에게 오류를 보여줄 이유는 없다.
    }
  }

  return (
    <Button type="button" onClick={handleShare} className="h-9 flex-1 rounded-xl text-sm">
      <Share2 className="size-4" />
      공유
    </Button>
  );
}

export default function FamilyMembersSheet({ onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
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
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
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

        {/* 이 창을 여는 이유의 절반은 "누구 초대하려고"다. 그런데 예전에는 코드가 본문과
            같은 크기의 회색 글씨로 적혀 있어서, 열어놓고도 뭘 해야 하는지 몰랐다.
            상자로 떼어내고 코드를 크게 키운다 — 열자마자 "이걸 보내면 되는구나"가
            먼저 읽혀야 한다. */}
        <div className="mx-5 mb-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3.5">
          <p className="m-0 text-xs font-semibold text-primary">가족 초대코드</p>
          <p className="m-0 mt-1 font-mono text-[26px] leading-tight font-bold tracking-[0.18em] text-foreground">
            {family.invite_code}
          </p>
          {/* 복사만 있으면 붙여넣을 곳을 사용자가 직접 찾아가야 한다. 공유를 옆에 두면
              누르는 즉시 카카오톡 대화방을 고르는 화면이 뜬다 — 초대는 대개 거기서 끝난다. */}
          <div className="mt-2.5 flex gap-2">
            <ShareInviteButton family={family} />
            {/* CopyButton은 스스로 shrink-0이라 flex-1을 직접 주면 서로 어긋난다. 감싸서 늘린다. */}
            <div className="flex flex-1">
              <CopyButton
                value={family.invite_code}
                label="복사"
                className="h-9 w-full justify-center rounded-xl border border-border bg-card text-sm"
              />
            </div>
          </div>
          <p className="m-0 mt-2.5 text-xs break-keep text-muted-foreground">
            코드를 받은 사람이 참여를 신청하면, 여기서 승인해야 들어와요.
          </p>
        </div>

        {/* 헤더에 있던 "가족 3명"이 여기로 왔다. 구성원 목록 바로 위가 그 숫자를 세는
            자리라, 헤더에서보다 오히려 제자리다. */}
        <p className="m-0 px-5 pb-1 text-xs font-semibold text-muted-foreground">
          {members.length > 1 ? `가족 ${members.length}명` : '혼자 쓰는 중'}
        </p>

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
                  {/* 권한이 더 있는 건 아니고, 누구에게 물어보면 되는지 알려주는 표시다.
                      혼자면 물어볼 사람도 나뿐이라 붙일 이유가 없다. */}
                  {index === 0 && members.length > 1 && (
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
