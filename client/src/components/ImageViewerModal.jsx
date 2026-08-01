import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export default function ImageViewerModal({ gifticon, onClose }) {
  if (!gifticon) return null;

  const images = gifticon.image_urls?.length ? gifticon.image_urls : gifticon.image_url ? [gifticon.image_url] : [];

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-2">
          <SheetTitle>{gifticon.name}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-5 pt-2">
          {images.length === 0 ? (
            <p className="text-xs text-muted-foreground">등록된 이미지가 없어요.</p>
          ) : (
            images.map((url, i) => (
              <img key={url} src={url} alt={`${gifticon.name} 이미지 ${i + 1}`} className="w-full rounded-xl border border-border" />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
