import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const ZXING_TO_JSBARCODE = {
  CODE_128: 'CODE128',
  CODE_39: 'CODE39',
  EAN_13: 'EAN13',
  EAN_8: 'EAN8',
  UPC_A: 'UPC',
  UPC_E: 'UPC',
  ITF: 'ITF14',
  CODABAR: 'codabar',
};

export default function BarcodeModal({ gifticon, onClose }) {
  const [canvas, setCanvas] = useState(null);
  const [renderError, setRenderError] = useState(false);

  // 기프티콘이 바뀌면 다시 그려볼 수 있게 실패 표시를 되돌린다.
  // (아래 그리기 효과 안에서 되돌리면 canvas가 붙었다 떨어졌다 하며 무한 반복이 된다.)
  useEffect(() => {
    setRenderError(false);
  }, [gifticon]);

  // 매장 리더기가 읽어야 하므로, 값과 형식을 아는 경우에는 원본 사진을 잘라 쓰지 않고
  // 바코드를 새로 그린다. 잘라낸 사진은 위아래가 잘리거나 상품명 글자가 섞여 들어와서
  // 인식률이 떨어진다. 여백(margin)은 리더기가 바코드의 시작과 끝을 알아보는 데 꼭 필요하다.
  useEffect(() => {
    if (!gifticon?.code || !canvas) return;

    const format = gifticon.code_type;

    if (format === 'QR_CODE') {
      QRCode.toCanvas(canvas, gifticon.code, { width: 320, margin: 2 }, (err) => {
        if (err) setRenderError(true);
      });
      return;
    }

    const jsFormat = ZXING_TO_JSBARCODE[format];
    if (!jsFormat) {
      setRenderError(true);
      return;
    }

    try {
      JsBarcode(canvas, gifticon.code, {
        format: jsFormat,
        width: 4, // 막대 하나의 굵기. 크게 그려야 화면에서 줄여 보여도 경계가 뭉개지지 않는다.
        height: 150,
        margin: 20, // 좌우 여백(quiet zone)
        displayValue: true,
        fontSize: 22,
        textMargin: 8,
        background: '#ffffff',
      });
    } catch {
      setRenderError(true);
    }
  }, [gifticon, canvas]);

  if (!gifticon) return null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-2">
          <SheetTitle>{gifticon.brand || gifticon.name}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center gap-2.5 px-5 pt-2">
          <dl className="flex w-full flex-col gap-1.5">
            <div className="flex gap-2.5 text-sm">
              <dt className="w-11 shrink-0 text-muted-foreground">상호</dt>
              <dd className="m-0 font-semibold">{gifticon.brand || '-'}</dd>
            </div>
            <div className="flex gap-2.5 text-sm">
              <dt className="w-11 shrink-0 text-muted-foreground">메뉴</dt>
              <dd className="m-0 font-semibold">{gifticon.name}</dd>
            </div>
          </dl>

          {/* 등록할 때 적어둔 메모. "엄마, 아래 바코드를 매장에서 보여주세요" 같은 안내를
              바코드 바로 위에서 읽을 수 있게 한다. 메모가 없으면 아무것도 보이지 않는다. */}
          {gifticon.memo?.trim() && (
            <p className="m-0 w-full rounded-xl bg-accent px-3.5 py-2.5 text-sm leading-relaxed break-keep whitespace-pre-wrap text-accent-foreground">
              {gifticon.memo}
            </p>
          )}

          {gifticon.code && !renderError ? (
            // 새로 그린 바코드. 화면 폭에 맞춰 최대한 크게 보여줘야 리더기가 잘 읽는다.
            <canvas ref={setCanvas} className="w-full rounded-xl bg-white p-2 [image-rendering:pixelated]" />
          ) : (
            gifticon.barcode_image_url && (
              <img
                className="w-full rounded-xl bg-white"
                src={gifticon.barcode_image_url}
                alt={`${gifticon.brand || gifticon.name} 바코드`}
              />
            )
          )}

          {gifticon.code ? (
            <p className="text-center font-mono text-sm tracking-wide break-all text-muted-foreground">
              바코드정보: {gifticon.code}
              {renderError &&
                !gifticon.barcode_image_url &&
                ' (이미지로 표시할 수 없어 매장에서 이 번호를 직접 입력해주세요)'}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">등록된 바코드/QR 정보가 없어요. 수정에서 직접 입력할 수 있어요.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
