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
          <h2>{gifticon.name}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="barcode-modal__body">
          {gifticon.code ? (
            <canvas ref={canvasRef} className={`barcode-modal__canvas ${renderError ? 'hidden' : ''}`} />
          ) : null}

          {(!gifticon.code || renderError) &&
            gifticon.image_urls?.map((url) => <img key={url} className="barcode-modal__image" src={url} alt={gifticon.name} />)}

          {gifticon.code && <p className="barcode-modal__code">{gifticon.code}</p>}

          {!gifticon.code && !gifticon.image_urls?.length && <p>등록된 바코드/QR 정보가 없어요.</p>}

          {gifticon.image_urls?.length > 0 && gifticon.code && !renderError && (
            <details className="barcode-modal__original">
              <summary>원본 이미지 보기 ({gifticon.image_urls.length}장)</summary>
              {gifticon.image_urls.map((url) => (
                <img key={url} src={url} alt={gifticon.name} />
              ))}
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
