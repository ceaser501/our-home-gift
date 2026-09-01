import { useState } from 'react';
import { Link2, MessageCircle, Pencil, UserMinus, UserPlus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AlertDialog from './AlertDialog';
import RenameSheet from './RenameSheet';
import CopyButton from './CopyButton';
import { useFamily } from '../FamilyContext';
import { approveJoinRequest, kickMember, rejectJoinRequest, renameFamily, renameMember } from '../family';
import { OWNER_TAG_PALETTE, memberTagColorClass, nameTagColorClass } from '../utils/tagColor';
import { formatDate } from '../utils/date';
import useBackClose from '../utils/useBackClose';
import { prefersKakao, shareInvite, shareToKakao } from '../utils/inviteLink';

// 카톡 카드에 실릴 그림.
//
// 받는 사람 폰에서 카카오 서버가 가져가는 주소라, 앱 안의 파일(https://localhost/…)을
// 가리키면 안 된다. 웹에 이미 올라가 있는 아이콘을 쓴다.
// 나중에 초대 전용 그림이 나오면 이 한 줄만 갈아 끼우면 된다.
const INVITE_IMAGE = 'https://ceaser501.github.io/our-home-gift/icon-512.png';

export default function FamilyMembersSheet({ onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { family, members, user, joinRequests, refreshFamily } = useFamily();
  const [renameOpen, setRenameOpen] = useState(false);
  const [myNameOpen, setMyNameOpen] = useState(false);
  const [deciding, setDeciding] = useState(null);
  // 내보내려고 물어보는 중인 구성원. 되돌릴 수 없는 일이라 한 번 여쭙는다.
  const [kicking, setKicking] = useState(null);
  const [error, setError] = useState('');
  // 링크를 보내고 나서 무슨 일이 있었는지. 공유 창이 뜨는 폰에서는 굳이 말하지 않고,
  // 복사로 물러선 경우에만 알려준다 — 아무 일도 안 일어난 것처럼 보이기 때문이다.
  const [shareNote, setShareNote] = useState('');

  async function invite(viaKakao) {
    setShareNote('');
    try {
      if (viaKakao) {
        await shareToKakao({ familyName: family.name, code: family.invite_code, image: INVITE_IMAGE });
        return;
      }
      const how = await shareInvite({ familyName: family.name, code: family.invite_code });
      if (how === 'copied') setShareNote('초대 링크를 복사했어요. 붙여넣어 보내주세요.');
    } catch (err) {
      setShareNote(err.message || '보내지 못했어요. 아래 코드를 알려주세요.');
    }
  }

  // 대표는 "가장 먼저 들어온 사람"이다. 목록이 들어온 순서로 오므로 첫 줄이 그 사람이고,
  // 서버(kick_member)도 같은 규칙으로 정한다 — 둘이 다르면 버튼은 보이는데 눌러도
  // 안 되는 일이 생긴다.
  const iAmLeader = members[0]?.user_id === user.id;

  async function kick(member) {
    setKicking(null);
    setError('');
    try {
      await kickMember(family.id, member.user_id);
      await refreshFamily();
    } catch (err) {
      setError(err.message || '내보내지 못했어요.');
    }
  }

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

        {/* 승인이 초대 코드보다 위에 있다. 승인은 기한이 있는 일이고(상대가 기다리는 중이다)
            초대 코드는 언제든 볼 수 있는 값이다. 코드가 위에 있던 시절에는 스크롤해야
            승인이 나왔다.
            초대 코드는 짧아서 우연히 맞힐 수도 있다. 그래서 코드가 맞아도 여기서 승인해야
            들어온다. */}
        {joinRequests.length > 0 && (
          <div className="mx-5 mb-3 flex flex-col gap-2.5 rounded-2xl border-[1.5px] border-primary bg-primary/4 p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-primary">
                <UserPlus className="size-[15px] text-primary-foreground" strokeWidth={2.3} />
              </span>
              <p className="m-0 flex-1 text-[15px] font-bold tracking-[-0.015em] text-foreground">
                참여를 기다리는 사람 <span className="tabular-nums">{joinRequests.length}명</span>
              </p>
            </div>

            {/* 신청자 줄을 흰 카드 안에 넣는다. 보라 배경 위에 바로 두면 버튼 두 개가
                배경과 붙어서 어디까지가 누를 자리인지 흐려진다.

                버튼은 아랫줄로 내렸다. 한 줄에 같이 두면 이메일이 그만큼 잘리는데
                (90t****@g… 까지만 보였다), 이메일을 붙인 이유가 누구인지 알아보라는
                것이라 잘리면 있으나 마나다. 이름과 이메일에 한 줄을 통째로 준다. */}
            {joinRequests.map((request) => (
              <div key={request.id} className="flex flex-col gap-2.5 rounded-xl bg-card px-3 py-3">
                <div className="flex items-center gap-2.5">
                  {/* 구성원 목록과 같은 동그라미. 아직 가족이 아니라 tag_color가 없어서
                      이름에서 색을 뽑는다(nameTagColorClass) — 같은 이름이면 언제 봐도 같은
                      색이라, 승인하고 나서 목록에 설 때 색이 안 바뀐다. */}
                  <span
                    className={`flex size-[30px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white ${
                      nameTagColorClass(request.display_name) ?? OWNER_TAG_PALETTE[0]
                    }`}
                  >
                    {request.display_name.slice(0, 3)}
                  </span>
                  {/* 이름은 끝까지 남고 이메일만 줄어든다. 누구를 들일지 정하는 자리라
                      이름이 잘리면 안 된다. */}
                  <div className="flex min-w-0 flex-1 items-baseline gap-[5px]">
                    <span className="shrink-0 text-[15.5px] font-bold tracking-[-0.015em] text-foreground">
                      {request.display_name}
                    </span>
                    {/* 이름은 신청자가 직접 적는 값이라 '딸'만 보고는 내 딸인지 남인지
                        가릴 수 없다. 바꿀 수 없는 값을 하나 옆에 둔다.
                        서버가 가려서 내려준다(supabase/join-request-email.sql). 아직 안
                        돌렸으면 이 값이 없고, 그때는 괄호를 아예 안 그린다. */}
                    {request.email_masked && (
                      <span className="min-w-0 truncate text-[13px] font-medium text-muted-foreground">
                        ({request.email_masked})
                      </span>
                    )}
                  </div>
                </div>
                {/* 되돌릴 수 없는 판단을 하는 자리라 32 → 40px.
                    반반으로 나누지 않는다. 승인이 훨씬 흔한 쪽이라 그쪽에 남은 자리를 준다 —
                    반반이면 둘이 똑같이 그럴듯해 보인다. */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-10 shrink-0 rounded-[11px] px-5 text-sm font-semibold text-muted-foreground"
                    disabled={deciding === request.id}
                    onClick={() => decide(request, false)}
                  >
                    거절
                  </Button>
                  <Button
                    className="h-10 flex-1 rounded-[11px] text-sm font-bold"
                    disabled={deciding === request.id}
                    onClick={() => decide(request, true)}
                  >
                    승인
                  </Button>
                </div>
              </div>
            ))}
            {error && <p className="m-0 text-[13px] font-medium text-destructive">{error}</p>}
          </div>
        )}

        {/* 코드는 읽는 것이고 복사는 누르는 것이라 자리를 나눈다. 한 줄에 같이 두면 여섯
            글자와 버튼이 자리를 다투는데, 떼어놓으면 그만큼 코드가 커진다(26 → 29px).
            회색이다. 화면에 보라 카드는 하나만 — 위 승인 카드와 나란히 보라면 어느 쪽이
            급한지 알 수 없다. 테두리도 걷었다. 이 앱에서 테두리는 누르거나 입력하는
            것의 표시다. */}
        <div className="mx-5 mb-3 flex flex-col gap-2.5 rounded-2xl bg-secondary/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="m-0 text-[13px] font-bold tracking-[-0.01em] text-muted-foreground">초대 코드</p>
            {/* 이 창을 여는 가장 큰 이유가 코드를 전달하는 것이라 채운 버튼이다. */}
            <CopyButton
              value={family.invite_code}
              label="복사"
              copiedLabel="복사됨"
              className="h-9 shrink-0 rounded-[10px] bg-primary px-3.5 text-[13.5px] font-bold text-primary-foreground"
            />
          </div>
          <p className="m-0 font-mono text-[29px] leading-none font-bold tracking-[0.14em] text-foreground">
            {family.invite_code}
          </p>
          <p className="m-0 text-[13px] leading-snug font-medium break-keep text-muted-foreground">
            코드를 받은 사람이 참여를 신청하면, 여기서 승인해야 들어와요.
          </p>

          {/* 링크로 보내면 걸음이 하나로 줄어든다.
              코드만 알려주던 때는 받는 사람이 앱을 깔고, 로그인하고, '참여하기'를 찾아
              들어가서, 여섯 글자를 옮겨 적어야 했다. 걸음마다 사람이 샌다. 링크를 누르면
              코드가 이미 박힌 화면이 뜨고 이름만 적으면 끝난다.

              코드는 그대로 위에 남겨둔다. 카톡을 안 쓰는 분도 있고, 여섯 글자는 전화로도
              불러줄 수 있다. 링크는 빠른 길이지 유일한 길이 아니다.

              링크가 새도 대표가 승인해야 들어온다 — 서버가 하는 일은 코드를 손으로 적었을
              때와 똑같다(request_join_family). */}
          <div className="flex gap-2 pt-0.5">
            {prefersKakao() && (
              <Button
                type="button"
                onClick={() => invite(true)}
                className="h-11 flex-1 rounded-[11px] bg-[#FEE500] text-[14px] font-bold text-[#191600] hover:bg-[#FEE500]/90"
              >
                <MessageCircle className="size-4" />
                카톡으로 초대
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => invite(false)}
              className={cn(
                'h-11 rounded-[11px] bg-card text-[14px] font-semibold',
                prefersKakao() ? 'shrink-0 px-4' : 'flex-1'
              )}
            >
              <Link2 className="size-4 text-muted-foreground" />
              {prefersKakao() ? '링크' : '초대 링크 보내기'}
            </Button>
          </div>

          {shareNote && (
            <p className="m-0 text-[13px] leading-snug font-medium break-keep text-primary">{shareNote}</p>
          )}
        </div>

        {/* '혼자 쓰는 중/가족 N명'은 구성원 목록의 머리말이다. 한때 승인 대기 상자 위에
            있었는데, 그러면 "혼자 쓰는 중" 밑에 참여 신청이 붙어 서로 다른 이야기가 한
            덩어리로 읽혔다. 세는 대상 바로 위에 둔다. */}
        <p className="m-0 px-5 pt-3 pb-1 text-xs font-semibold text-muted-foreground">
          {members.length > 1 ? `가족 ${members.length}명` : '혼자 쓰는 중'}
        </p>

        {/* 대표는 "가장 먼저 들어온 사람"이다(목록은 들어온 순서대로 온다). 가족을 만든 사람이
            늘 첫 번째라 평소에는 만든 사람이지만, 그 사람이 나가면 다음으로 먼저 들어온
            사람이 자연히 대표가 된다. 따로 넘겨주는 기능은 없다. */}
        <ul className="m-0 flex list-none flex-col gap-1 px-5 pt-2">
          {members.map((member, index) => (
            <li key={member.user_id} className="flex items-center gap-3 rounded-xl px-0.5 py-3">
              <span
                className={`flex size-[38px] shrink-0 items-center justify-center rounded-full text-[12.5px] font-bold text-white ${
                  memberTagColorClass(member) ?? OWNER_TAG_PALETTE[0]
                }`}
              >
                {member.display_name.slice(0, 3)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 truncate text-[15.5px] font-bold tracking-[-0.015em] text-foreground">
                    {member.display_name}
                  </span>
                  {/* 글자만 있으면 이름의 일부처럼 읽힌다("아들 나"). 뱃지로 떼어놓는다. */}
                  {member.user_id === user.id && (
                    <span className="shrink-0 rounded-[5px] bg-primary px-1.5 py-px text-xs font-bold text-primary-foreground">
                      나
                    </span>
                  )}
                  {/* 권한이 더 있는 건 아니고, 누구에게 물어보면 되는지 알려주는 표시다.
                      혼자면 물어볼 사람도 나뿐이라 붙일 이유가 없다. */}
                  {index === 0 && members.length > 1 && (
                    <span className="shrink-0 rounded-[5px] bg-accent px-1.5 py-px text-xs font-bold text-primary">
                      대표
                    </span>
                  )}
                </div>
                {/* 이메일은 여기 안 적는다. 한 줄에 같이 뒀더니 390px에서 날짜가
                    '2026.01.0…'으로 잘렸다 — 잘린 날짜는 안 적은 것만 못하다.
                    이 줄이 필요한 자리는 내보내기 하나뿐이라, 그 물음창에서만 보여준다. */}
                <span className="text-[13px] font-medium tabular-nums text-muted-foreground">
                  {formatDate(member.created_at)}부터 함께
                </span>
              </div>
              {/* 내 줄에만 붙는다. 남의 이름은 바꿀 수 없다 — renameMember는 이 가족에서
                  쓰는 내 이름만 바꾼다.
                  테두리를 두르는 이유는 글자만 있는 버튼 금지 규칙의 아이콘 판이다.
                  아이콘만 덩그러니 있으면 장식인지 누를 것인지 알 수 없다. */}
              {member.user_id === user.id && (
                <button
                  type="button"
                  onClick={() => setMyNameOpen(true)}
                  aria-label="내 이름 바꾸기"
                  className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-input"
                >
                  <Pencil className="size-4 text-muted-foreground" />
                </button>
              )}
              {/* 내보내기는 대표에게만, 남의 줄에만 붙는다.
                  초대 코드는 여섯 자리라 단톡방에 잘못 붙기도 하고, 승인은 한 번 누르면
                  그것으로 끝이었다. 되돌릴 수 없는 결정에 되돌리는 문이 없으면 승인
                  자체가 무서운 일이 된다.
                  내 줄에는 연필이 있고, 스스로 빠지는 것은 '가족 나가기'가 한다. */}
              {iAmLeader && member.user_id !== user.id && (
                <button
                  type="button"
                  onClick={() => setKicking(member)}
                  aria-label={`${member.display_name} 내보내기`}
                  className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-input"
                >
                  <UserMinus className="size-4 text-muted-foreground" />
                </button>
              )}
            </li>
          ))}
        </ul>

        {error && <p className="m-0 px-5 pt-2 text-[13px] font-medium text-destructive">{error}</p>}

        {/* 되돌릴 수 없다. 무엇이 사라지는지 미리 다 적어둔다 — 누르고 나서 알게 되면
            그때는 이미 늦다. */}
        {kicking && (
          <AlertDialog
            tone="warning"
            icon={UserMinus}
            title="이 가족에서 내보낼까요?"
            subject={
              kicking.email_masked ? `${kicking.display_name} (${kicking.email_masked})` : kicking.display_name
            }
            details={[
              '올린 기프티콘이 목록에서 사라져요',
              '남긴 메모와 기록에서도 이름이 지워져요',
              '다시 들이려면 초대 코드로 새로 신청해야 해요',
            ]}
            confirmLabel="내보내기"
            onConfirm={() => kick(kicking)}
            onClose={() => setKicking(null)}
          />
        )}

        {renameOpen && (
          <RenameSheet
            title="가족 이름 바꾸기"
            label="가족 이름"
            hint="가족 모두에게 보여요"
            initialValue={family.name}
            placeholder="예: 우리 가족"
            onSubmit={async (name) => {
              await renameFamily(family.id, name);
              await refreshFamily();
            }}
            onClose={() => setRenameOpen(false)}
          />
        )}

        {myNameOpen && (
          <RenameSheet
            title="내 이름 바꾸기"
            label="내 이름"
            description="이 가족에서 쓰는 이름이에요. 기프티콘에 적힌 이름도 함께 바뀌어요."
            initialValue={members.find((m) => m.user_id === user.id)?.display_name || ''}
            placeholder="예: 아빠"
            onSubmit={async (name) => {
              await renameMember(family.id, name);
              await refreshFamily();
            }}
            onClose={() => setMyNameOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
