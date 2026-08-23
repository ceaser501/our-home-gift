import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PhotoFrame, PhotoNav } from './PhotoViewer';
import useBackClose from '../utils/useBackClose';

// 카드에서 바로 여는 사진 창. 바코드가 없어서 열어 보여줄 것이 사진뿐인 기프티콘이 여기로 온다.
// 바코드 창 안에서 보는 사진(BarcodeModal의 photo 화면)과 같은 틀을 쓰되, 이쪽에는
// 돌아갈 곳이 없어서 뒤로가기 버튼이 없다 — 목록에서 바로 열린 창이다.
export default function ImageViewerModal({ gifticon, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const [index, setIndex] = useState(0);

  if (!gifticon) return null;

  // image_urls는 image_paths와 자리를 맞추느라 못 받은 자리가 null로 남아 있다.
  // 넘겨보는 화면에서는 빈 자리를 한 장으로 세면 안 되니 걸러낸다.
  const loaded = (gifticon.image_urls || []).filter(Boolean);
  const images = loaded.length ? loaded : gifticon.image_url ? [gifticon.image_url] : [];
  const current = Math.min(index, images.length - 1);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        {/* 제목은 '원본 사진'으로 고정하고 상품명은 부제로 내린다. 이 창에서 먼저 알아야
            하는 것은 무엇을 보고 있는지이고, 어느 기프티콘인지는 방금 목록에서 눌러서 왔다.
            몇 장 중 몇 번째인지는 사진 위 오버레이에서 여기로 올렸다 — 사진을 안 가리고,
            넘길 때 눈이 움직이지 않는다. */}
        <SheetHeader className="gap-0 px-[18px] pr-14 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle className="truncate text-base font-bold tracking-[-0.02em]">원본 사진</SheetTitle>
              <p className="m-0 truncate text-[12.5px] font-medium text-muted-foreground">{gifticon.name}</p>
            </div>
            {images.length > 1 && (
              <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-muted-foreground">
                {current + 1} / {images.length}
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-[11px] px-[18px]">
          {images.length === 0 ? (
            <p className="m-0 text-[13px] text-muted-foreground">등록된 이미지가 없어요.</p>
          ) : (
            <>
              <PhotoFrame src={images[current]} alt={`${gifticon.name} 사진 ${current + 1}`} />
              {images.length > 1 && <PhotoNav photos={images} index={current} onPick={setIndex} />}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
