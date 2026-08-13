import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useBackClose from '../utils/useBackClose';

// 금액권을 얼마나 썼는지 받는 창.
//
// 금액권은 한 번에 다 쓰지 않는다. 3만원권으로 1만 2천원을 썼으면 아직 1만 8천원이 남는데,
// 사용/미사용 둘로만 나누면 그 돈이 갈 데가 없다. 다 썼다고 하면 남은 돈이 사라지고,
// 안 썼다고 하면 얼마가 남았는지 아무도 모른다. 그래서 쓴 금액을 받아 잔액을 남긴다.

function won(amount) {
  return `${Number(amount || 0).toLocaleString('ko-KR')}원`;
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export default function SpendSheet({ gifticon, onSpend, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const face = Number(gifticon.amount || 0);
  const left = Math.max(0, face - Number(gifticon.spent_amount || 0));
  const spent = Number(onlyDigits(value) || 0);
  const tooMuch = spent > left;

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
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>얼마 쓰셨어요?</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 pt-2">
          <div className="flex flex-col gap-1">
            <p className="m-0 text-sm font-semibold text-foreground">{gifticon.name}</p>
            <p className="m-0 text-xs text-muted-foreground">
              {gifticon.spent_amount > 0
                ? `${won(face)} 중 ${won(gifticon.spent_amount)} 사용 · 남은 금액 ${won(left)}`
                : `금액권 ${won(face)}`}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                autoFocus
                value={spent ? spent.toLocaleString('ko-KR') : ''}
                onChange={(e) => setValue(onlyDigits(e.target.value))}
                placeholder={`최대 ${left.toLocaleString('ko-KR')}`}
                className="flex-1"
              />
              <span className="shrink-0 text-sm text-muted-foreground">원</span>
            </div>
            {tooMuch && (
              <p className="m-0 text-xs text-destructive">남은 금액({won(left)})보다 많이 쓸 수는 없어요.</p>
            )}
          </div>

          <Button
            type="button"
            size="lg"
            onClick={() => submit(spent)}
            disabled={saving || !spent || tooMuch}
            className="w-full rounded-xl"
          >
            <Wallet className="size-4.5" />
            {spent > 0 && spent < left ? `${won(spent)} 쓰고 ${won(left - spent)} 남기기` : '이만큼 썼어요'}
          </Button>

          {/* 잔돈을 굳이 남기고 싶지 않은 사람도 있다. 계산기를 두드리게 하지 않는다. */}
          <button
            type="button"
            onClick={() => submit(left)}
            disabled={saving}
            className="text-xs font-semibold text-muted-foreground underline underline-offset-2 disabled:opacity-50"
          >
            남은 {won(left)} 전부 썼어요
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
