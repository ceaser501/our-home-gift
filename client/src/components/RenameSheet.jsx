import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from '../utils/sheetUi';
import useBackClose from '../utils/useBackClose';

const MAX_LENGTH = 20;

// 이름 한 줄만 고치는 작은 창. 내 이름과 가족 이름이 같은 모양을 쓴다.
// 다른 창(내 메뉴, 가족 목록) 위에 겹쳐서 열리는데, Radix 시트는 겹쳐 열어도
// 글자 입력 포커스를 맨 위 창이 가져가므로 그대로 겹쳐 쓴다.
export default function RenameSheet({ title, label, hint, description, initialValue = '', placeholder, onSubmit, onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const trimmed = value.trim();
  const unchanged = trimmed === initialValue.trim();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!trimmed || saving) return;
    if (unchanged) {
      onClose();
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (err) {
      setError(err.message || '이름을 바꾸지 못했어요.');
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 pb-[var(--safe-bottom)]">
        <SheetHeader className="px-[18px] pr-14 pb-3.5">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">{title}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 px-[18px]">
          <div className="flex flex-col gap-[7px]">
            <div className="flex items-baseline justify-between gap-2">
              {/* hint는 라벨 옆 한마디다. 바뀌는 곳이 한 군데뿐이라 아래 안내 상자까지
                  쓸 것은 없고, 누가 보는지만 적으면 되는 경우에 쓴다(가족 이름). */}
              <div className="flex min-w-0 items-baseline gap-1.5">
                <Label htmlFor="rename-input" className="text-sm font-semibold text-foreground/80">
                  {label}
                </Label>
                {hint && (
                  <span className="shrink-0 text-[12.5px] font-medium text-muted-foreground">{hint}</span>
                )}
              </div>
              {/* 글자 수는 한계에 가까울 때만 나타난다. 이름은 보통 두세 글자라 늘 띄우면
                  쓸모없는 숫자가 하나 더 있는 셈이고, 그 자리에 있으면 자꾸 세게 된다. */}
              {value.length > MAX_LENGTH - 5 && (
                <span className="shrink-0 text-[12.5px] font-medium tabular-nums text-muted-foreground">
                  {value.length} / {MAX_LENGTH}
                </span>
              )}
            </div>
            {/* 예전에 적었던 이름이 아래로 주르륵 뜨는 걸 막는다. 브라우저가 입력칸마다
                지난 값을 기억해뒀다 보여주는 기능인데, 이름은 몇 개 되지도 않고
                가족끼리 쓰는 화면이라 지난 값이 보이는 쪽이 성가시다.
                테두리를 보라로 둔다 — 이 창에서 적을 곳이 여기 하나뿐이다. */}
            <Input
              id="rename-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              maxLength={MAX_LENGTH}
              autoComplete="off"
              autoFocus
              required
              className="h-[52px] rounded-[13px] border-[1.5px] border-primary px-[15px] text-[16.5px] font-semibold"
            />
          </div>

          {/* 이름을 바꾸면 다른 화면의 값까지 바뀐다는 것은 저장하기 전에 읽어야 하는 말이다.
              입력칸 아래 작은 회색 줄로 두면 저장을 누른 뒤에야 알게 된다. */}
          {description && (
            <div className="flex gap-[9px] rounded-[13px] bg-secondary/60 px-3.5 py-3">
              <span className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-border text-[11px] font-bold text-muted-foreground">
                i
              </span>
              <p className="m-0 flex-1 text-[13.5px] leading-relaxed font-medium break-keep text-muted-foreground">
                {description}
              </p>
            </div>
          )}

          {error && <p className="m-0 text-sm text-destructive">{error}</p>}

          {/* 세로로 쌓는다. 가로 반반은 저장이 절반 폭이라 주 동작으로 안 읽힌다.
              취소에도 테두리를 둔다 — 이 앱에는 글자만 있는 버튼이 없고, 둘은 채움 여부로
              갈린다(저장은 보라 채움, 취소는 테두리). */}
          <div className="flex flex-col gap-2 pt-0.5">
            <Button type="submit" disabled={!trimmed || saving} className={PRIMARY_BUTTON}>
              {saving ? '바꾸는 중…' : '저장'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className={SECONDARY_BUTTON}>
              취소
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
