import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../utils/sheetUi';
import useBackClose from '../utils/useBackClose';

// 금액권을 얼마나 썼는지 받는 창.
//
// 금액권은 한 번에 다 쓰지 않는다. 3만원권으로 1만 2천원을 썼으면 아직 1만 8천원이 남는데,
// 사용/미사용 둘로만 나누면 그 돈이 갈 데가 없다. 다 썼다고 하면 남은 돈이 사라지고,
// 안 썼다고 하면 얼마가 남았는지 아무도 모른다. 그래서 쓴 금액을 받아 잔액을 남긴다.

function won(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

// 권종처럼 곁들여 적는 자리에서 쓰는 짧은 표기. '50,000원'은 여섯 자인데 '5만원'은 세 자다.
// 딱 떨어지지 않는 값(37,000)은 줄이면 오히려 어림수처럼 보여서 그대로 적는다.
function shortWon(amount) {
  const n = Number(amount || 0);
  if (n >= 10000 && n % 10000 === 0) return `${n / 10000}만원`;
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}천원`;
  return won(n);
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

// 계산대에서 두드릴 단위. 만원·오천원·천원이면 실제로 쓰는 금액은 대개 두 번에 닿는다.
const QUICK = [
  [10000, '+1만'],
  [5000, '+5천'],
  [1000, '+1천'],
];

export default function SpendSheet({ gifticon, onSpend, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const face = Number(gifticon.amount || 0);
  const left = Math.max(0, face - Number(gifticon.spent_amount || 0));
  const spent = Number(onlyDigits(value) || 0);
  const tooMuch = spent > left;
  const already = Number(gifticon.spent_amount || 0);

  // 빠른 입력은 지금 값에 더하되 잔액에서 멈춘다. 넘겨놓고 빨간 글씨로 나무라는 것보다,
  // 애초에 못 넘게 하는 편이 계산대에서 손이 덜 간다.
  function addQuick(step) {
    setValue(String(Math.min(left, spent + step)));
  }

  async function submit(amount) {
    if (!amount) return;
    setSaving(true);
    try {
      await onSpend(gifticon, amount);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 pb-[var(--safe-bottom)]">
        {/* 제목 아래 부제로 상품명. 예전에는 본문 첫 줄이 상품명이라, 무엇을 적는 창인지
            묻는 제목과 어느 기프티콘인지가 같은 무게로 나란히 있었다. */}
        <SheetHeader className="gap-0 px-[18px] pr-14 pb-3.5">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">얼마 쓰셨어요?</SheetTitle>
          <p className="m-0 truncate text-[13.5px] font-medium text-muted-foreground">{gifticon.name}</p>
        </SheetHeader>

        <div className="flex flex-col gap-3.5 px-[18px]">
          {/* 얼마 쓸지 정하려면 남은 돈을 먼저 알아야 하는데, 그 값이 12px 회색 한 줄에
              묻혀 있었다. 이 화면에서 제일 큰 숫자가 되어야 하는 값이다.
              한 줄이던 설명을 왼쪽(남은 금액)·오른쪽(권종·쓴 금액)으로 갈랐다. */}
          <div className="flex items-end justify-between gap-3 rounded-[14px] bg-secondary/60 px-[15px] py-[13px]">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12.5px] font-semibold tracking-[-0.01em] text-muted-foreground">
                지금 남은 금액
              </span>
              <span className="text-[25px] leading-none font-bold tracking-[-0.025em] tabular-nums text-foreground">
                {won(left)}
              </span>
            </div>
            <div className="text-right text-[12.5px] leading-snug font-medium tabular-nums text-muted-foreground">
              {shortWon(face)}권
              {already > 0 && (
                <>
                  <br />
                  {won(already)} 씀
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="spend-amount" className="text-sm font-semibold tracking-[-0.01em] text-foreground/80">
              이번에 쓴 금액
            </label>
            {/* 테두리를 보라로 둔다. 이 화면에서 채워야 하는 칸이 하나뿐이라는 말이다.
                플레이스홀더는 굵기를 낮춘다 — 굵으면 이미 적힌 값처럼 보여서, 그대로
                눌러도 되는 줄 안다. */}
            <div className="flex h-14 items-center gap-2.5 rounded-[14px] border-[1.5px] border-primary bg-card px-[15px]">
              <input
                id="spend-amount"
                type="text"
                inputMode="numeric"
                autoFocus
                value={spent ? spent.toLocaleString('ko-KR') : ''}
                onChange={(e) => setValue(onlyDigits(e.target.value))}
                placeholder={left.toLocaleString('ko-KR')}
                className="min-w-0 flex-1 bg-transparent text-xl font-bold tabular-nums text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
              />
              <span className="shrink-0 text-base font-semibold text-muted-foreground">원</span>
            </div>

            {/* 계산대에서 키패드를 여섯 번 누르는 대신 두 번으로 끝낸다. 아래 '전부 썼어요'와
                같은 성격의 단축이다. */}
            <div className="flex gap-[7px]">
              {QUICK.map(([step, label]) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => addQuick(step)}
                  className="h-10 flex-1 rounded-[11px] border border-input bg-card text-sm font-semibold tabular-nums text-foreground"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setValue('')}
                className="h-10 w-14 shrink-0 rounded-[11px] border border-input bg-card text-sm font-semibold text-muted-foreground"
              >
                지우기
              </button>
            </div>

            {tooMuch && (
              <p className="m-0 text-[13px] text-destructive">남은 금액({won(left)})보다 많이 쓸 수는 없어요.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              onClick={() => submit(spent)}
              disabled={saving || !spent || tooMuch}
              className={PRIMARY_BUTTON}
            >
              <Wallet className="size-[19px]" />
              {spent > 0 && spent < left ? `${won(spent)} 쓰고 ${won(left - spent)} 남기기` : '이만큼 썼어요'}
            </Button>

            {/* 잔돈을 굳이 남기고 싶지 않은 사람도 있다. 계산기를 두드리게 하지 않는다.
                위 버튼과 같은 모양이되 색을 뺀다 — 나란히 놓였을 때 어느 쪽이 기본인지
                한눈에 갈려야 하고, 앱 안에서 이 짝은 늘 같은 모양이어야 한다
                (기한 늘리기 창의 '다른 날짜예요'도 같다). */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => submit(left)}
              disabled={saving}
              className={SECONDARY_BUTTON}
            >
              남은 {won(left)} 전부 썼어요
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
