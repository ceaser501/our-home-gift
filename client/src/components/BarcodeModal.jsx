import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

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
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    setRenderError(false);
    if (gifticon?.barcode_image_url) return;
    if (!gifticon?.code || !canvasRef.current) return;

    const canvas = canvasRef.current;
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
  }, [gifticon]);

  if (!gifticon) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet barcode-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sheet__header">
          <h2>{gifticon.brand || gifticon.name}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="barcode-modal__body">
          <dl className="barcode-modal__info">
            <div>
              <dt>상호</dt>
              <dd>{gifticon.brand || '-'}</dd>
            </div>
            <div>
              <dt>메뉴</dt>
              <dd>{gifticon.name}</dd>
            </div>
          </dl>

          {gifticon.barcode_image_url ? (
            <img
              className="barcode-modal__crop"
              src={gifticon.barcode_image_url}
              alt={`${gifticon.brand || gifticon.name} 바코드`}
            />
          ) : (
            gifticon.code && !renderError && <canvas ref={canvasRef} className="barcode-modal__canvas" />
          )}

          {gifticon.code ? (
            <p className="barcode-modal__code">
              바코드정보: {gifticon.code}
              {renderError && ' (이미지로 표시할 수 없어 매장에서 이 번호를 직접 입력해주세요)'}
            </p>
          ) : (
            <p className="hint">등록된 바코드/QR 정보가 없어요. 수정에서 직접 입력할 수 있어요.</p>
          )}
        </div>
      </div>
    </div>
  );
}
