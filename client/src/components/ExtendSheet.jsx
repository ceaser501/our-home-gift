import { useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, Ticket } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { addDays, ddayUrgency, formatDate, formatDday, todayStr } from '../utils/date';
import useBackClose from '../utils/useBackClose';

// 유효기한이 임박했거나 지난 기프티콘의 칩을 누르면 열리는 창.
//
// 연장은 우리가 대신 해줄 수 없다. 기프티콘의 실제 주인은 발행사(카카오 선물하기 등)
// 계정이고, 우리가 가진 건 사진과 바코드 번호뿐이라 연장 권한이 없다. 공개 API도 없다.
// 그래서 이 창이 하는 일은 둘이다 — 연장이 된다는 걸 알려주고, 그 화면까지 데려다주는 것.
// "연장이 되는 줄 몰라서 버리는" 경우가 대부분이라 그것만으로도 값어치가 있다.
//
// ── 왜 두 화면으로 갈랐나 ────────────────────────────────────────────────
// 한 화면에 다 있었다. 안내 · 선물함 링크 · 날짜 바꾸기가 위아래로 붙어 있었는데,
// 그 셋은 시점이 다르다. 앞의 둘은 앱을 떠나기 전에 할 일이고, 마지막 하나는 발행처에서
// 연장을 마치고 돌아온 뒤에 할 일이다. 한 화면에 두면 돌아오기 전에 날짜부터 눌러서,
// 실제로는 안 늘어난 기한이 앱에만 늘어난다.
//
// 이제 1/2는 "가서 연장하세요", 2/2는 "그럼 앱에도 반영할게요"다. '연장했어요'를
// 눌러야 두 번째로 넘어가므로, 그 한 번이 확인 절차가 된다.

// 카카오 선물하기 표준. 대부분의 기프티콘이 여기 해당한다.
const DEFAULT_DAYS = 90;
// 선물함(주문내역)으로 바로 보내면 "잘못된 접근입니다"가 뜬다. 그 주소는 로그인 세션을
// 달고 안에서 눌러 들어가야 하는 자리라, 밖에서 곧장 열면 카카오가 막는다.
// 홈으로 보낸다 — 한 번 더 눌러야 하지만 오류 화면을 보는 것보다 낫다.
const GIFT_BOX_URL = 'https://gift.kakao.com/';

// 고를 수 있는 기간. 90일이 발행사 표준이고, 두 번 연장한 사람을 위해 180일을 둔다.
const PRESETS = [90, 180];

