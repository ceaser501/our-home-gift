import { useState } from 'react';
import { X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON } from '../utils/sheetUi';
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

// 칩은 늘리지 않고 글자 너비로 둔다. 넷이 폭을 꽉 채우고 나란히 서면 계산기 자판처럼
// 보인다. 테두리를 빼고 회색으로 채운 것도 같은 까닭이다 — 선 넷이 사라지면 조용해진다.
// 모서리 12 는 알약보다 덜 튀면서 입력 상자(8)와 결이 맞는 자리다.
const CHIP =
  'h-9 shrink-0 rounded-xl bg-secondary px-4 text-body font-semibold tabular-nums text-foreground';

export default function SpendSheet({ gifticon, onSpend, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const face = Number(gifticon.amount || 0);
  const left = Math.max(0, face - Number(gifticon.spent_amount || 0));
  const spent = Number(onlyDigits(value) || 0);
  const tooMuch = spent > left;
  const leftRatio = face > 0 ? Math.min(100, (left / face) * 100) : 0;

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
        {/* 상품명은 부제 자리에 둔다.
            한때 '상품명은 값이라 아래 상태 칸에 함께 있어야 한다'고 적어두었는데, 그
            상태 칸(회색 상자)을 걷어내면서 근거가 없어졌다. 이제는 이름 바꾸기 시트의
            부제와 같은 자리·같은 값이다 — '이 창이 무엇에 대한 것인지'.

            뺄 수는 없다. 바코드 창에서 넘어오는 길에서는 바코드 창이 먼저 닫히기 때문에
            (App.jsx 의 onSpend), 이 이름 말고는 화면에 남는 단서가 없다. */}
        <SheetHeader>
          <SheetTitle>얼마 쓰셨어요?</SheetTitle>
          <SheetDescription className="truncate">{gifticon.name}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5">
          {/* 잔액. 얼마 쓸지 정하는 근거다.
              숫자는 16 이다 — 입력(20)보다 한 단 아래. 답보다 근거가 크면 무엇을 적는
              창인지 흐려진다. 한때 25px 회색 상자 안에 있었는데, 눈을 끄는 몫은 아래
              막대가 받아갔으므로 숫자는 근거의 크기로 물러나도 된다. */}
          <div className="flex flex-col gap-[7px]">
            <div className="flex items-baseline justify-between gap-2.5">
              <p className="m-0 flex items-baseline gap-1">
                <span className="text-callout font-bold tabular-nums text-foreground">
                  {won(left)}
                </span>
                <span className="text-body font-semibold text-foreground">남음</span>
              </p>
              <span className="shrink-0 text-caption font-medium tabular-nums text-muted-foreground">
                {shortWon(face)}권
              </span>
            </div>

            {/* 배터리처럼 찬 만큼이 남은 돈이다. 숫자를 안 읽어도 대충 얼마인지 보인다.
                색을 트랙 전체에 깔고 쓴 만큼을 회색으로 덮는다 — 채워진 쪽에 걸면 값이
                바뀔 때마다 색이 늘었다 줄었다 해서 경계가 늘 같은 색이 된다. */}
            <div className="relative h-1.5 overflow-hidden rounded-full bg-gauge">
              <div
                className="absolute inset-y-0 right-0 bg-secondary"
                style={{ left: `${leftRatio}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* 테두리를 보라로 둔다. 이 화면에서 채워야 하는 칸이 하나뿐이라는 말이다.
                플레이스홀더는 굵기를 낮춘다 — 굵으면 이미 적힌 값처럼 보여서, 그대로
                눌러도 되는 줄 안다.

                라벨은 없앴다. 제목이 '얼마 쓰셨어요?'인데 라벨이 '이번에 쓴 금액'이면
                같은 말을 두 번 하는 것이다. 읽어주는 기계를 위해 aria-label 로 남긴다. */}
            <div className="flex h-14 items-center gap-2.5 rounded-lg border-[1.5px] border-primary bg-card px-4">
              <input
                id="spend-amount"
                type="text"
                inputMode="numeric"
                autoFocus
                aria-label="이번에 쓴 금액"
                value={spent ? spent.toLocaleString('ko-KR') : ''}
                onChange={(e) => setValue(onlyDigits(e.target.value))}
                placeholder={left.toLocaleString('ko-KR')}
                className="min-w-0 flex-1 bg-transparent text-title font-bold tabular-nums text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground"
              />
              {/* 지우기는 값이 있을 때만, 지우는 자리에 둔다. 빈 칸 아래 '지우기' 버튼이
                  늘 서 있던 것이 이상했다.
                  보이는 것은 24 지만 누를 자리는 40 이다(-m-2 p-2). 시트 닫기의 선 X 와
                  헷갈리지 않게 채운 동그라미로 그린다 — 같은 짓을 하는 것으로 보이면 안 된다. */}
              {spent > 0 && (
                <button
                  type="button"
                  onClick={() => setValue('')}
                  aria-label="지우기"
                  className="-m-2 flex shrink-0 items-center justify-center p-2"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-border text-muted-foreground">
                    <X className="size-3.5" strokeWidth={2.5} />
                  </span>
                </button>
              )}
              <span className="shrink-0 text-callout font-semibold text-muted-foreground">원</span>
            </div>

            {/* 계산대에서 키패드를 여섯 번 누르는 대신 두 번으로 끝낸다.
                '전액'은 값을 채우기만 하고 저장하지 않는다. 한때 '남은 30,000원 전부
                썼어요' 라는 버튼이 아래에 따로 있어서 누르는 순간 저장까지 됐는데,
                되돌릴 수 없는 동작은 아래 버튼 하나로 모으는 편이 안전하다. */}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setValue(String(left))} className={CHIP}>
                전액
              </button>
              {QUICK.map(([step, label]) => (
                <button key={step} type="button" onClick={() => addQuick(step)} className={CHIP}>
                  {label}
                </button>
              ))}
            </div>

            {tooMuch && (
              <p className="m-0 text-body text-destructive">
                남은 금액({won(left)})보다 많이 쓸 수는 없어요.
              </p>
            )}
          </div>

          {/* 본문끼리는 16, 버튼 앞은 24 다. 같은 값이면 버튼이 본문의 넷째 줄처럼 붙는다.
              지갑 아이콘은 뺐다 — 글자가 이미 무슨 버튼인지 다 말하고 있다. */}
          <Button
            type="button"
            size="lg"
            onClick={() => submit(spent)}
            disabled={saving || !spent || tooMuch}
            className={cn(PRIMARY_BUTTON, 'mt-2')}
          >
            {spent > 0 && spent < left
              ? `${won(spent)} 쓰고 ${won(left - spent)} 남기기`
              : '이만큼 썼어요'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
