import { useState } from 'react';
import { ChevronLeft, ExternalLink, Ticket } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { addDays, daysUntil, ddayUrgency, formatDate, formatDday, todayStr } from '../utils/date';
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

export default function ExtendSheet({ gifticon, onExtend, onClose }) {
  // 뒤로가기는 단계와 상관없이 창을 닫는다. 다른 창들과 같은 규칙이어야 한다 —
  // 여기만 한 단계씩 물러나면, 뒤로가기를 몇 번 눌러야 나가는지 알 수 없어진다.
  useBackClose(onClose);
  const [step, setStep] = useState(1);
  // 날짜를 직접 적는 중인가. 평소에는 90일이 미리 계산돼 있다.
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  const expired = gifticon.expires_at < todayStr();
  const next = custom ? date : addDays(gifticon.expires_at, DEFAULT_DAYS);

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

  const thumbUrl = gifticon.thumb_image_url || gifticon.image_url;
  // 붉은색은 임박한 것 하나만 가진다. 이미 지난 것은 급한 일이 아니라 회색이다 —
  // 목록 카드와 같은 규칙이고, 여기서 지난 것까지 붉으면 두 색이 같은 뜻이 된다.
  const urgent = !expired && ddayUrgency(gifticon.expires_at) !== 'normal';
  // 지난 것은 '기한 만료 (22일 지남)'이 아니라 '22일 지남'만 적는다. 제목이 이미
  // '기한이 지났어요'라서 앞의 세 글자는 같은 말을 두 번 하는 것이다.
  const past = Math.abs(daysUntil(gifticon.expires_at) ?? 0);
  const ddayLabel = expired ? `${past}일 지남` : formatDday(gifticon.expires_at);

  // 무엇을 늘리는 건지. 세 화면에 같은 모양으로 놓는다.
  //
  // 테두리를 걷고 배경만 남겼다. 썸네일에도 테두리가 있어 이중이었다 — 테두리는
  // 누르는 것에, 배경은 묶는 것에 쓴다.
  const target = (
    <div className="flex items-center gap-3 rounded-[14px] bg-secondary/60 p-[13px]">
      <span className="relative flex size-[50px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Ticket className="size-[22px] text-primary/60" />
        )}
        {expired && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[10px] font-bold text-white">
            기한만료
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15.5px] font-bold tracking-[-0.015em] text-foreground">{gifticon.name}</span>
        {/* D-day를 날짜보다 앞에 둔다. '2026.08.23까지 · D-1' 순서로는 제일 급한 값이
            줄 끝에 있어서, 긴 날짜를 다 읽고 나서야 며칠 남았는지를 안다. */}
        <span className={cn('flex items-baseline gap-[5px]', urgent ? 'text-destructive' : 'text-muted-foreground')}>
          <span className="text-[13.5px] font-bold tabular-nums">{ddayLabel}</span>
          <span className="text-[13px] font-semibold tabular-nums">{formatDate(gifticon.expires_at)}까지</span>
        </span>
      </span>
    </div>
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="gap-0 px-[18px] pr-14 pb-0">
          {/* 두 화면짜리라는 것을 먼저 보여준다. 안 보이면 1/2에서 '연장했어요'를 누른
              사람이 "끝난 건가" 하고 창을 닫는다. 만료된 것은 한 화면이라 안 띄운다. */}
          {!expired && (
            <div className="flex items-center gap-[7px]">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  aria-label="이전 단계"
                  className="-ml-1 flex size-[34px] shrink-0 items-center justify-center rounded-full bg-secondary text-foreground/80"
                >
                  <ChevronLeft className="size-4.5" />
                </button>
              )}
              <span className={cn('h-1 w-[22px] rounded-full', step === 1 ? 'bg-primary' : 'bg-primary/35')} />
              <span className={cn('h-1 w-[22px] rounded-full', step === 2 ? 'bg-primary' : 'bg-input')} />
              <span className="ml-1 text-[12.5px] font-bold tabular-nums text-muted-foreground">{step} / 2</span>
            </div>
          )}

          {/* 제목이 그대로 이 화면의 할 일이다. 창 이름('기한 늘리기')을 따로 얹지
              않는다 — 두 번 읽을 것이 없다. */}
          <SheetTitle className="mt-3 text-[21px] leading-[1.38] font-bold tracking-[-0.026em] break-keep">
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
                {/* 시안은 '새 기한을'이었다. '늘어난'으로 둔다 — 이 화면에 온 사람은
                    방금 발행처에서 기한을 늘리고 돌아온 참이고, 그 일을 받아 적는
                    자리다. '새'는 무엇이 새것인지 한 번 더 생각하게 한다. */}
                늘어난 기한을
                <br />
                앱에도 반영할게요
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-3.5 px-[18px] pt-3">
          {expired ? (
            <>
              {/* 만료된 것에 연장을 권하면 헛걸음이 된다. 대신 돈을 돌려받는 길을
                  알려준다. 신유형 상품권 표준약관에서 정한 권리라, 모르고 버리는
                  사람이 많다. */}
              <p className="m-0 text-[15px] leading-[1.7] font-medium break-keep text-muted-foreground">
                기한이 지나도 <b className="font-bold text-foreground">5년 안</b>이면{' '}
                <b className="font-bold text-foreground">90% 환불</b>을 받을 수 있어요.
              </p>
              {target}
              {/* 구분선 사이의 목록 줄이었다. 실제로는 앱을 나가는 동작이라 테두리를 준다.
                  채운 보라로 올리지 않는 이유는 아래 1단계의 카카오 행과 같다. */}
              <a
                href={GIFT_BOX_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-[11px] rounded-[13px] border border-input bg-card px-3.5 py-[11px] text-foreground no-underline"
              >
                <ExternalLink className="size-[18px] shrink-0 text-foreground/70" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15.5px] font-bold tracking-[-0.015em]">선물함 열기</span>
                  <span className="text-[13px] font-medium break-keep text-muted-foreground">
                    카카오톡 기프티콘이라면
                  </span>
                </span>
              </a>
              <Button
                type="button"
                size="lg"
                className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
                onClick={onClose}
              >
                닫기
              </Button>
            </>
          ) : step === 1 ? (
            <>
              {/* 발행사를 단정하지 않는다.
                  카카오·기프티쇼·SK… 어디서 받은 것인지 우리는 알 방법이 없다. 그런데
                  예전 문구는 "선물함에서 늘릴 수 있어요"라고 적어, 카카오톡이 아닌
                  사람에게는 그냥 틀린 말이 됐다. 어디서 받았든 같은 사실만 적는다. */}
              <p className="m-0 text-[15px] leading-[1.7] font-medium break-keep text-muted-foreground">
                받으신 문자나 발행처 앱에서 연장할 수 있어요. 보통 90일씩, 최대 5년까지요.
              </p>

              {target}

              {/* 카카오톡으로 나가는 문. 조건을 제목에 달아 해당 안 되는 사람이 먼저
                  걸러지게 한다. 주 버튼으로 두지 않는 이유는 발행처를 모르기 때문이다 —
                  카카오가 아닌 사람에게 '선물함 열기'가 제일 큰 버튼이면 막다른 길이다. */}
              <a
                href={GIFT_BOX_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-[11px] rounded-[14px] border border-border px-3.5 py-3 text-foreground no-underline"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14.5px] font-bold tracking-[-0.015em] break-keep">
                    카카오톡 선물하기 상품인가요?
                  </span>
                  <span className="text-[13px] font-medium break-keep text-muted-foreground">
                    선물함에서 바로 연장할 수 있어요
                  </span>
                </span>
                {/* 이 화면에서 유일하게 앱을 벗어나는 문인데 30px로 제일 작았다. */}
                <span className="flex h-10 shrink-0 items-center gap-[5px] rounded-[11px] border border-input px-3.5 text-sm font-semibold text-foreground/80">
                  열기
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </span>
              </a>

              <div className="flex flex-col gap-2 pt-0.5">
                {/* 연장을 안 하고 돌아왔을 수도 있다. 그래서 '선물함 열기'를 누른 것만으로는
                    기한을 늘리지 않고, 이 버튼을 한 번 더 받는다. */}
                <Button
                  type="button"
                  size="lg"
                  className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
                  onClick={() => setStep(2)}
                >
                  연장했어요
                </Button>
                {/* 글자만 있는 버튼은 앱에서 쓰지 않는다. 위 버튼과는 채움 여부로 갈린다. */}
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-[46px] w-full rounded-xl text-[14.5px] font-semibold text-foreground/80"
                  onClick={onClose}
                >
                  나중에 할게요
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="m-0 text-[15px] leading-[1.7] font-medium break-keep text-muted-foreground">
                앱 안의 날짜만 바뀌어요. 실제 기프티콘은 발행처 기준입니다.
              </p>

              {/* 어느 기프티콘인지가 이 화면에 없었다. 목록에 카드가 많으면 저장을 누르기
                  직전에 무엇을 바꾸는지 확인할 데가 없다. 기한은 아래 카드가 말하므로
                  여기서는 썸네일과 이름만 적는다. */}
              <div className="flex items-center gap-[11px] rounded-[13px] bg-secondary/60 px-3 py-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-accent">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Ticket className="size-[19px] text-primary/60" />
                  )}
                </span>
                <span className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.015em] text-foreground/80">
                  {gifticon.name}
                </span>
              </div>

              {/* 바뀌기 전과 후를 나란히 둔다. 새 날짜만 보여주면 얼마나 늘어나는지가
                  안 보여서, 발행처에서 본 날짜와 같은지 맞춰볼 수가 없다.
                  가운데는 화살표다 — 셰브론(›)은 "누르면 열린다"로 읽힌다. */}
              <div className="flex items-center gap-[13px] rounded-2xl bg-accent px-4 py-[17px]">
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[12.5px] font-semibold text-muted-foreground">지금</span>
                  <span className="text-[15px] font-semibold tabular-nums text-muted-foreground line-through">
                    {formatDate(gifticon.expires_at)}
                  </span>
                </div>
                <span aria-hidden="true" className="flex-1 text-center text-base text-primary/40">
                  →
                </span>
                <div className="flex flex-col items-end gap-[3px]">
                  <span className="text-[12.5px] font-bold text-primary">변경 후</span>
                  <span className="text-xl font-bold tracking-[-0.02em] tabular-nums text-foreground">
                    {next ? formatDate(next) : '날짜를 골라주세요'}
                  </span>
                </div>
              </div>

              {/* 기본은 90일 한 번으로 끝내는 길이다. 기간을 고르는 칩(+90 / +180)을
                  뒀다가 걷어냈다 — 발행처에서 얼마를 늘려줬는지는 이미 정해져서 돌아온
                  값이라, 여기서 고를 일이 아니다. 90일이 아니면 그때만 날짜를 적는다. */}
              {custom && (
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full" />
              )}

              <div className="flex flex-col gap-2 pt-0.5">
                <Button
                  type="button"
                  size="lg"
                  className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
                  onClick={apply}
                  disabled={saving || !next}
                >
                  {next ? `${formatDate(next)}까지로 바꾸기` : '날짜를 골라주세요'}
                </Button>
                {/* 위 버튼과 같은 모양이되 색을 뺀다. 나란히 놓였을 때 어느 쪽이
                    기본인지 한눈에 갈려야 한다. */}
                {!custom && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-[46px] w-full rounded-xl text-[14.5px] font-semibold text-foreground/80"
                    onClick={() => {
                      setDate(addDays(gifticon.expires_at, DEFAULT_DAYS));
                      setCustom(true);
                    }}
                  >
                    직접 날짜 선택
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
