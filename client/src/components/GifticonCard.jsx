import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Heart, Info, MapPin, MoreVertical, Pencil, RotateCcw, Ticket, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDday, formatDate, ddayUrgency } from '../utils/date';
import { nameTagColorClass, tagColorClass } from '../utils/tagColor';
import { cn } from '@/lib/utils';
import { useFamily } from '../FamilyContext';
import useBackClose from '../utils/useBackClose';

// 카드 아래 한 줄로 붙는 버튼들. 폭을 똑같이 나눠 가져서 누르기 쉽다.
//
// 한 번 각각에 테두리를 둘러 알약 모양으로 바꿔봤다. 테두리가 '누르는 것'을 가리킨다는
// 규칙(01)을 따른 것인데, 셋을 나란히 놓으니 안쪽 여백만큼 눌리는 면이 줄어 오히려 작아
// 보였다. 원래대로 칸을 구분선으로만 나눈다 — 카드 폭을 끝까지 쓰는 쪽이 넓다.
//
// 대신 높이를 44px로 올렸다. 손가락 하나가 온전히 들어가는 크기다.
const BAR_BUTTON = 'flex h-11 flex-1 items-center justify-center gap-1.5 text-[13px] font-semibold';

// 카드의 ⋮ 메뉴. 따로 떼어낸 이유가 둘 있다.
//
// 하나는 뒤로가기다. 훅은 조건부로 부를 수 없어서 카드 본체에서는 useBackClose를 걸 수
// 없었는데, 그러면 이 창이 떠 있을 때 뒤로가기가 앱을 통째로 끈다. 창 아래가 제스처 바에
// 가까워서 삭제를 누르려다 뒤로가기가 먹는 일도 있다 — 그때 앱이 꺼져버렸다.
//
// 다른 하나는 다음 창을 여는 시점이다. 이 창을 닫으면서 같은 순간에 수정 창을 열면,
// 웹뷰에서 닫히는 창이 body의 클릭을 막아둔 채로 남아 화면 전체가 눌리지 않게 된다.
// 그래서 이 창이 완전히 닫힌 다음에 다음 창을 연다.
function CardMenuSheet({ gifticon, onClose, onEdit, onDelete }) {
  useBackClose(onClose);
  const pendingRef = useRef(null);

  // 이 창이 화면에서 완전히 사라진 다음에 고른 일을 한다. 순서가 뒤집히면
  // 새 창이 먼저 뜨고 이 창이 나중에 정리되면서, 정리하는 쪽이 화면 전체의 클릭을
  // 막아둔 상태를 그대로 남긴다.
  useEffect(() => {
    return () => {
      const action = pendingRef.current;
      if (action) setTimeout(() => action(gifticon), 0);
    };
  }, [gifticon]);

  function choose(action) {
    pendingRef.current = action;
    onClose();
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 pb-[var(--safe-bottom)]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle className="truncate">{gifticon.name}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col px-5 pt-2">
          <button
            type="button"
            onClick={() => choose(onEdit)}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-foreground"
          >
            <Pencil className="size-4.5 text-muted-foreground" />
            수정
          </button>
          <button
            type="button"
            onClick={() => choose(onDelete)}
            className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-destructive"
          >
            <Trash2 className="size-4.5" />
            삭제
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function GifticonCard({
  gifticon,
  onViewCode,
  onViewImage,
  onToggleUsed,
  onEdit,
  onDelete,
  onFindStores,
  onToggleClaim,
  onExtend,
  onSpend,
}) {
  const { members, user } = useFamily();
  // 뒤로가기 처리는 CardMenuSheet가 직접 한다. 여기서도 걸면 표시가 두 번 쌓여서
  // 뒤로가기를 두 번 눌러야 창이 닫힌다.
  const [menuOpen, setMenuOpen] = useState(false);
  const isUsed = gifticon.status === 'used';
  const urgency = isUsed ? 'none' : ddayUrgency(gifticon.expires_at);
  // 이름표 색은 가족에 들어올 때 정해진 번호(tag_color)를 쓴다. 목록에서 몇 번째냐로
  // 정하면 누가 빠졌을 때 남은 사람들 색이 밀린다. 아직 번호가 없는(예전) 데이터는
  // 예전과 같은 순서 기준으로 보여준다.
  const ownerIndex = members.findIndex((m) => m.display_name === gifticon.owner);
  // 지금 가족에 있는 사람은 그 사람의 색 번호를, 없는 이름(나간 사람 등)은 이름에서 뽑은
  // 색을 쓴다. 전부 회색으로 뭉개면 목록에서 누구 것인지 구분이 사라진다.
  const ownerDotClass =
    tagColorClass(members[ownerIndex]?.tag_color ?? ownerIndex) ||
    nameTagColorClass(gifticon.owner) ||
    'bg-muted-foreground';

  // 이미 쓴 것과 기한이 지난 것은 매장에서 쓸 수 없으니 바코드를 열지 않는다.
  // 둘은 "이제 못 쓰는 것"이라는 점에서 같아서, 흐리게 깔고 목록 아래로 내리는 것까지
  // 같이 간다. 기한이 지난 것만 멀쩡한 얼굴로 맨 위에 있으면 쓸 수 있는 줄 안다.
  const isExpired = urgency === 'expired';
  const codeLocked = isUsed || isExpired;
  // 열 바코드가 실제로 있는지. 없는데 띠를 붙이면 눌러보고 나서야 없는 걸 알게 된다.
  const canOpenCode = !codeLocked && Boolean(gifticon.code || gifticon.barcode_image_url);
  const photoCount = gifticon.image_urls?.filter(Boolean).length ?? 0;
  // 기한이 급한 것과 이미 지난 것만 연장 안내를 열 수 있다. 넉넉한 것은 아직 할 일이 없다.
  const canExtend = !isUsed && Boolean(gifticon.expires_at) && urgency !== 'normal';
  // 금액권은 쓴 만큼 깎아 나간다. 잔액이 남아 있으면 아직 쓸 수 있는 돈이라 사용완료가 아니다.
  const isVoucher = Boolean(gifticon.is_voucher) && Number(gifticon.amount) > 0;
  const spent = Number(gifticon.spent_amount || 0);
  const left = Math.max(0, Number(gifticon.amount || 0) - spent);
  // 상품 사진만 잘라낸 그림이 있으면 그걸 쓴다. 이 기능이 생기기 전에 올렸거나 잘라낼
  // 자리를 못 찾은 것은 예전처럼 첫 사진 그대로 보여준다.
  const thumbUrl = gifticon.thumb_image_url || gifticon.image_url;

  // 기한 줄은 D-day와 날짜 둘로 나눠 적는다. 예전에는 하나로 붙여 칩 안에 넣었는데,
  // 칩 배경이 목록을 시끄럽게 하고 두 값의 무게도 갈리지 않았다. D-day가 반 단 크고
  // 날짜가 그 뒤를 받친다.
  //
  // 기한이 지난 것은 D-day 자리에 '기한 만료 (6일 지남)'이 통째로 들어와 줄이 접혔다.
  // 그 말은 아래 버튼 자리에서 하고 여기서는 '지남'만 짧게 적는다.
  const ddayLabel = isExpired ? '기한 지남' : formatDday(gifticon.expires_at);
  // 급한 것만 붉은색을 가진다. 목록에 색이 하나뿐이라야 급한 게 눈에 바로 들어온다.
  const urgent = urgency === 'soon' || urgency === 'urgent';

  // 잔액이 있는 금액권과, 액면만 있는 보통 기프티콘. 기한 줄 오른쪽에 붙는다.
  const hasAmount = Number(gifticon.amount) > 0;
  const shownAmount = isVoucher && spent > 0 ? left : Number(gifticon.amount || 0);

  // "이건 내가 쓸게" 표시. 잠금이 아니라 표시라, 남이 찜해뒀어도 바코드는 그대로 열린다.
  const claimed = Boolean(gifticon.claimed_by);
  const claimedByMe = gifticon.claimed_by === user.id;

  // 그림자를 걷었다. 테두리 하나로 "이건 한 장"이 충분히 말해지고, 카드가 열 장 스무 장
  // 쌓이면 그림자가 목록 전체를 뿌옇게 만든다.
  //
  // 못 쓰는 것(만료·사용완료)에 opacity를 걸지 않는다. 흐림은 글씨까지 같이 흐려서
  // 60대에게는 안 읽히는 카드가 된다. 배경을 한 단 낮추고 글자색으로 말한다 —
  // 만료일도 뜻이 있는 값이라 읽히기는 해야 한다.
  return (
    <li
      className={cn(
        'relative overflow-hidden rounded-2xl border',
        codeLocked ? 'border-border/60 bg-muted/30' : 'border-border bg-card'
      )}
    >
      <div className="relative flex gap-3 p-[13px]">
        {/* 계산대 앞에서 제일 급한 동작이 바코드 열기라, 이 윗칸 전체를 그 버튼으로 쓴다.
            사진만 눌리게 두면 68px짜리 과녁을 조준해야 하는데, 계산대 앞에서 그건 작다.
            빈자리까지 포함해 어디를 눌러도 열리게 깔아둔 판이다.

            글자 위에도 얹혀야 해서 내용 뒤가 아니라 앞에 깔고, 내용 쪽은 pointer-events를
            꺼서 누름이 이 판으로 떨어지게 한다. 오른쪽 위 ⋮ 만 예외로 자기 클릭을 가져간다
            (거긴 수정·삭제라, 바코드를 열려다 잘못 누르면 곤란하다). */}
        {/* 사진 없이 손으로만 적어 넣은 기프티콘은 열어 보여줄 것이 없다. 그때는 눌리지
            않게 한다 — 눌러본 뒤에야 빈 창이라는 걸 알게 되는 편이 더 답답하다. */}
        <button
          type="button"
          className="absolute inset-0"
          disabled={!canOpenCode && photoCount === 0}
          onClick={() => (canOpenCode ? onViewCode(gifticon) : onViewImage(gifticon))}
          aria-label={canOpenCode ? '바코드 보기' : '업로드한 이미지 보기'}
        />

        {/* 사진을 분류 아이콘으로 바꾸지 않는 이유: 사람은 기프티콘을 "스타벅스 초록색 그거"로
            기억한다. 브랜드 색은 글자보다 빨리 읽히고, 내가 올린 사진이라야 내 지갑처럼 느껴진다.

            보여주는 건 올린 사진 전체가 아니라 상품 사진만 잘라낸 것(thumb_image_url)이다.
            대개 선물함 화면을 통째로 찍은 캡처라, 68px로 줄이면 글자와 버튼까지 뭉개져 들어가
            무슨 상품인지 알아볼 수 없다. 못 잘라낸 것은 예전처럼 첫 사진을 그대로 쓴다. */}
        {/* 테두리를 걷었다. 사진이 들어가면 사진의 가장자리와 테두리가 겹쳐 두 겹이 되고,
            사진이 없을 때는 아래 배경(bg-accent)이 이미 자리를 그린다. */}
        <span className="pointer-events-none relative flex size-[62px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent">
          {thumbUrl ? (
            <img src={thumbUrl} alt={gifticon.name} className="h-full w-full object-cover" />
          ) : (
            <Ticket className="size-6 text-primary/60" />
          )}
          {codeLocked && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-bold text-white">
              {isUsed ? '사용완료' : '기한만료'}
            </span>
          )}
          {photoCount > 1 && (
            <span className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 py-px text-[10px] font-bold text-white">
              {photoCount}
            </span>
          )}
        </span>

        <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-[5px]">
          {/* 1줄 — 받은 사람 · 상호.
              받은 사람은 진한 이름표 대신 이름 앞 작은 점으로. 색은 그대로라 누구 건지는
              그대로 구분된다.

              분류는 뺐다. '아들 · 스타벅스 · 카페·디저트'는 한 줄이 세 토막인데, 위의
              필터 칩이 이미 분류를 보여주고 상호만 봐도 짐작된다. 그 자리는 금액권일 때
              권종(5만원권)이 대신 쓴다 — 아래 기한 줄에는 잔액이 들어가므로, 얼마짜리
              였는지는 여기서 말해야 한다.

              상호가 상품명과 같으면 적지 않는다. 상호가 어디에도 안 적힌 기프티콘은
              상품명으로 상호를 메우는데(imageAnalyze), 그것까지 적으면 같은 글자가
              한 줄 사이로 두 번 나온다. */}
          <div className="flex items-center gap-1.5">
            {gifticon.owner && <i className={cn('size-1.5 shrink-0 rounded-full', ownerDotClass)} />}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
              {[
                gifticon.owner,
                gifticon.brand === gifticon.name ? null : gifticon.brand,
                isVoucher && hasAmount ? `${Number(gifticon.amount).toLocaleString()}원권` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>

          {/* 2줄 — 상품명. 찜은 아래 버튼이 직접 "○○ 찜"으로 말해주므로 여기 또 적지 않는다. */}
          <span
            className={cn(
              'truncate text-[15.5px] tracking-[-0.018em]',
              codeLocked ? 'font-medium text-muted-foreground' : 'font-semibold text-foreground'
            )}
          >
            {gifticon.name}
          </span>

          {/* 3줄 — 사용기한 | 금액. 카드마다 늘 이 자리다.
              예전에는 금액이 있으면 기한이 한 칸 밀려서 카드마다 자리가 달랐다. 목록을
              훑을 때 눈이 매번 기한을 다시 찾아야 했다.

              칩 배경을 걷고 글자로 풀었다. 목록이 조용해지고 급한 것만 붉게 남는다.
              tabular-nums라 날짜가 카드끼리 세로로 줄이 맞는다. */}
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 items-baseline gap-1.5">
              {gifticon.expires_at ? (
                <>
                  {/* 기한이 급한 것만 눌러서 연장 안내를 연다. 넉넉한 것은 안 누르게 둔다 —
                      아직 할 일이 없는데 눌리면 헛걸음이다. pointer-events는 위 칸 전체가
                      꺼져 있어서(카드 어디를 눌러도 바코드가 열린다) 여기서만 다시 켠다. */}
                  {canExtend ? (
                    <button
                      type="button"
                      onClick={() => onExtend(gifticon)}
                      className={cn(
                        'pointer-events-auto flex shrink-0 items-center gap-1 text-sm font-bold tracking-[-0.015em] tabular-nums',
                        urgent ? 'text-destructive' : 'text-foreground/80'
                      )}
                    >
                      {ddayLabel}
                      <Info className="size-3.5" />
                    </button>
                  ) : (
                    <span
                      className={cn(
                        'shrink-0 text-sm font-bold tracking-[-0.015em] tabular-nums',
                        urgent ? 'text-destructive' : 'text-foreground/80'
                      )}
                    >
                      {ddayLabel}
                    </span>
                  )}
                  <span
                    className={cn(
                      'truncate text-[13px] font-semibold tabular-nums',
                      urgent ? 'text-destructive' : 'text-muted-foreground'
                    )}
                  >
                    {formatDate(gifticon.expires_at)}까지
                  </span>
                </>
              ) : (
                // 기한을 안 적으면 이 자리가 통째로 비어서, 기한이 넉넉한 것과 구분이 안 됐다.
                // 빈칸 대신 "안 적혔다"고 말해준다. 급한 일은 아니므로 붉은색은 쓰지 않는다
                // (목록에서 붉은색은 기한이 임박한 것 하나만 가져야 눈에 들어온다).
                <span className="shrink-0 rounded-full border border-dashed border-input px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-muted-foreground">
                  유효기한 미입력
                </span>
              )}
            </div>

            {/* 금액은 얇은 세로선 뒤 오른쪽. 기한보다 반 단 작아서 둘 다 읽히되 기한이
                먼저다. 금액이 없으면 선까지 같이 사라져 빈 칸을 남기지 않는다 — 칸을
                따로 잡아두면 긴 상품명이 그만큼 폭을 잃는다. */}
            {hasAmount && (
              <>
                <span className="h-[11px] w-px shrink-0 bg-border" />
                <div className="flex shrink-0 items-baseline gap-0.5">
                  <span
                    className={cn(
                      'text-[13.5px] font-bold tabular-nums',
                      codeLocked ? 'text-muted-foreground' : 'text-foreground'
                    )}
                  >
                    {shownAmount.toLocaleString()}원
                  </span>
                  {/* 금액권은 액면가보다 "지금 얼마 남았나"가 먼저다. 계산대 앞에서 알아야
                      할 값이라 잔액을 적고, 얼마짜리였는지는 맨 윗줄이 말한다. */}
                  {isVoucher && spent > 0 && (
                    <span className="text-[11.5px] font-medium text-muted-foreground">남음</span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 누가 썼는지 목록에서 바로 보이게 한다("이거 누가 썼어?"를 굳이 안 물어보게). */}
          {isUsed && (gifticon.used_at || gifticon.used_by_name) && (
            <span className="truncate text-xs text-muted-foreground">
              {[gifticon.used_at && `${formatDate(gifticon.used_at)} 사용`, gifticon.used_by_name && `${gifticon.used_by_name}님이 씀`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>

        {/* 수정·삭제는 자주 쓰지 않아서 평소엔 접어둔다.
            absolute를 걷고 형제로 뒀다. 본문에 pr-7을 주지 않아도 되고, 누를 자리가
            24 → 32px이 된다. 만료·사용완료 카드에도 그대로 둔다 — 수정·삭제는 모든
            카드에서 되는 일이다.

            relative가 꼭 있어야 한다. 위에 카드 전체를 덮는 바코드 판(absolute inset-0)이
            깔려 있는데, 브라우저는 자리를 잡은 요소를 그렇지 않은 요소보다 항상 위에
            그린다. 이 relative가 빠지면 ⋮ 이 그 판 아래로 내려가서, 눌러도 바코드가 열린다. */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="더 보기"
          className="relative -mt-[3px] -mr-[3px] flex size-8 shrink-0 items-center justify-center rounded-[10px] text-muted-foreground/60"
        >
          <MoreVertical className="size-[17px]" />
        </button>
      </div>

      {/* 왼쪽부터 알아보는 것 → 가볍게 정하는 것 → 되돌리기 번거로운 것.
          "어디서 쓰지 → 내가 쓸게 → 다 썼다"라는 실제 순서와 같고,
          제일 무거운 동작이 끝에 있어 잘못 누를 일이 줄어든다. */}
      <div className="flex border-t border-border">
        {codeLocked ? (
          /* 상태를 말하던 왼쪽 이름표를 걷었다. 버튼 자리에 눌리지 않는 글자가 앉아
             있으면 눌러보게 되고, '며칠 지났는지'는 이미 위 기한 줄이 말한다.
             사용취소는 사용완료로 표시한 것만 되돌린다. 기한이 지난 것은 완료로 표시한
             적이 없어서 되돌릴 것이 없고, 대신 반대쪽 길이 필요하다 — 실제로는 썼는데
             표시를 안 해둔 것. 결산에서 "이미 쓰셨다면 사용완료로 바꿔주세요"라고
             안내하는 그 동작이 여기다. */
          <button type="button" onClick={() => onToggleUsed(gifticon)} className={cn(BAR_BUTTON, 'text-foreground')}>
            {isUsed ? (
              <RotateCcw className="size-4 text-muted-foreground" />
            ) : (
              <CheckCircle2 className="size-4 text-muted-foreground" />
            )}
            {isUsed ? '사용취소' : '이미 썼어요'}
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onFindStores(gifticon)} className={cn(BAR_BUTTON, 'text-foreground')}>
              <MapPin className="size-4 text-muted-foreground" />
              매장
            </button>

            {/* 누가 찜했는지를 버튼 자리에서 바로 말한다. 카드 위쪽에 안내 줄을 따로 두면
                한 가지 사실을 두 군데서 말하게 되고 카드만 길어진다. 남이 찜한 것을 눌러도
                막지 않는다 — 눌러보면 "○○님이 찜했어요"만 알려주고 쓸지는 본인이 정한다. */}
            <button
              type="button"
              onClick={() => onToggleClaim(gifticon)}
              className={cn(
                BAR_BUTTON,
                'min-w-0 border-l border-border',
                claimed ? 'font-bold text-primary' : 'text-foreground'
              )}
            >
              {/* 찜한 것은 하트를 채운다. 색만 바꾸면 작은 아이콘에서 구분이 잘 안 된다. */}
              <Heart className={cn('size-4 shrink-0', claimed ? 'fill-primary text-primary' : 'text-muted-foreground')} />
              <span className="truncate">
                {claimedByMe ? '찜해제' : claimed ? `${gifticon.claimed_by_name} 찜` : '찜하기'}
              </span>
            </button>

            {/* 금액권은 한 번에 다 쓰는 게 아니라 얼마를 썼는지 받아야 한다. 그래서 같은
                자리에서 바로 완료로 넘기지 않고 금액을 묻는 창을 연다.
                라벨도 "사용하기"가 아니라 "잔액입력"이다 — 눌렀을 때 실제로 하는 일이
                금액을 적는 것이라, 그대로 적어야 누르기 전에 무슨 일이 일어날지 안다. */}
            <button
              type="button"
              onClick={() => (isVoucher ? onSpend(gifticon) : onToggleUsed(gifticon))}
              className={cn(BAR_BUTTON, 'border-l border-border text-foreground')}
            >
              <CheckCircle2 className="size-4 text-muted-foreground" />
              {isVoucher ? '잔액입력' : '사용완료'}
            </button>
          </>
        )}
      </div>

      {menuOpen && (
        <CardMenuSheet
          gifticon={gifticon}
          onClose={() => setMenuOpen(false)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </li>
  );
}
