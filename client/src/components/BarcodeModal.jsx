import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { CheckCircle2, ChevronLeft, Image as ImageIcon, ScanLine, StickyNote, Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import CopyButton from './CopyButton';
import { PhotoDeck, PhotoCount, SwipeHint } from './PhotoViewer';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../utils/sheetUi';
import { cn } from '@/lib/utils';
import { formatShortDate } from '../utils/date';
import { groupDigits, readableCode } from '../utils/code';
import { useFamily } from '../FamilyContext';
import useBackClose from '../utils/useBackClose';

// QR을 화면에 세울 크기. 정사각형이라 폭을 다 쓰면 화면 절반을 먹는데, 리더기는 그만큼
// 클 필요가 없다. 그리는 크기(두 배)와 보여줄 크기를 이 값 하나로 묶어둔다.
const QR_PX = 220;

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

// 번호를 다루는 규칙은 utils/code.js에 있다. 예전부터 이 파일에서 가져다 쓰던 곳들이
// 있어서 이름은 그대로 내보낸다.
export { groupDigits, readableCode };

export default function BarcodeModal({ gifticon, onClose, onUsed, onSpend }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  // 금액권은 쓴 만큼 깎아 나가는 것이라, 이 창에서도 "다 썼다"가 아니라 "얼마 썼다"를 받는다.
  const isVoucher = Boolean(gifticon.is_voucher) && Number(gifticon.amount) > 0;
  const { members } = useFamily();
  const [canvas, setCanvas] = useState(null);
  const [renderError, setRenderError] = useState(false);
  // 'code' | 'photo' — 이 창이 지금 무엇을 보여주고 있는지
  const [view, setView] = useState('code');
  const [photoIndex, setPhotoIndex] = useState(0);

  // 메모를 마지막으로 쓴 사람. 메모는 가족 누구나 고칠 수 있어서 등록자와 다를 수 있다.
  // 이 칸이 생기기 전에 쓴 메모는 작성자를 알 수 없으니, 그때처럼 등록자(없으면 받은 사람)로
  // 대신 보여준다.
  const memoWriter =
    gifticon?.memo_by_name ||
    members.find((m) => m.user_id === gifticon?.created_by)?.display_name ||
    gifticon?.owner ||
    null;

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
      // 크기를 여기서 직접 박는다.
      //
      // CSS 클래스로 두 번 해봤고 두 번 다 안 먹었다. max-width만 걸면 폭만 줄고 높이는
      // 그린 크기 그대로 남았고(canvas는 img와 달리 브라우저가 비율을 안 맞춰준다),
      // h-auto를 붙여도 그대로였고, size-[220px]로 두 변을 다 적어도 그대로였다.
      // 왜 안 먹는지를 여기서 더 캐는 것보다, 안 밀리는 자리에 적는 편이 확실하다 —
      // 인라인 스타일은 클래스보다 세다.
      //
      // 그리는 크기는 화면 크기의 두 배다. 화면이 촘촘한 폰에서 220px짜리를 그대로
      // 늘리면 칸 경계가 흐려지는데, 두 배로 그려 반으로 접으면 고르게 남는다.
      // 둘레 여백은 4칸이다. QR 규격이 정한 값이고, 리더기가 "여기서부터 코드"라고
      // 알아보는 자리다. 2칸으로 두고 있었는데 대개는 읽히지만 매장 리더기 중에는
      // 규격대로만 받는 것이 있다. 막대 바코드 쪽은 진작 여백을 넉넉히 주고 있었다.
      QRCode.toCanvas(canvas, gifticon.code, { width: QR_PX * 2, margin: 4 }, (err) => {
        if (err) {
          setRenderError(true);
          return;
        }
        canvas.style.width = `${QR_PX}px`;
        canvas.style.height = `${QR_PX}px`;
      });
      return;
    }

    // 막대 바코드는 폭을 다 쓴다(w-full). QR을 보다가 이 기프티콘으로 넘어왔으면 위에서
    // 박아둔 인라인 크기가 남아 있으니 걷어낸다.
    canvas.style.width = '';
    canvas.style.height = '';

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
        // 그림 안 번호를 껐다가 되살렸다. 아래에 글자로 따로 적으면 크기와 끊는 자리를
        // 우리가 정할 수 있어서 껐는데, 매장에서 리더기가 못 읽었을 때 점원이 보는 것이
        // 그림에 찍힌 번호다 — 없는 편보다 있는 편이 안전하다. 아래 번호와 겹쳐도 상관없다.
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

  const humanCode = readableCode(gifticon.code);
  const isQr = gifticon.code_type === 'QR_CODE';

  // 원본 사진은 이 창 안에서 갈아끼운다. 창을 하나 더 띄우면 목록 → 바코드 → 사진으로
  // 세 겹이 쌓여서, 닫기를 몇 번 눌러야 하는지 헷갈린다.
  // 바코드가 주인공이고 사진은 곁가지라, 처음에는 늘 바코드로 열린다.
  const photos = (gifticon.image_urls || []).filter(Boolean);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        {/* 상호가 제목과 표에 두 번 있었다. 제목(상호) + 부제(상품명)로 합치면 두 줄이
            사라지고, 그만큼 바코드와 버튼에 여백이 돌아간다.
            사진을 보는 동안에는 제목이 '원본 사진'으로 바뀐다 — 상품명은 바코드 화면에서
            이미 봤고, 여기서 알아야 하는 것은 "지금 어디에 있나"다. */}
        <SheetHeader className="gap-0 px-[18px] pr-14 pb-3">
          <div className="flex items-center gap-2.5">
            {view === 'photo' && (
              <button
                type="button"
                onClick={() => setView('code')}
                aria-label="바코드로 돌아가기"
                className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
              >
                <ChevronLeft className="size-[18px]" />
              </button>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <SheetTitle
                className={cn(
                  'truncate',
                  view === 'photo' ? 'text-base font-bold tracking-[-0.02em]' : 'text-[19px] font-bold tracking-[-0.026em]'
                )}
              >
                {view === 'photo' ? '원본 사진' : gifticon.brand || gifticon.name}
              </SheetTitle>
              <p
                className={cn(
                  'm-0 truncate font-medium text-muted-foreground',
                  view === 'photo' ? 'text-[12.5px]' : 'text-[13.5px]'
                )}
              >
                {gifticon.name}
              </p>
            </div>
            {/* 몇 장 중 몇 번째인지. 사진 위 오버레이에 있던 것을 여기로 올렸다 —
                사진을 가리지 않고, 넘길 때 눈이 움직이지 않는다. */}
            {view === 'photo' && photos.length > 1 && (
              <PhotoCount index={photoIndex} total={photos.length} />
            )}
          </div>
        </SheetHeader>

        {view === 'code' && (
        <div className="flex flex-col gap-[11px] px-[18px]">
          {/* 등록할 때 적어둔 메모. "엄마, 아래 바코드를 매장에서 보여주세요" 같은 안내를
              바코드 바로 위에서 읽을 수 있게 한다. 그냥 글만 있으면 이게 안내문인지
              앱이 하는 말인지 헷갈려서, 누가 남긴 메모인지 이름표를 함께 보여준다.
              메모가 없으면 아무것도 보이지 않는다.

              색은 경고색(앰버)을 쓰다가 앱 색과 따로 놀아서 앱의 연보라로 바꿨다. 메모는
              조심하라는 경고가 아니라 가족이 남긴 말이라, 톤도 그쪽이 맞다.
              테두리나 띠는 두지 않는다. 이 창에서 진한 선은 바코드 하나만 가져야
              계산대에서 눈이 거기로 곧장 간다. */}
          {gifticon.memo?.trim() && (
            <div className="rounded-[13px] bg-accent px-3.5 py-3">
              <p className="m-0 mb-1 flex items-center gap-1.5">
                <StickyNote className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 truncate text-[12.5px] font-bold text-primary">
                  {memoWriter ? `${memoWriter}님의 메모` : '메모'}
                </span>
                {/* 언제 쓴 말인지 밝힌다. 메모는 고쳐 쓸 수 있어서, 날짜가 없으면 반년 전
                    당부인지 어제 남긴 말인지 구분이 안 된다.
                    올해 것이면 연도를 뗀다(formatShortDate) — 열 자리를 쓰면서 앞 다섯은
                    늘 같은 값이다. 색은 회색 그대로 둔다. 보라로 옅게 내리면 이름표와
                    한 덩어리로 뭉쳐 보이고 대비도 떨어진다. */}
                {gifticon.memo_at && (
                  <span className="ml-auto shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                    {formatShortDate(gifticon.memo_at)}
                  </span>
                )}
              </p>
              <p className="m-0 text-[14.5px] leading-snug break-keep whitespace-pre-wrap text-foreground">
                {gifticon.memo}
              </p>
            </div>
          )}

          {/* 그림과 번호를 테두리 하나로 묶는다. 계산대에서 리더기에 들이대는 것도,
              점원에게 불러주는 것도 이 한 덩어리다. 바코드 높이(150px)는 건드리지 않는다 —
              지금 인식이 잘 되고 있어서 손댈 이유가 없다. */}
          {(gifticon.code || gifticon.barcode_image_url) && (
            <div className="flex flex-col items-center gap-2.5 rounded-[15px] border border-border bg-white px-2.5 pt-3.5 pb-3">
              {gifticon.code && !renderError ? (
                // QR은 두 변을 다 못박는다.
                //
                // 처음에는 max-width만 걸고 높이는 비율대로 따라오게 뒀다. 안 따라왔다 —
                // canvas는 img와 달리 브라우저가 height:auto로 비율을 맞춰주지 않아서,
                // 폭만 220으로 줄고 높이는 그린 크기(440) 그대로 남았다. 세로로 두 배
                // 늘어난 QR이 아래 버튼들을 화면 밖으로 밀어냈다.
                //
                // h-auto를 붙여도 마찬가지였다. 그래서 비율에 기대지 않고 220×220으로
                // 직접 적는다. 그릴 때는 그 두 배(440)로 그려서 줄일 때 칸이 고르게 남는다.
                //
                // 막대 바코드는 그대로 둔다. 폭을 다 쓰는 편이 리더기에 좋고, 높이는
                // 그린 크기 그대로여도 막대가 길어질 뿐이라 지금까지 잘 읽혔다.
                // 픽셀 각을 살리는 것(pixelated)도 막대에만 건다 — QR은 줄여 그릴 때
                // 각을 살리면 칸이 고르지 않게 남아 오히려 지저분해진다.
                <canvas
                  ref={setCanvas}
                  className={cn('shrink-0', !isQr && 'w-full [image-rendering:pixelated]')}
                />
              ) : (
                gifticon.barcode_image_url && (
                  // 새로 그리지 못했을 때 쓰는, 원본 사진에서 잘라둔 그림.
                  // 여기엔 한도가 없었다. QR을 찍은 사진이면 정사각형이라 폭을 다 쓰면
                  // 세로로도 그만큼 커져서 아래 버튼을 밀어낸다. 높이를 묶고 비율은
                  // object-contain에 맡긴다.
                  <img
                    className="mx-auto max-h-[260px] w-full object-contain"
                    src={gifticon.barcode_image_url}
                    alt={`${gifticon.brand || gifticon.name} 바코드`}
                  />
                )
              )}

              {/* 리더기가 못 읽거나 온라인에서 쓸 때는 번호를 직접 넣어야 한다. 열세 자리를
                  눈으로 옮겨 적는 건 계산대 앞에서 하기에 성가신 일이라 복사로 끝낼 수 있게 한다.
                  '바코드정보:' 라벨은 뺐다 — 바코드 바로 아래에 있는 숫자가 무엇인지는 라벨
                  없이도 안다. */}
              {/* 그림 안에 이미 큰 번호가 찍혀 있다. 이 줄이 하는 일은 '불러주기 쉽게
                  끊어 보여주기'와 '복사'라, 20px까지 클 이유가 없다. 글자를 키워 쓰는
                  사람에게는 20px + 자간 + 복사 버튼이 한 줄을 넘겼다.
                  글자색을 못박은 이유: 이 상자는 리더기 때문에 늘 흰 바탕이라 다크 모드에서도
                  글자는 어두워야 한다. */}
              {gifticon.code && (
                <div className="flex items-center gap-2">
                  <p className="m-0 text-center font-mono text-[15px] font-semibold tracking-[0.02em] break-all tabular-nums text-[#17171c]">
                    {groupDigits(humanCode)}
                  </p>
                  <CopyButton
                    value={humanCode}
                    icon
                    label="바코드 번호 복사"
                    className="size-8 justify-center rounded-[10px] border border-input bg-card p-0"
                  />
                </div>
              )}
            </div>
          )}

          {gifticon.code
            ? renderError &&
              !gifticon.barcode_image_url && (
                <p className="m-0 text-center text-xs break-keep text-muted-foreground">
                  이미지로 표시할 수 없어요. 매장에서 이 번호를 직접 입력해주세요.
                </p>
              )
            : !gifticon.barcode_image_url && (
                <p className="m-0 text-center text-[13px] break-keep text-muted-foreground">
                  등록된 바코드/QR 정보가 없어요. 수정에서 직접 입력할 수 있어요.
                </p>
              )}

          {/* 계산이 끝난 그 자리에서 바로 눌러 끝낼 수 있게 한다. 창을 닫고 목록에서 다시
              카드를 찾아 누르게 하면, 그 한 걸음 때문에 표시를 미루다 잊는다.
              눌러도 되돌릴 수 있다(카드에서 "사용취소"). 그래서 다시 묻지 않고 바로 처리한다.

              금액권은 다르다. 계산대에서 오만원권으로 만이천원을 긁으면 남는 게 있어서,
              여기서 바로 완료로 넘기면 남은 삼만팔천원이 사라진다. 그래서 완료 대신 얼마를
              썼는지 묻는 창을 연다. 카드 아래 버튼과 같은 동작·같은 이름이다. */}
          <div className="flex flex-col gap-2">
            {isVoucher && onSpend ? (
              <Button type="button" size="lg" onClick={onSpend} className={PRIMARY_BUTTON}>
                <Wallet className="size-[19px]" />
                잔액입력
              </Button>
            ) : (
              onUsed && (
                <Button type="button" size="lg" onClick={onUsed} className={PRIMARY_BUTTON}>
                  <CheckCircle2 className="size-[19px]" />
                  사용완료
                </Button>
              )
            )}

            {/* 글자만 있던 줄을 테두리 버튼으로. 이 앱에서 테두리는 '누르는 것'을 가리킨다.
                위에 있던 구분선은 버튼이 생기면서 할 일이 없어졌다.
                이름도 '원본 사진 보기 2장'에서 '보기'를 뺐다 — 버튼이 되었으니 누르면
                열린다는 것을 모양이 이미 말한다. */}
            {photos.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => {
                  setPhotoIndex(0);
                  setView('photo');
                }}
                className={SECONDARY_BUTTON}
              >
                <ImageIcon className="size-[17px] text-muted-foreground" />
                원본 사진 {photos.length}장
              </Button>
            )}
          </div>
        </div>
        )}

        {view === 'photo' && (
          <div className="flex flex-col gap-[11px] px-[18px]">
            <PhotoDeck
              photos={photos}
              index={photoIndex}
              onPick={setPhotoIndex}
              alt={`${gifticon.name} 사진`}
            />

            {/* 넘길 것이 없는데 안내가 있으면 더 있는 줄 알고 밀어보게 된다.
                한 장뿐이면 아무것도 보여주지 않는다. */}
            {photos.length > 1 && <SwipeHint index={photoIndex} total={photos.length} />}

            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setView('code')}
              className={SECONDARY_BUTTON}
            >
              <ScanLine className="size-[17px] text-muted-foreground" />
              바코드로 돌아가기
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
