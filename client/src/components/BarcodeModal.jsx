import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { CheckCircle2, ChevronLeft, Image as ImageIcon, ScanLine, StickyNote, Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import CopyButton from './CopyButton';
import { PhotoFrame, PhotoNav } from './PhotoViewer';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../utils/sheetUi';
import { cn } from '@/lib/utils';
import { formatShortDate } from '../utils/date';
import { useFamily } from '../FamilyContext';
import useBackClose from '../utils/useBackClose';

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

// 사람에게 불러줄 번호.
//
// QR에는 값만 들어 있지 않다. 편의점 쿠폰은 이런 모양이다 — IX;1;9816401685019;;
// 그림을 다시 그릴 때는 이 껍데기까지 그대로여야 리더기가 원본과 같게 읽는다. 그런데
// 점원이 "번호 불러주세요" 할 때 읽어야 하는 것은 그 안의 9816401685019다.
//
// 숫자 덩어리가 하나일 때만 벗긴다. 둘 이상이면 어느 쪽이 번호인지 알 수 없어서
// 원래 값을 그대로 보여준다 — 잘못된 번호를 자신 있게 보여주는 것이 제일 나쁘다.
export function readableCode(code) {
  const value = String(code || '');
  if (!value || /^[0-9]+$/.test(value)) return value;
  const runs = value.match(/[0-9]{6,}/g);
  return runs && runs.length === 1 ? runs[0] : value;
}

// 네 자리씩 띄운다. 열세 자리를 한 덩어리로 보면 불러주다가 자리를 잃는다.
// 숫자만 있을 때만 끊는다 — 글자가 섞인 값은 어디가 자리인지 알 수 없다.
//
// 마지막 한 자리가 홀로 남으면 앞 묶음에 붙인다. 열세 자리를 4씩 끊으면 '9816 4016 8501 9'가
// 되는데, 끝에 뜬 '9'는 불러줄 때 앞자리를 빼먹은 것처럼 들린다. '9816 4016 85019'로 둔다.
export function groupDigits(code) {
  const value = String(code || '');
  if (!/^[0-9]+$/.test(value)) return value;
  const groups = value.match(/\d{1,4}/g) || [];
  if (groups.length > 1 && groups.at(-1).length === 1) {
    groups[groups.length - 2] += groups.pop();
  }
  return groups.join(' ');
}

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
              <span className="shrink-0 text-[13.5px] font-semibold tabular-nums text-muted-foreground">
                {photoIndex + 1} / {photos.length}
              </span>
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
                // 막대 바코드는 폭을 다 쓴다 — 넓을수록 리더기가 잘 읽는다.
                // QR은 다르다. 정사각형이라 폭을 다 쓰면 화면 절반을 먹는데, 리더기는
                // 그만큼 클 필요가 없다. 220px에서 멈추고 가운데 세운다.
                <canvas
                  ref={setCanvas}
                  className={cn(
                    'w-full [image-rendering:pixelated]',
                    isQr && 'mx-auto max-w-[220px]'
                  )}
                />
              ) : (
                gifticon.barcode_image_url && (
                  <img
                    className="w-full"
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
            <PhotoFrame src={photos[photoIndex]} alt={`${gifticon.name} 사진 ${photoIndex + 1}`} />

            {/* 넘길 것이 없는데 화살표나 썸네일이 있으면 더 있는 줄 알고 밀어보게 된다.
                한 장뿐이면 아무것도 보여주지 않는다. */}
            {photos.length > 1 && (
              <PhotoNav photos={photos} index={photoIndex} onPick={setPhotoIndex} />
            )}

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
