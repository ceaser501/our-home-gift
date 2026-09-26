import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import useBackClose from '../utils/useBackClose';

// 고를 수 있는 시각. 오전 7시부터 밤 10시까지 정시만.
//
// 새벽은 뺐다. 기한 알림은 급한 일이 아니라 "오늘 쓸 것이 있다"는 말이라, 자는 시간에
// 울릴 이유가 없다. 30분 단위도 뺐다 — 고를 칸이 두 배가 되는데 얻는 것이 없다.
export const EXPIRY_HOURS = Array.from({ length: 16 }, (_, i) => i + 7);

// 고른 적이 없으면 오전 9시. 발송 함수(send-expiry-notifications)의 기본값과 같아야 한다.
export const DEFAULT_EXPIRY_HOUR = 9;

// 오전 9시 · 낮 12시 · 오후 3시. 24시 표기는 쓰지 않는다 — 60대도 쓰는 앱이다.
export function formatHour(hour) {
  if (hour < 12) return `오전 ${hour}시`;
  if (hour === 12) return '낮 12시';
  return `오후 ${hour - 12}시`;
}

// 알림 받을 시각을 고르는 창. 누르면 바로 저장하고 닫힌다 — 확인 버튼을 따로 두면
// 고르고 나서 한 번 더 눌러야 하는 줄 모르고 닫아버린다.
export default function ExpiryHourSheet({ value, onPick, onClose }) {
  useBackClose(onClose);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState('');

  async function pick(hour) {
    if (saving !== null) return;
    if (hour === value) {
      onClose();
      return;
    }
    setSaving(hour);
    setError('');
    try {
      await onPick(hour);
      onClose();
    } catch (err) {
      setError(err.message || '저장하지 못했어요. 다시 눌러주세요.');
      setSaving(null);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 pb-[var(--safe-bottom)]">
        <SheetHeader className="px-[18px] pr-14 pb-1">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">알림 시간</SheetTitle>
        </SheetHeader>
        <p className="m-0 px-[18px] pb-4 text-[14px] break-keep text-muted-foreground">
          기한이 7일 남은 날부터 매일 이 시간에 알려드려요.
        </p>

        <div className="grid grid-cols-4 gap-2 px-[18px] pb-2">
          {EXPIRY_HOURS.map((hour) => {
            const on = hour === value;
            return (
              <button
                key={hour}
                type="button"
                aria-pressed={on}
                onClick={() => pick(hour)}
                disabled={saving !== null}
                className={cn(
                  'h-12 rounded-[12px] border text-[15px] font-semibold tracking-[-0.02em] disabled:opacity-60',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground',
                  saving === hour && 'opacity-100'
                )}
              >
                {formatHour(hour)}
              </button>
            );
          })}
        </div>
        {error && <p className="m-0 px-[18px] pt-1 text-sm break-keep text-destructive">{error}</p>}
      </SheetContent>
    </Sheet>
  );
}
