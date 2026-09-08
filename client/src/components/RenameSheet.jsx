import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ACTION_ROW, ACTION_PRIMARY, ACTION_CANCEL } from '../utils/sheetUi';
import useBackClose from '../utils/useBackClose';

const MAX_LENGTH = 20;

// 이름 한 줄만 고치는 작은 창. 내 이름과 가족 이름이 같은 모양을 쓴다.
// 다른 창(내 메뉴, 가족 목록) 위에 겹쳐서 열리는데, Radix 시트는 겹쳐 열어도
// 글자 입력 포커스를 맨 위 창이 가져가므로 그대로 겹쳐 쓴다.
export default function RenameSheet({ title, label, hint, helper, initialValue = '', placeholder, onSubmit, onClose }) {
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
        {/* 제목이 무엇을 적는 자리인지 말하므로 칸 위에 라벨을 또 두지 않는다.
            '이름 바꾸기' 아래에 '이름'이 다시 서 있었다 — 한 화면에서 같은 말이 두 번이다.

            hint 는 부제 자리로 옮겼다. 라벨 옆 한마디로 두던 것인데 라벨이 없어졌고,
            내용도 '누가 보는지'라 제목에 딸리는 말이다. */}
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {hint && <SheetDescription>{hint}</SheetDescription>}
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 px-5">
          <div className="flex flex-col gap-2">
            {/* 글자 수는 한계에 가까울 때만 나타난다. 이름은 보통 두세 글자라 늘 띄우면
                쓸모없는 숫자가 하나 더 있는 셈이고, 그 자리에 있으면 자꾸 세게 된다. */}
            {value.length > MAX_LENGTH - 5 && (
              <span className="self-end text-caption font-medium tabular-nums text-muted-foreground">
                {value.length} / {MAX_LENGTH}
              </span>
            )}
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
              // 보이는 라벨을 걷었으므로 이름은 여기로 넘긴다. 없으면 화면 낭독기가
              // '편집' 이라고만 읽고 무엇을 적는 칸인지 말해주지 못한다.
              aria-label={label}
              className="h-[52px] rounded-lg px-4 text-callout"
            />
            {/* 칸 아래 한 줄. 상자를 치지 않고 글자만 둔다 — footnote 는 12px 에 행간이
                넓어서, 두 줄로 흐르는 짧은 안내에 맞는 자리다.

                ⓘ 는 상자에 있던 것을 그대로 가져왔다. 상자를 걷으면 이 줄이 그냥 회색
                글자가 되어 앞줄과 구분이 안 되는데, 표 하나가 '이건 안내다'라고 말한다.

                두 줄로 흐를 때 표가 가운데로 내려오지 않게 items-start 로 붙이고, 첫 줄의
                가운데선에 맞춰 mt-0.5 만큼 내린다(줄 상자 19.2 에 표 16 이라 위아래 1.6). */}
            {/* 4px 만 들인다. 왼쪽 선은 창의 다른 것들과 20 으로 맞아 있는데도 헬퍼만
                왼쪽으로 튀어나와 보인다 — 칸의 둥근 모서리(14)가 눈을 안쪽으로 당기기
                때문이다. 칸 글자(36)까지 맞추면 이번에는 아래 버튼과 어긋나 계단이 진다.
                눈이 속는 만큼만 되돌리는 값이라 옵티컬 보정이지 들여쓰기가 아니다. */}
            {helper && (
              <div className="flex items-start gap-1.5 pl-1">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-border text-caption font-bold text-muted-foreground">
                  i
                </span>
                {/* footnote(12/1.6)다. 한때 body(14)로 올렸는데 되돌렸다 — 올린 까닭이
                    '저장 전에 읽어야 하는 말'이라는 옛 주석이었는데, 다시 보니 그 판단이
                    과했다. 경고도 아니고 끄고 켤 수 있는 것도 아닌, 그냥 참고다.

                    사다리는 제목 20 · 입력 16 · 부제 14 · 헬퍼 12 로 한 칸씩 내려간다.
                    헬퍼는 창이 아니라 칸 하나에 딸린 말이라 부제보다 한 단 아래다. */}
                <p className="m-0 flex-1 text-footnote text-muted-foreground">{helper}</p>
              </div>
            )}
          </div>


          {error && <p className="m-0 text-sm text-destructive">{error}</p>}

          {/* 세로로 쌓는다. 가로 반반은 저장이 절반 폭이라 주 동작으로 안 읽힌다.
              취소에도 테두리를 둔다 — 이 앱에는 글자만 있는 버튼이 없고, 둘은 채움 여부로
              갈린다(저장은 보라 채움, 취소는 테두리). */}
          <div className={cn(ACTION_ROW, 'pt-0.5')}>
            <Button size="xl" type="submit" disabled={!trimmed || saving} className={ACTION_PRIMARY}>
              {saving ? '바꾸는 중…' : '저장'}
            </Button>
            <Button size="xl" type="button" variant="outline" onClick={onClose} className={ACTION_CANCEL}>
              취소
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
