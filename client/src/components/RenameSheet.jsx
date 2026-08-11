import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useBackClose from '../utils/useBackClose';

const MAX_LENGTH = 20;

// 이름 한 줄만 고치는 작은 창. 내 이름과 가족 이름이 같은 모양을 쓴다.
// 다른 창(내 메뉴, 가족 목록) 위에 겹쳐서 열리는데, Radix 시트는 겹쳐 열어도
// 글자 입력 포커스를 맨 위 창이 가져가므로 그대로 겹쳐 쓴다.
export default function RenameSheet({ title, label, description, initialValue = '', placeholder, onSubmit, onClose }) {
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
      <SheetContent className="gap-0 pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-5 pt-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rename-input">{label}</Label>
            {/* 예전에 적었던 이름이 아래로 주르륵 뜨는 걸 막는다. 브라우저가 입력칸마다
                지난 값을 기억해뒀다 보여주는 기능인데, 이름은 몇 개 되지도 않고
                가족끼리 쓰는 화면이라 지난 값이 보이는 쪽이 성가시다. */}
            <Input
              id="rename-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              maxLength={MAX_LENGTH}
              autoComplete="off"
              autoFocus
              required
            />
            {description && <p className="m-0 text-xs text-muted-foreground">{description}</p>}
          </div>

          {error && <p className="m-0 text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 rounded-xl">
              취소
            </Button>
            <Button type="submit" disabled={!trimmed || saving} className="flex-1 rounded-xl">
              {saving ? '바꾸는 중…' : '저장'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
