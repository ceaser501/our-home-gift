import { useState } from 'react';
import { CheckCircle2, Heart, Info, MapPin, MoreVertical, Pencil, RotateCcw, Ticket, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CATEGORIES } from '../constants';
import { formatDday, formatDate, ddayUrgency } from '../utils/date';
import { nameTagColorClass, tagColorClass } from '../utils/tagColor';
import { cn } from '@/lib/utils';
import { useFamily } from '../FamilyContext';

function categoryLabel(key) {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

// 유효기한이 일주일 안으로 남은 것만 붉은색을 가진다. 나머지는 천천히 써도 되는 것들이라
// 회색으로 조용히 둔다. 목록에 색이 하나뿐이라야 급한 게 눈에 바로 들어온다.
const DDAY_CLASS = {
  normal: 'bg-secondary text-foreground/70',
  soon: 'bg-destructive/15 text-destructive',
  urgent: 'bg-destructive/15 text-destructive',
  expired: 'bg-muted text-muted-foreground',
};

// 카드 아래 한 줄로 붙는 버튼들. 폭을 똑같이 나눠 가져서 누르기 쉽다.
const BAR_BUTTON = 'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold';

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

  // 기한이 지난 것은 "며칠 지났나"를 아래 버튼 라벨이 맡는다. 여기서까지 되풀이하면
  // "기한 만료 (6일 지남) · 2026.07.31까지"가 되어 칩 하나가 두 줄로 접힌다.
  // 날짜는 남긴다 — 언제까지였는지는 다른 카드와 같은 자리에서 읽혀야 한다.
  const ddayLabel = isExpired
    ? `${formatDate(gifticon.expires_at)}까지`
    : `${formatDday(gifticon.expires_at)} · ${formatDate(gifticon.expires_at)}까지`;

  // "이건 내가 쓸게" 표시. 잠금이 아니라 표시라, 남이 찜해뒀어도 바코드는 그대로 열린다.
  const claimed = Boolean(gifticon.claimed_by);
  const claimedByMe = gifticon.claimed_by === user.id;

  // 카드가 여러 장 쌓이면 연한 테두리만으로는 어디서 끊기는지 잘 안 보인다. 선을 진하게
  // 하면 목록이 격자처럼 딱딱해지므로, 대신 카드를 배경에서 살짝 띄운다(shadow-sm) —
  // 그림자는 경계를 그리지 않고도 "이건 한 장"이라고 말해준다. 목록 쪽 간격도 조금 벌렸다.
  return (
    <li className={cn('relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm', codeLocked && 'opacity-60')}>
      <div className="relative flex gap-3 p-3">
        {/* 계산대 앞에서 제일 급한 동작이 바코드 열기라, 이 윗칸 전체를 그 버튼으로 쓴다.
            사진만 눌리게 두면 68px짜리 과녁을 조준해야 하는데, 계산대 앞에서 그건 작다.
            빈자리까지 포함해 어디를 눌러도 열리게 깔아둔 판이다.

            글자 위에도 얹혀야 해서 내용 뒤가 아니라 앞에 깔고, 내용 쪽은 pointer-events를
            꺼서 누름이 이 판으로 떨어지게 한다. 오른쪽 위 ⋮ 만 예외로 자기 클릭을 가져간다
            (거긴 수정·삭제라, 바코드를 열려다 잘못 누르면 곤란하다). */}
        <button
          type="button"
          className="absolute inset-0"
          onClick={() => (canOpenCode ? onViewCode(gifticon) : onViewImage(gifticon))}
          aria-label={canOpenCode ? '바코드 보기' : '업로드한 이미지 보기'}
        />

        {/* 사진을 분류 아이콘으로 바꾸지 않는 이유: 사람은 기프티콘을 "스타벅스 초록색 그거"로
            기억한다. 브랜드 색은 글자보다 빨리 읽히고, 내가 올린 사진이라야 내 지갑처럼 느껴진다.

            보여주는 건 올린 사진 전체가 아니라 상품 사진만 잘라낸 것(thumb_image_url)이다.
            대개 선물함 화면을 통째로 찍은 캡처라, 68px로 줄이면 글자와 버튼까지 뭉개져 들어가
            무슨 상품인지 알아볼 수 없다. 못 잘라낸 것은 예전처럼 첫 사진을 그대로 쓴다. */}
        {/* 흰 배경 상품 사진은 카드와 경계가 없어 허공에 떠 보인다. 아주 연한 선으로
            "여기까지가 사진"이라고만 알려준다. 진하면 사진보다 테두리가 먼저 보인다. */}
        <span className="pointer-events-none relative flex size-17 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-accent">
          {thumbUrl ? (
            <img src={thumbUrl} alt={gifticon.name} className="h-full w-full object-cover" />
          ) : (
            <Ticket className="size-6 text-primary/60" />
          )}
          {codeLocked && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-bold text-white">
              {isUsed ? '사용완료' : '기한만료'}
            </span>
          )}
          {photoCount > 1 && (
            <span className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 py-px text-[10px] font-bold text-white">
              {photoCount}
            </span>
          )}
        </span>

        <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col">
          {/* 받은 사람은 진한 이름표 대신 이름 앞 작은 점으로. 색은 그대로라 누구 건지는 그대로 구분된다.
              분류는 썸네일에서 빼기로 했으므로 이 줄이 유일한 분류 표시다. */}
          <span className="flex items-center gap-1.5 pr-7 text-[11px] text-muted-foreground">
            {gifticon.owner && <i className={cn('size-1.5 shrink-0 rounded-full', ownerDotClass)} />}
            <span className="truncate">
              {[gifticon.owner, categoryLabel(gifticon.category)].filter(Boolean).join(' · ')}
            </span>
          </span>

          {/* 이름 → 금액 → 기한 순. 앞의 둘은 "이게 뭔지"를 말하는 상품 정보라 붙어 있고,
              언제까지 써야 하는지는 성격이 달라서 맨 아래에 따로 앉힌다.
              찜은 아래 버튼이 직접 "○○ 찜"으로 말해주므로 여기에 또 적지 않는다. */}
          <p className="mt-0.5 mb-0.5 truncate pr-7 text-[15px] font-bold text-foreground">{gifticon.name}</p>
          {/* 금액권은 액면가보다 "지금 얼마 남았나"가 먼저다. 계산대 앞에서 알아야 할 값이라
              잔액을 진하게 적고, 얼마짜리였는지는 옆에 옅게 붙인다. */}
          {gifticon.amount ? (
            isVoucher && spent > 0 ? (
              <p className="mb-1 text-[13px] text-foreground">
                <b className="font-bold">{left.toLocaleString()}원</b>
                <span className="ml-1 text-muted-foreground">남음 · {Number(gifticon.amount).toLocaleString()}원권</span>
              </p>
            ) : (
              <p className="mb-1 text-[13px] text-muted-foreground">
                {Number(gifticon.amount).toLocaleString()}원{isVoucher ? '권' : ''}
              </p>
            )
          ) : null}

          {!isUsed &&
            (gifticon.expires_at ? (
              // 기한이 급한 것만 눌러서 연장 안내를 연다. 연장이 필요한 순간에는 이미 눈이
              // 이 붉은 칩에 가 있어서, 정보 아이콘을 따로 두는 것보다 여기가 낫다.
              // 넉넉한 것(회색 칩)은 안 누르게 둔다 — 아직 할 일이 없는데 눌리면 헛걸음이다.
              // pointer-events는 위 칸 전체가 꺼져 있어서(카드 어디를 눌러도 바코드가 열린다)
              // 이 칩에서만 다시 켜준다.
              canExtend ? (
                <button
                  type="button"
                  onClick={() => onExtend(gifticon)}
                  className={cn(
                    'pointer-events-auto mt-0.5 inline-flex items-center gap-1 self-start rounded-full px-2 py-0.5 text-xs font-bold',
                    DDAY_CLASS[urgency]
                  )}
                >
                  {ddayLabel}
                  <Info className="size-3.5" />
                </button>
              ) : (
                <p className={cn('mt-0.5 inline-block self-start rounded-full px-2 py-0.5 text-xs font-bold', DDAY_CLASS[urgency])}>
                  {ddayLabel}
                </p>
              )
            ) : (
              // 기한을 안 적으면 이 자리가 통째로 비어서, 기한이 넉넉한 것과 구분이 안 됐다.
              // 빈칸 대신 "안 적혔다"고 말해준다. 급한 일은 아니므로 붉은색은 쓰지 않는다
              // (목록에서 붉은색은 기한이 임박한 것 하나만 가져야 눈에 들어온다).
              <p className="mt-0.5 inline-block self-start rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-bold text-muted-foreground">
                유효기한 미입력
              </p>
            ))}

          {/* 누가 썼는지 목록에서 바로 보이게 한다("이거 누가 썼어?"를 굳이 안 물어보게). */}
          {isUsed && (gifticon.used_at || gifticon.used_by_name) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[gifticon.used_at && `${formatDate(gifticon.used_at)} 사용`, gifticon.used_by_name && `${gifticon.used_by_name}님이 씀`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>

        {/* 수정·삭제는 자주 쓰지 않아서 평소엔 접어둔다. */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="더 보기"
          className="absolute top-2 right-1.5 rounded-full p-1.5 text-muted-foreground"
        >
          <MoreVertical className="size-4" />
        </button>
      </div>

      {/* 왼쪽부터 알아보는 것 → 가볍게 정하는 것 → 되돌리기 번거로운 것.
          "어디서 쓰지 → 내가 쓸게 → 다 썼다"라는 실제 순서와 같고,
          제일 무거운 동작이 끝에 있어 잘못 누를 일이 줄어든다. */}
      <div className="flex border-t border-border">
        {codeLocked ? (
          <>
            {/* 왼쪽은 상태를 말하는 이름표다. 기한이 지난 것은 여기서 "며칠 지났는지"까지
                말해준다 — 위 칩에서 뺀 그 말이 이 자리로 왔다. */}
            <span className={cn(BAR_BUTTON, 'text-muted-foreground')}>
              {isUsed ? '사용완료' : formatDday(gifticon.expires_at)}
            </span>
            {/* 사용취소는 사용완료로 표시한 것만 되돌린다. 기한이 지난 것은 완료로 표시한
                적이 없어서 되돌릴 것이 없고, 대신 반대쪽 길이 필요하다 — 실제로는 썼는데
                표시를 안 해둔 것. 결산에서 "이미 쓰셨다면 사용완료로 바꿔주세요"라고
                안내하는 그 동작이 여기다. */}
            <button
              type="button"
              onClick={() => onToggleUsed(gifticon)}
              className={cn(BAR_BUTTON, 'border-l border-border text-foreground')}
            >
              {isUsed ? (
                <RotateCcw className="size-4 text-muted-foreground" />
              ) : (
                <CheckCircle2 className="size-4 text-muted-foreground" />
              )}
              {isUsed ? '사용취소' : '사용완료'}
            </button>
          </>
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
              className={cn(BAR_BUTTON, 'min-w-0 border-l border-border', claimed ? 'text-primary' : 'text-foreground')}
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
        <Sheet open onOpenChange={(open) => !open && setMenuOpen(false)}>
          <SheetContent className="gap-0 pb-[max(24px,env(safe-area-inset-bottom))]">
            <SheetHeader className="pr-14 pb-1">
              <SheetTitle className="truncate">{gifticon.name}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col px-5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(gifticon);
                }}
                className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-foreground"
              >
                <Pencil className="size-4.5 text-muted-foreground" />
                수정
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(gifticon);
                }}
                className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm text-destructive"
              >
                <Trash2 className="size-4.5" />
                삭제
              </button>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </li>
  );
}