export default function ExtendSheet({ gifticon, onExtend, onClose }) {
  // 뒤로가기는 단계와 상관없이 창을 닫는다. 다른 창들과 같은 규칙이어야 한다 —
  // 여기만 한 단계씩 물러나면, 뒤로가기를 몇 번 눌러야 나가는지 알 수 없어진다.
  useBackClose(onClose);
  const [step, setStep] = useState(1);
  // 고른 기간. null이면 직접 고른 날짜를 쓴다.
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  const expired = gifticon.expires_at < todayStr();
  const next = days === null ? date : addDays(gifticon.expires_at, days);

  async function apply() {
    if (!next) return;
    setSaving(true);
    try {
      await onExtend(gifticon, next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // 무엇을 늘리는 건지. 두 화면에 같은 모양으로 놓는다.
  const target = (
    <div className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-3">
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-accent">
        {gifticon.thumb_image_url || gifticon.image_url ? (
          <img
            src={gifticon.thumb_image_url || gifticon.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <Ticket className="size-5 text-primary/60" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold text-foreground">{gifticon.name}</span>
        <span className="text-[13px] text-muted-foreground">
          {formatDate(gifticon.expires_at)}까지 ·{' '}
          <b
            className={cn(
              'font-semibold',
              ddayUrgency(gifticon.expires_at) === 'normal' ? 'text-muted-foreground' : 'text-destructive'
            )}
          >
            {formatDday(gifticon.expires_at)}
          </b>
        </span>
      </span>
    </div>
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="gap-0 pr-14 pb-0">
          {/* 두 화면짜리라는 것을 먼저 보여준다. 안 보이면 1/2에서 '연장했어요'를 누른
              사람이 "끝난 건가" 하고 창을 닫는다. 만료된 것은 한 화면이라 안 띄운다. */}
          {!expired && (
            <div className="flex items-center gap-2">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  aria-label="이전"
                  className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                >
                  <ChevronLeft className="size-4.5" />
                </button>
              )}
              <span className={cn('h-1 w-5 rounded-full', step === 1 ? 'bg-primary' : 'bg-primary/35')} />
              <span className={cn('h-1 w-5 rounded-full', step === 2 ? 'bg-primary' : 'bg-border')} />
              <span className="ml-1 text-xs font-semibold tabular-nums text-muted-foreground">{step} / 2</span>
            </div>
          )}

          {/* 제목이 그대로 이 화면의 할 일이다. 창 이름('기한 늘리기')을 따로 얹지
              않는다 — 두 번 읽을 것이 없다. */}
          <SheetTitle className="mt-3 text-xl leading-snug break-keep">
            {expired ? (
              '기한이 지났어요'
            ) : step === 1 ? (
              <>
                기한 연장은
                <br />
                기프티콘 발행처에서
              </>
            ) : (
              <>
                늘어난 기한을
                <br />
                앱에도 반영할게요
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 pt-2">
          {expired ? (
            <>
              {/* 만료된 것에 연장을 권하면 헛걸음이 된다. 대신 돈을 돌려받는 길을
                  알려준다. 신유형 상품권 표준약관에서 정한 권리라, 모르고 버리는
                  사람이 많다. */}
              <p className="m-0 text-[15px] leading-relaxed break-keep text-muted-foreground">
                기한이 지나도 <b className="font-semibold text-foreground">5년 안</b>이면{' '}
                <b className="font-semibold text-foreground">90% 환불</b>을 받을 수 있어요.
              </p>
              {target}
              <a
                href={GIFT_BOX_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 border-y border-border py-3 text-foreground no-underline"
              >
                <ExternalLink className="size-4.5 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-semibold">선물함 열기</span>
                  <span className="text-[13px] break-keep text-muted-foreground">카카오톡 기프티콘이라면</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </a>
              <Button type="button" size="lg" className="w-full rounded-xl" onClick={onClose}>
                닫기
              </Button>
            </>
          ) : step === 1 ? (
            <>
              {/* 발행사를 단정하지 않는다.
                  카카오·기프티쇼·SK… 어디서 받은 것인지 우리는 알 방법이 없다. 그런데
                  예전 문구는 "선물함에서 늘릴 수 있어요"라고 적어, 카카오톡이 아닌
                  사람에게는 그냥 틀린 말이 됐다. 어디서 받았든 같은 사실만 적는다. */}
              <p className="m-0 text-[15px] leading-relaxed break-keep text-muted-foreground">
                받은 문자나 발행처 앱에서 연장할 수 있어요.
                <br />
                보통 90일씩, 최대 5년까지요.
              </p>

              {target}

              {/* 카카오톡으로 나가는 문. 조건을 제목에 달아 해당 안 되는 사람이 먼저
                  걸러지게 한다. 주 버튼으로 두지 않는 이유는 발행처를 모르기 때문이다 —
                  카카오가 아닌 사람에게 '선물함 열기'가 제일 큰 버튼이면 막다른 길이다. */}
              <a
                href={GIFT_BOX_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-2xl border border-border px-3.5 py-3 text-foreground no-underline"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold break-keep">카카오톡 선물하기 상품인가요?</span>
                  <span className="text-[13px] break-keep text-muted-foreground">선물함에서 바로 연장할 수 있어요</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-semibold">
                  열기
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </span>
              </a>

              <div className="flex flex-col gap-2 pt-1">
                {/* 연장을 안 하고 돌아왔을 수도 있다. 그래서 '선물함 열기'를 누른 것만으로는
                    기한을 늘리지 않고, 이 버튼을 한 번 더 받는다. */}
                <Button type="button" size="lg" className="w-full rounded-xl" onClick={() => setStep(2)}>
                  연장했어요
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="w-full rounded-xl text-muted-foreground"
                  onClick={onClose}
                >
                  나중에 할게요
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 text-[15px] leading-relaxed break-keep text-muted-foreground">
                앱에 보이는 날짜만 바뀌어요.
                <br />
                실제 기한은 발행처 기준이에요.
              </p>

              {/* 바뀌기 전과 후를 나란히 둔다. 새 날짜만 보여주면 얼마나 늘어나는지가
                  안 보여서, 발행처에서 본 날짜와 같은지 맞춰볼 수가 없다. */}
              <div className="flex items-center gap-3 rounded-2xl bg-primary/5 px-4 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[11.5px] font-semibold text-muted-foreground">지금</span>
                  <span className="text-[15px] font-semibold text-muted-foreground line-through">
                    {formatDate(gifticon.expires_at)}
                  </span>
                </div>
                <ChevronRight className="size-4 flex-1 text-muted-foreground/50" />
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[11.5px] font-semibold text-primary">변경 후</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">
                    {next ? formatDate(next) : '날짜를 골라주세요'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDays(preset)}
                    className={cn(
                      'flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors',
                      days === preset
                        ? 'border-primary text-primary'
                        : 'border-border text-muted-foreground'
                    )}
                  >
                    +{preset}일
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setDays(null);
                    if (!date) setDate(addDays(gifticon.expires_at, DEFAULT_DAYS));
                  }}
                  className={cn(
                    'flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-colors',
                    days === null ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                  )}
                >
                  직접 선택
                </button>
              </div>

              {days === null && (
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full" />
              )}

              <Button
                type="button"
                size="lg"
                className="mt-1 w-full rounded-xl"
                onClick={apply}
                disabled={saving || !next}
              >
                {next ? `${formatDate(next)}까지로 바꾸기` : '날짜를 골라주세요'}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
