import { useEffect, useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { peekFamilyByCode, requestJoinFamily } from '../family';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgetInviteCode } from '../utils/inviteLink';
import { useFamily } from '../FamilyContext';
import useBackClose from '../utils/useBackClose';
import Logo from './Logo';

// 초대 링크를 눌러 온 사람이 보는 화면. 처음 쓰는 사람도, 이미 다른 가족이 있는 사람도
// 이 한 화면을 본다.
//
// ── 왜 하나로 모았나 ─────────────────────────────────────────────────────────
// 둘이 따로 있었다. 처음 쓰는 사람은 FamilyOnboarding 안의 '○○ 가족에 초대받았어요'를,
// 이미 가족이 있는 사람은 FamilySwitcherSheet의 '초대 코드로 참여' 양식을 봤다. 뒤쪽은
// 어느 가족이 불렀는지도 안 보이고 코드를 다시 적는 칸이 열려 있었다 — 앞쪽을 만들 때
// '코드 칸을 또 보여주면 링크로 줄여준 걸음이 도로 늘어난다'며 버린 바로 그 모양이다.
// 한쪽만 고쳐져서 벌어진 것이라, 다시 안 벌어지게 한 부품으로 만든다.
//
// 아래에서 올라오는 창(시트)이 아니라 화면 전체다. 이미 가족이 있는 사람도 기프티콘을
// 보다 온 게 아니라 카톡에서 초대를 눌러서 온 것이다 — 지금 할 일은 참여 하나다.
// 시트는 손가락이 스치면 내려가서 초대가 날아간다.
//
// ── 다른 것은 맨 아래 한 줄뿐 ───────────────────────────────────────────────
// 빠져나가는 길(escape)만 부르는 쪽이 정한다. 처음 쓰는 사람은 '다른 계정으로 로그인',
// 이미 쓰던 사람은 '나중에 할게요'. 이미 쓰던 사람에게 로그아웃을 두면, 잘못 온 초대를
// 거절하려다 로그아웃된다.
export default function InviteJoinScreen({ code, userEmail, onSubmitted, escapeLabel, onEscape }) {
  // 초대한 가족의 이름. 서버에 물어봐서 채운다 — 링크에 실어 보내면 보내는 사람이
  // 마음대로 적을 수 있어서, 화면이 거짓말을 하게 된다.
  // 못 물어보면 빈 채로 둔다. 그때는 이름 없이 '가족에 초대받았어요'로 연다.
  const [familyName, setFamilyName] = useState('');
  // 빈칸으로 시작한다. 이 이름은 가족 모두가 매일 보는 이름이라 자기 말로 짓게 한다.
  const [memberName, setMemberName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    peekFamilyByCode(code).then((name) => {
      if (!cancelled && name) setFamilyName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting || !memberName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      // 코드가 맞아도 바로 들어가지지 않는다. 기존 구성원이 승인해야 한다.
      const result = await requestJoinFamily(code, memberName.trim());
      // 다 썼다. 남겨두면 다음에 앱을 열 때 또 이 화면이 열린다.
      forgetInviteCode();
      onSubmitted(result);
    } catch (err) {
      setError(err.message || '참여 신청을 하지 못했어요.');
      setSubmitting(false);
    }
  }

  const who = familyName ? `'${familyName}' 가족에` : '가족에';

  return (
    <div className="mx-auto flex min-h-[calc(100dvh/var(--ui-scale))] w-full max-w-[480px] flex-col bg-background">
      {/* ── 보라 머리 ───────────────────────────────────────────────────────
          남는 높이를 나눠 갖되 끝이 있다(flex-1 + max-h). 내용은 그 가운데에 선다.

          두 번 고쳤다. 처음에는 이 머리가 제 키만큼만 차지하고 아래 양식이 남는 높이를
          다 가져가면서 버튼을 맨 밑으로 밀었다 — 이름 칸과 버튼 사이에 흰 구멍이 났다.
          그래서 남는 높이를 이쪽에 다 줬더니 이번엔 보라가 화면 절반을 넘어서 아래
          글자와 버튼이 몰려 답답했다. 둘 다 '한쪽이 남는 걸 다 가져간다'가 문제였다.
          지금은 머리도 조금, 버튼 위 틈(아래 spacer)도 조금 가져가고 둘 다 끝이 있다.

          위쪽 여백은 상태바 높이에 더한다(calc). 예전에는 둘 중 큰 값(max)이라, 상태바가
          34px을 넘는 아이폰에서는 로고가 상태바에 바로 붙었다. */}
      <header className="flex min-h-[240px] max-h-[calc(var(--safe-top)+300px)] flex-1 flex-col items-center justify-center gap-3.5 bg-accent px-6 pt-[calc(var(--safe-top)+28px)] pb-8">
        <Logo className="size-[68px]" />
        <h1 className="m-0 text-center text-[23px] leading-[1.38] font-bold tracking-[-0.03em] break-keep text-foreground">
          {who}
          <br />
          초대받았어요
        </h1>
        {/* 코드는 읽고 넘어가는 값이다. 맞게 들고 왔다는 표시(체크)까지 붙여서
            '이제 이름만 적으면 된다'가 눈에 들어오게 한다. */}
        <p className="m-0 mt-1 flex items-center gap-2.5 rounded-full border border-primary/20 bg-card px-4 py-2">
          <span className="text-[13.5px] font-semibold text-primary">초대 코드</span>
          <span className="font-mono text-[16px] font-bold tracking-[0.12em] text-foreground">{code}</span>
          <Check className="size-4 shrink-0 text-success" strokeWidth={2.6} />
        </p>
      </header>

      {/* ── 적는 자리 ──────────────────────────────────────────────────────
          버튼은 이름 칸 가까이에 둔다. 맨 밑으로 밀어두면 이름 칸을 눌러 자판이
          올라왔을 때 버튼이 그 뒤로 숨는다. 자판의 '완료'로도 보내지지만(폼이라서),
          눌러야 할 것이 눈앞에 있는 편이 낫다.

          다만 딱 붙이면 안내 두 줄·버튼·승인 안내·빠져나가는 길이 한 덩어리로 몰려
          답답하다. 이름 칸과 버튼 사이에 늘어나는 틈을 두되 끝을 정해둔다(spacer). */}
      <form onSubmit={handleSubmit} className="flex flex-1 flex-col px-6 pt-7 pb-7">
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-join-name" className="text-[16px] font-bold tracking-[-0.015em]">
            가족에게 어떻게 보일 이름인가요?
          </Label>
          <Input
            id="invite-join-name"
            value={memberName}
            onChange={(e) => setMemberName(e.target.value)}
            placeholder="예) 아빠, 엄마, 아들, 딸"
            className="h-14 rounded-[14px] text-[17px]"
            maxLength={20}
            autoComplete="off"
            autoFocus
            required
          />
          {/* 어느 계정으로 들어와 있는지 짚어준다. 로그인 수단을 여럿 두고 있어서,
              지난번과 다른 것으로 들어오면 같은 사람이 둘로 갈린다.

              두 문장을 한 줄로 이어 쓰면 폭에 따라 '있어요.' 한 마디만 다음 줄로
              떨어진다. 문장마다 줄을 갈라 둔다. */}
          <p className="m-0 flex flex-col text-[13.5px] leading-relaxed break-keep text-muted-foreground">
            {userEmail && (
              <span>
                <span className="font-semibold text-foreground/70">{userEmail}</span>으로 로그인했어요.
              </span>
            )}
            <span>이름은 나중에 바꿀 수 있어요.</span>
          </p>
        </div>

        {error && <p className="m-0 mt-4 text-sm break-keep text-destructive">{error}</p>}

        {/* 이름 칸과 버튼 사이의 틈. 폰 키에 따라 28~72px 사이에서 늘고 준다. */}
        <div aria-hidden="true" className="min-h-7 max-h-[72px] flex-1" />

        {/* 눌러도 바로 안 들어간다는 것을 미리 말해둔다. 안 말하면 신청하고 나서
            "왜 아직 안 보이지" 하고 다시 누른다.

            버튼 위에 둔다. 두 버튼 사이에 끼워뒀더니 버튼·글·버튼으로 토막 나서 두
            버튼이 한 짝으로 안 읽혔다. 누르기 전에 읽을 말이라 위가 제자리다. */}
        <p className="m-0 mb-3 text-center text-[13.5px] break-keep text-muted-foreground">
          {familyName ? `'${familyName}' 가족이` : '가족이'} 승인하면 함께 볼 수 있어요.
        </p>

        <div className="flex flex-col gap-2.5">
          <Button type="submit" className="h-14 w-full rounded-[14px] text-[17px] font-bold" disabled={submitting}>
            {submitting ? '신청하는 중…' : '참여 신청하기'}
          </Button>
          {/* 잘못 온 사람이 빠져나갈 길. 무엇을 하는지는 부르는 쪽이 정한다(위 머리말 주석).

              테두리 버튼이다. 이 앱에 테두리 없는 버튼은 없다 — 보라 버튼 밑에 놓이는
              두 번째 길은 어디서든 같은 모양이다(FamilyOnboarding의 승인 대기 화면,
              ExtendSheet·SpendSheet와 같다). 한 단 낮고 글자도 흐리게 해서 무게는 보라
              버튼에 둔다. */}
          {onEscape && (
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full rounded-[14px] text-[15px] font-semibold text-muted-foreground"
              onClick={onEscape}
            >
              {escapeLabel}
            </Button>
          )}
        </div>

      </form>

      {/* ── 바닥 띠 ────────────────────────────────────────────────────────
          카톡으로 날아간 초대 카드(public/kakao-share-800x400.png)와 같은 남색·같은
          슬로건이다. 초대받은 사람은 그 카드를 보고 눌러서 여기 왔다 — 바닥에서 그
          카드가 한 번 더 보이면 '방금 그 초대가 맞다'로 이어진다.

          버튼 밑에 흰 자리만 남아 있으면 화면이 덜 끝난 것처럼 보였다. 남는 높이는
          양식이 가져가고(flex-1) 띠는 바닥에 붙는다. 홈 바 자리(safe-bottom)도 띠가
          채운다.

          색은 그 카드에서 재 온 값이다 — 바탕 #2D2387→#21196A, 슬로건 #CDBFFF.
          슬로건도 카드·소개 페이지와 같은 '우리 가족 기프티콘 서랍'이다(스토어 부제
          '가족이 함께 쓰는 기프티콘 서랍'과는 다른 말이다). */}
      <footer className="flex items-center justify-center gap-2.5 bg-[linear-gradient(120deg,#2D2387,#21196A)] px-6 pt-4 pb-[calc(var(--safe-bottom)+12px)]">
        <Logo className="size-7" />
        <span className="text-[15px] font-bold tracking-[-0.02em] text-white">모아콘</span>
        <span className="text-[13.5px] font-semibold tracking-[-0.01em] text-[#CDBFFF]">우리 가족 기프티콘 서랍</span>
      </footer>
    </div>
  );
}

// ── 이미 가족이 있는 사람이 초대 링크를 눌렀을 때 ──────────────────────────────
//
// 목록 위에 화면 전체로 덮는다. 위 부품을 그대로 쓰고, 빠져나가는 길만 '나중에 할게요'다.
//
// 이미 그 가족인 사람이 눌렀으면 이 화면을 띄우지 않는다. 서버는 그때 이름만 바꾸고
// 'joined'로 끝내는데(request_join_family), 그러면 '초대받았어요'가 거짓말이 되고 적은
// 이름으로 원래 이름이 덮인다. 그 가족으로 옮겨주기만 하면 된다.
export function ExistingUserInvite({ code, onClose }) {
  const { user, family, families, switchFamily, refreshFamily } = useFamily();
  const [pendingFor, setPendingFor] = useState(null);
  const already = families.find((f) => String(f.invite_code || '').toUpperCase() === code);

  // 뒤로가기는 '나중에'와 같다. 안 걸면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(() => {
    forgetInviteCode();
    onClose();
  });

  useEffect(() => {
    if (!already) return;
    forgetInviteCode();
    if (already.id !== family.id) switchFamily(already.id);
    onClose();
    // 처음 한 번만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (already) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background">
      {pendingFor ? (
        <div className="mx-auto flex min-h-[calc(100dvh/var(--ui-scale))] w-full max-w-[480px] flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-accent">
            <Clock className="size-7 text-primary" />
          </span>
          <h1 className="m-0 text-[21px] font-bold tracking-[-0.028em] break-keep text-foreground">
            '{pendingFor}'에 참여를 신청했어요
          </h1>
          <p className="m-0 text-[15px] leading-relaxed break-keep text-muted-foreground">
            가족 구성원이 승인하면 가족 목록에 나타나요.
            <br />
            초대해준 분에게 말씀해주세요.
          </p>
          <Button className="mt-2 h-[52px] w-full rounded-[13px] text-[15.5px] font-bold" onClick={onClose}>
            알겠어요
          </Button>
        </div>
      ) : (
        <InviteJoinScreen
          code={code}
          userEmail={user.email}
          escapeLabel="나중에 할게요"
          onEscape={() => {
            forgetInviteCode();
            onClose();
          }}
          onSubmitted={async (result) => {
            if (result.status === 'joined') {
              await switchFamily(result.family_id);
              onClose();
              return;
            }
            setPendingFor(result.family_name);
            // 가족 바꾸기 창의 '승인 대기중' 줄이 바로 보이게 한다.
            refreshFamily?.();
          }}
        />
      )}
    </div>
  );
}
