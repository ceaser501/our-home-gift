import { useState } from 'react';
import { Barcode, CheckCircle2, Hand, MapPin, MoreVertical, Pencil, RotateCcw, Ticket, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CATEGORIES } from '../constants';
import { formatDday, formatDate, ddayUrgency } from '../utils/date';
import { tagColorClass } from '../utils/tagColor';
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

export default function GifticonCard({ gifticon, onViewCode, onViewImage, onToggleUsed, onEdit, onDelete, onFindStores, onToggleClaim }) {
  const { members, user } = useFamily();
  const [menuOpen, setMenuOpen] = useState(false);
  const isUsed = gifticon.status === 'used';
  const urgency = isUsed ? 'none' : ddayUrgency(gifticon.expires_at);
  // 이름표 색은 가족에 들어올 때 정해진 번호(tag_color)를 쓴다. 목록에서 몇 번째냐로
  // 정하면 누가 빠졌을 때 남은 사람들 색이 밀린다. 아직 번호가 없는(예전) 데이터는
  // 예전과 같은 순서 기준으로 보여준다.
  const ownerIndex = members.findIndex((m) => m.display_name === gifticon.owner);
  const ownerDotClass = tagColorClass(members[ownerIndex]?.tag_color ?? ownerIndex) || 'bg-muted-foreground';

  // 이미 쓴 것과 기한이 지난 것은 매장에서 쓸 수 없으니 바코드를 열지 않는다.
  const isExpired = urgency === 'expired';
  const codeLocked = isUsed || isExpired;

  // "이건 내가 쓸게" 표시. 잠금이 아니라 표시라, 남이 찜해뒀어도 바코드는 그대로 열린다.
  const claimed = Boolean(gifticon.claimed_by);
  const claimedByMe = gifticon.claimed_by === user.id;

  return (
    <li className={cn('relative overflow-hidden rounded-2xl border border-border bg-card shadow-xs', isUsed && 'opacity-60')}>
      <div className="flex gap-3 p-3">
        <button
          type="button"
          className="relative size-17 shrink-0 overflow-hidden rounded-xl bg-accent"
          onClick={() => onViewImage(gifticon)}
          aria-label="업로드한 이미지 보기"
        >
          {gifticon.image_url ? (
            <img src={gifticon.image_url} alt={gifticon.name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Ticket className="size-6 text-primary/60" />
            </span>
          )}
          {isUsed && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] font-bold text-white">
              사용완료
            </span>
          )}
          {gifticon.image_urls?.length > 1 && (
            <span className="absolute right-1 bottom-1 rounded-full bg-black/60 px-1.5 py-px text-[10px] font-bold text-white">
              {gifticon.image_urls.length}
            </span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* 받은 사람은 진한 이름표 대신 이름 앞 작은 점으로. 색은 그대로라 누구 건지는 그대로 구분된다. */}
          <span className="flex items-center gap-1.5 pr-7 text-[11px] text-muted-foreground">
            {gifticon.owner && <i className={cn('size-1.5 shrink-0 rounded-full', ownerDotClass)} />}
            <span className="truncate">
              {[gifticon.owner, categoryLabel(gifticon.category)].filter(Boolean).join(' · ')}
            </span>
          </span>

          <p className="mt-0.5 mb-0.5 truncate pr-7 text-[15px] font-bold text-foreground">{gifticon.name}</p>
          {gifticon.amount ? <p className="mb-1 text-[13px] text-muted-foreground">{Number(gifticon.amount).toLocaleString()}원</p> : null}

          {!isUsed && gifticon.expires_at && (
            <p className={cn('mt-0.5 inline-block self-start rounded-full px-2 py-0.5 text-xs font-bold', DDAY_CLASS[urgency])}>
              {formatDday(gifticon.expires_at)} · {formatDate(gifticon.expires_at)}까지
            </p>
          )}
          {/* 찜은 다른 사람 보라고 하는 표시다. 카드에서 안 보이면 아무 소용이 없다. */}
          {!isUsed && claimed && (
            <p className="mt-1 inline-flex items-center gap-1 self-start rounded-full bg-primary/12 px-2 py-0.5 text-xs font-bold text-primary">
              <Hand className="size-3" />
              {claimedByMe ? '내가 쓸 예정' : `${gifticon.claimed_by_name}님이 쓸 예정`}
            </p>
          )}

          {/* 누가 썼는지 목록에서 바로 보이게 한다("이거 누가 썼어?"를 굳이 안 물어보게). */}
          {isUsed && (gifticon.used_at || gifticon.used_by_name) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
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

      <div className="flex border-t border-border">
        {codeLocked ? (
          <span className={cn(BAR_BUTTON, 'text-muted-foreground')}>{isUsed ? '사용완료' : '기한 만료'}</span>
        ) : (
          // 유효기한 칩이 회색이 되면서, 이제 카드에서 색을 가진 곳은 이 버튼 하나다.
          <button type="button" onClick={() => onViewCode(gifticon)} className={cn(BAR_BUTTON, 'bg-accent text-accent-foreground')}>
            <Barcode className="size-4" />
            바코드
          </button>
        )}

        <button type="button" onClick={() => onToggleUsed(gifticon)} className={cn(BAR_BUTTON, 'border-l border-border text-foreground')}>
          {isUsed ? <RotateCcw className="size-4 text-muted-foreground" /> : <CheckCircle2 className="size-4 text-muted-foreground" />}
          {isUsed ? '사용취소' : '사용완료'}
        </button>

        {!codeLocked && (
          <button
            type="button"
            onClick={() => onToggleClaim(gifticon)}
            className={cn(BAR_BUTTON, 'border-l border-border', claimedByMe ? 'text-primary' : 'text-foreground')}
          >
            <Hand className={cn('size-4', claimedByMe ? 'text-primary' : 'text-muted-foreground')} />
            {claimedByMe ? '찜 해제' : '찜하기'}
          </button>
        )}

        {/* 이미 썼거나 기한이 지난 건 매장에 갈 일이 없으니 뺀다. */}
        {!codeLocked && (
          <button type="button" onClick={() => onFindStores(gifticon)} className={cn(BAR_BUTTON, 'border-l border-border text-foreground')}>
            <MapPin className="size-4 text-muted-foreground" />
            매장
          </button>
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
