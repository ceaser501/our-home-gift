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

  useEffect(() => {
    setRenderError(false);
    if (gifticon?.barcode_image_url) return;
    if (!gifticon?.code || !canvas) return;

    const format = gifticon.code_type;

    if (format === 'QR_CODE') {
      QRCode.toCanvas(canvas, gifticon.code, { width: 260, margin: 1 }, (err) => {
        if (err) setRenderError(true);
      });
      return;
    }

    const jsFormat = ZXING_TO_JSBARCODE[format];
    if (jsFormat) {
      try {
        JsBarcode(canvas, gifticon.code, { format: jsFormat, width: 2, height: 100, displayValue: true });
      } catch {
        setRenderError(true);
      }
    } else {
      setRenderError(true);
    }
  }, [gifticon, canvas]);

  if (!gifticon) return null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pb-2">
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

          {gifticon.barcode_image_url ? (
            <img
              className="w-full rounded-xl bg-white"
              src={gifticon.barcode_image_url}
              alt={`${gifticon.brand || gifticon.name} 바코드`}
            />
          ) : (
            gifticon.code && !renderError && <canvas ref={setCanvas} className="max-w-full" />
          )}

          {gifticon.code ? (
            <p className="text-center font-mono text-sm tracking-wide break-all text-muted-foreground">
              바코드정보: {gifticon.code}
              {renderError && ' (이미지로 표시할 수 없어 매장에서 이 번호를 직접 입력해주세요)'}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">등록된 바코드/QR 정보가 없어요. 수정에서 직접 입력할 수 있어요.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
