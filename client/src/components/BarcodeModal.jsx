import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { CheckCircle2, ChevronLeft, ChevronRight, Image as ImageIcon, ScanLine, StickyNote } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import CopyButton from './CopyButton';
import { cn } from '@/lib/utils';
import { useFamily } from '../FamilyContext';

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

export default function BarcodeModal({ gifticon, onClose, onUsed }) {
  const { members } = useFamily();
  const [canvas, setCanvas] = useState(null);
  const [renderError, setRenderError] = useState(false);
  // 'code' | 'photo' — 이 창이 지금 무엇을 보여주고 있는지
  const [view, setView] = useState('code');
  const [photoIndex, setPhotoIndex] = useState(0);

  // 메모를 남긴 사람. 등록자를 모르는 예전 기프티콘은 받은 사람으로 대신 표시한다.
  const memoWriter =
    members.find((m) => m.user_id === gifticon?.created_by)?.display_name || gifticon?.owner || null;

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

  // 원본 사진은 이 창 안에서 갈아끼운다. 창을 하나 더 띄우면 목록 → 바코드 → 사진으로
  // 세 겹이 쌓여서, 닫기를 몇 번 눌러야 하는지 헷갈린다.
  // 바코드가 주인공이고 사진은 곁가지라, 처음에는 늘 바코드로 열린다.
  const photos = (gifticon.image_urls || []).filter(Boolean);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-2">
          <SheetTitle className="flex items-center gap-1.5">
            {view === 'photo' && (
              <button
                type="button"
                onClick={() => setView('code')}
                aria-label="바코드로 돌아가기"
                className="-ml-1.5 shrink-0 rounded-full p-1.5 text-muted-foreground"
              >
                <ChevronLeft className="size-4.5" />
              </button>
            )}
            <span className="min-w-0 truncate">{view === 'photo' ? '원본 사진' : gifticon.brand || gifticon.name}</span>
            {view === 'photo' && photos.length > 1 && (
              <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                {photoIndex + 1} / {photos.length}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {view === 'code' && (
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
              바코드 바로 위에서 읽을 수 있게 한다. 그냥 글만 있으면 이게 안내문인지
              앱이 하는 말인지 헷갈려서, 누가 남긴 메모인지 이름표를 함께 보여준다.
              메모가 없으면 아무것도 보이지 않는다.

              색은 경고색(앰버)을 쓰다가 앱 색과 따로 놀아서 앱의 연보라로 바꿨다. 메모는
              조심하라는 경고가 아니라 가족이 남긴 말이라, 톤도 그쪽이 맞다. 대신 왼쪽에
              색 띠를 세워 "누가 적어둔 글"로 읽히게 한다. 바탕색만으로는 바코드 위에서
              그냥 지나치기 쉽다. */}
          {gifticon.memo?.trim() && (
            <div className="w-full rounded-xl border-l-[3px] border-primary/50 bg-accent px-3.5 py-2.5">
              <p className="m-0 mb-1 flex items-center gap-1.5 text-xs font-semibold text-accent-foreground">
                <StickyNote className="size-3.5" />
                {memoWriter ? `${memoWriter}님의 메모` : '메모'}
              </p>
              <p className="m-0 text-sm leading-relaxed break-keep whitespace-pre-wrap text-foreground">{gifticon.memo}</p>
            </div>
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
            // 리더기가 못 읽거나 온라인에서 쓸 때는 번호를 직접 넣어야 한다. 열세 자리를
            // 눈으로 옮겨 적는 건 계산대 앞에서 하기에 성가신 일이라 복사로 끝낼 수 있게 한다.
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <p className="m-0 text-center font-mono text-sm tracking-wide break-all text-muted-foreground">
                  바코드정보: {gifticon.code}
                </p>
                <CopyButton value={gifticon.code} label="복사" />
              </div>
              {renderError && !gifticon.barcode_image_url && (
                <p className="m-0 text-center text-xs break-keep text-muted-foreground">
                  이미지로 표시할 수 없어요. 매장에서 이 번호를 직접 입력해주세요.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">등록된 바코드/QR 정보가 없어요. 수정에서 직접 입력할 수 있어요.</p>
          )}

          {/* 계산이 끝난 그 자리에서 바로 눌러 끝낼 수 있게 한다. 창을 닫고 목록에서 다시
              카드를 찾아 누르게 하면, 그 한 걸음 때문에 표시를 미루다 잊는다.
              눌러도 되돌릴 수 있다(카드에서 "사용취소"). 그래서 다시 묻지 않고 바로 처리한다. */}
          {onUsed && (
            <Button type="button" size="lg" onClick={onUsed} className="mt-1 w-full rounded-xl">
              <CheckCircle2 className="size-4.5" />
              사용완료
            </Button>
          )}

          {photos.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setPhotoIndex(0);
                setView('photo');
              }}
              className="mt-1 flex w-full items-center justify-center gap-1.5 border-t border-border pt-3 text-sm font-semibold text-foreground"
            >
              <ImageIcon className="size-4 text-muted-foreground" />
              원본 사진 보기
              {photos.length > 1 && <span className="text-xs font-normal text-muted-foreground">{photos.length}장</span>}
            </button>
          )}
        </div>
        )}

        {view === 'photo' && (
          <div className="flex flex-col items-center gap-3 px-5 pt-2">
            <img
              src={photos[photoIndex]}
              alt={`${gifticon.name} 사진 ${photoIndex + 1}`}
              className="max-h-[58dvh] w-full rounded-xl bg-secondary object-contain"
            />

            {/* 넘길 것이 없는데 점이나 화살표가 있으면 더 있는 줄 알고 밀어보게 된다.
                한 장뿐이면 아무것도 보여주지 않는다. */}
            {photos.length > 1 && (
              <div className="flex w-full items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                  disabled={photoIndex === 0}
                  aria-label="이전 사진"
                  className="rounded-full p-2 text-muted-foreground disabled:opacity-30"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="flex gap-1.5">
                  {photos.map((url, i) => (
                    <i
                      key={url}
                      className={cn('size-1.5 rounded-full', i === photoIndex ? 'bg-primary' : 'bg-border')}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((i) => Math.min(photos.length - 1, i + 1))}
                  disabled={photoIndex === photos.length - 1}
                  aria-label="다음 사진"
                  className="rounded-full p-2 text-muted-foreground disabled:opacity-30"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setView('code')}
              className="flex w-full items-center justify-center gap-1.5 border-t border-border pt-3 text-sm font-semibold text-foreground"
            >
              <ScanLine className="size-4 text-muted-foreground" />
              바코드로 돌아가기
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
