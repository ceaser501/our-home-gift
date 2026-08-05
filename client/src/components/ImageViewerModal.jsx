import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export default function ImageViewerModal({ gifticon, onClose }) {
  const [index, setIndex] = useState(0);

  if (!gifticon) return null;

  // image_urls는 image_paths와 자리를 맞추느라 못 받은 자리가 null로 남아 있다.
  // 넘겨보는 화면에서는 빈 자리를 한 장으로 세면 안 되니 걸러낸다.
  const loaded = (gifticon.image_urls || []).filter(Boolean);
  const images = loaded.length ? loaded : gifticon.image_url ? [gifticon.image_url] : [];
  const current = Math.min(index, images.length - 1);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-2">
          <SheetTitle>{gifticon.name}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-5 pt-2">
          {images.length === 0 ? (
            <p className="text-xs text-muted-foreground">등록된 이미지가 없어요.</p>
          ) : (
            <>
              <div className="relative flex max-h-[60vh] items-center justify-center overflow-hidden rounded-xl border border-border bg-black">
                <img
                  src={images[current]}
                  alt={`${gifticon.name} 이미지 ${current + 1}`}
                  className="max-h-[60vh] w-full object-contain"
                />
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}
                      aria-label="이전 이미지"
                      className="absolute left-1.5 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIndex((i) => (i + 1) % images.length)}
                      aria-label="다음 이미지"
                      className="absolute right-1.5 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                    <span className="absolute bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {current + 1} / {images.length}
                    </span>
                  </>
                )}
              </div>
              {images.length > 1 && (
                <div className="flex justify-center gap-1.5">
                  {images.map((url, i) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`${i + 1}번째 이미지 보기`}
                      className={cn('size-1.5 rounded-full', i === current ? 'bg-primary' : 'bg-border')}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
