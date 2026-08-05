import { CalendarOff } from 'lucide-react';
import GifticonCard from './GifticonCard';

export default function GifticonList({ gifticons, onViewCode, onViewImage, onToggleUsed, onEdit, onDelete, onFindStores, onToggleClaim }) {
  if (gifticons.length === 0) {
    return (
      <div className="px-5 py-15 text-center text-muted-foreground">
        <p>등록된 기프티콘이 없어요.</p>
        <p className="mt-1.5 text-[13px]">오른쪽 아래 + 버튼으로 첫 기프티콘을 추가해보세요.</p>
      </div>
    );
  }

  // 이미지에서 유효기한을 못 읽으면 빈칸으로 남는데, 기한이 없으면 만료 알림도 못 보낸다.
  // 카드마다 "미입력"이라고는 적혀 있지만 목록을 다 훑어야 몇 개인지 알 수 있어서,
  // 위에서 한 번에 알려준다. 다 채우면 저절로 사라진다.
  // 이미 쓴 것은 세지 않는다. 기한이 지나든 말든 상관없는 것들이라 채우라고 할 이유가 없다.
  const missingExpiry = gifticons.filter((g) => g.status !== 'used' && !g.expires_at).length;

  return (
    <>
      {missingExpiry > 0 && (
        <p className="m-0 mb-3 flex items-start gap-1.5 rounded-xl bg-secondary px-3 py-2.5 text-xs leading-relaxed break-keep text-muted-foreground">
          <CalendarOff className="mt-0.5 size-3.5 shrink-0" />
          <span>
            유효기한을 안 적은 기프티콘이 <b className="font-semibold text-foreground">{missingExpiry}개</b> 있어요. 기한을 채워야 만료
            전에 알려드릴 수 있어요.
          </span>
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {gifticons.map((g) => (
          <GifticonCard
            key={g.id}
            gifticon={g}
            onViewCode={onViewCode}
            onViewImage={onViewImage}
            onToggleUsed={onToggleUsed}
            onEdit={onEdit}
            onDelete={onDelete}
            onFindStores={onFindStores}
            onToggleClaim={onToggleClaim}
          />
        ))}
      </ul>
    </>
  );
}
