import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { PhotoDeck, PhotoDots } from "./PhotoViewer";
import useBackClose from "../utils/useBackClose";

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
  const images = loaded.length
    ? loaded
    : gifticon.image_url
      ? [gifticon.image_url]
      : [];
  const current = Math.min(index, images.length - 1);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[calc(92dvh/var(--ui-scale))] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        {/* 제목은 '원본 사진'으로 고정하고 상품명은 부제로 내린다. 이 창에서 먼저 알아야
            하는 것은 무엇을 보고 있는지이고, 어느 기프티콘인지는 방금 목록에서 눌러서 왔다.

            몇 장 중 몇 번째인지는 여기 있다가 사진 아래로 내려갔다. 제목(33)과 부제(57.5)
            사이인 44.5 에 떠서 셋 중 아무 것과도 안 맞았고, 이름이 쓸 폭도 64px 잡아먹었다. */}
        <SheetHeader>
          <SheetTitle className="truncate">원본 사진</SheetTitle>
          <SheetDescription className="truncate">
            {gifticon.name}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-5">
          {images.length === 0 ? (
            <p className="m-0 text-body text-muted-foreground">
              등록된 이미지가 없어요.
            </p>
          ) : (
            <>
              <PhotoDeck
                photos={images}
                index={current}
                onPick={setIndex}
                alt={`${gifticon.name} 사진`}
              />
              {images.length > 1 && (
                <PhotoDots index={current} total={images.length} />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
