import { Ticket } from 'lucide-react';
import { CATEGORIES } from '../constants';
import { formatDday, formatDate, ddayUrgency } from '../utils/date';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFamily } from '../FamilyContext';

function categoryLabel(key) {
  return CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

const OWNER_TAG_PALETTE = ['bg-[#4b7bec]', 'bg-[#e0559f]', 'bg-[#16a35a]', 'bg-[#e69008]', 'bg-[#0891b2]', 'bg-[#c026d3]'];

const DDAY_CLASS = {
  normal: 'bg-accent text-accent-foreground',
  soon: 'bg-warning/15 text-warning',
  urgent: 'bg-destructive/15 text-destructive',
  expired: 'bg-muted text-muted-foreground',
};

export default function GifticonCard({ gifticon, onViewCode, onViewImage, onToggleUsed, onEdit, onDelete }) {
  const { members } = useFamily();
  const isUsed = gifticon.status === 'used';
  const urgency = isUsed ? 'none' : ddayUrgency(gifticon.expires_at);
  // 이름표 색은 가족에 들어올 때 정해진 번호(tag_color)를 쓴다. 목록에서 몇 번째냐로
  // 정하면 누가 빠졌을 때 남은 사람들 색이 밀린다. 아직 번호가 없는(예전) 데이터는
  // 예전과 같은 순서 기준으로 보여준다.
  const ownerIndex = members.findIndex((m) => m.display_name === gifticon.owner);
  const colorIndex = members[ownerIndex]?.tag_color ?? ownerIndex;
  const ownerTagClass = colorIndex >= 0 ? OWNER_TAG_PALETTE[colorIndex % OWNER_TAG_PALETTE.length] : 'bg-muted-foreground';

  return (
    <li className={cn('relative flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-xs', isUsed && 'opacity-60')}>
      {gifticon.owner && (
        <span className={cn('absolute top-2.5 right-2.5 z-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white', ownerTagClass)}>
          {gifticon.owner}
        </span>
      )}

      <div className="flex w-19 shrink-0 flex-col gap-1.5">
        <button
          type="button"
          className="relative h-19 w-19 overflow-hidden rounded-xl bg-accent"
          onClick={() => onViewImage(gifticon)}
          aria-label="업로드한 이미지 보기"
        >
          {gifticon.image_url ? (
            <img src={gifticon.image_url} alt={gifticon.name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-2xl">
              <Ticket className="size-7 text-primary/60" />
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
        <div className="flex justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(gifticon)}
            className="flex-1 rounded-md border border-border bg-background py-1.5 text-xs font-semibold text-muted-foreground"
          >
            수정
          </button>
          <button
            type="button"
            onClick={() => onDelete(gifticon)}
            className="flex-1 rounded-md border border-border bg-background py-1.5 text-xs font-semibold text-muted-foreground"
          >
            삭제
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <span className="pr-11.5 text-xs text-muted-foreground">{categoryLabel(gifticon.category)}</span>
        <p className="mt-1 mb-0.5 truncate pr-11.5 text-[15px] font-bold text-foreground">{gifticon.name}</p>
        {gifticon.amount ? <p className="mb-1 text-[13px] text-muted-foreground">{Number(gifticon.amount).toLocaleString()}원</p> : null}

        {!isUsed && gifticon.expires_at && (
          <p className={cn('mt-0.5 mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold', DDAY_CLASS[urgency])}>
            {formatDday(gifticon.expires_at)} · {formatDate(gifticon.expires_at)}까지
          </p>
        )}
        {isUsed && gifticon.used_at && <p className="mt-0.5 mb-2 text-xs text-muted-foreground">{formatDate(gifticon.used_at)} 사용</p>}

        <div className="flex gap-2">
          <Button size="sm" className="flex-1 px-1" onClick={() => onViewCode(gifticon)}>
            바코드 보기
          </Button>
          <Button size="sm" variant="outline" className="flex-1 px-1" onClick={() => onToggleUsed(gifticon)}>
            {isUsed ? '사용취소' : '사용완료'}
          </Button>
        </div>
      </div>
    </li>
  );
}
