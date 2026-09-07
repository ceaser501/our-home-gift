import { useEffect, useState } from 'react';
import { ALargeSmall } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEXT_SCALE_OPTIONS, applyTextScale, getEffectiveTextScale, saveTextScale } from '../utils/textScale';

// 설정의 '글자 크기'.
//
// 스위치 줄이 아니라 눈금 줄인 이유는 셋 중 하나를 고르는 일이라서다. 그리고 고르는
// 버튼의 글자를 실제 비율대로 그려둔다 — '작게/보통/크게'라는 말보다 그 글자가 바로
// 답이다. 60대가 이 화면을 보고 무엇을 누를지 정하는 데 걸리는 시간이 다르다.
//
// 값을 고르면 화면 전체가 그 자리에서 바뀐다. 저장하고 나가서 확인하는 것이 아니라,
// 누르는 순간 이 창의 글자부터 같이 커진다.
const PREVIEW_PX = { 0.9: 13, 1: 15.5, 1.15: 18.5 };

export default function TextSizeRow() {
  const [scale, setScale] = useState(() => getEffectiveTextScale());

  // 폰 설정을 따라가는 중이면 처음 그릴 때는 아직 그 값을 모른다(플러그인에 물어보는
  // 일이라 시간이 걸린다). 물어본 결과가 오면 그때 불이 들어온다.
  useEffect(() => {
    let alive = true;
    applyTextScale()
      .then((value) => alive && setScale(value))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function choose(value) {
    setScale(value);
    try {
      setScale(await saveTextScale(value));
    } catch {
      // 적어두지 못해도 화면에는 이미 적용됐다.
    }
  }

  return (
    <div className="flex flex-col gap-2 px-0.5 py-3">
      <div className="flex items-center gap-[13px]">
        <ALargeSmall className="size-5 shrink-0 text-foreground/70" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15.5px] tracking-[-0.015em] text-foreground">글자 크기</span>
          <span className="mt-0.5 text-[13px] font-medium break-keep text-muted-foreground">
            고르지 않으면 폰 설정을 따라요
          </span>
        </span>
      </div>

      <div role="radiogroup" aria-label="글자 크기" className="flex gap-1.5">
        {TEXT_SCALE_OPTIONS.map((option) => {
          const on = Math.abs(scale - option.value) < 0.001;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(option.value)}
              className={cn(
                'flex h-12 flex-1 items-center justify-center gap-1.5 rounded-[11px] border transition-colors',
                on ? 'border-primary bg-accent text-accent-foreground' : 'border-input bg-card text-foreground/80'
              )}
            >
              {/* 왼쪽 '가'가 실제 비율이고, 오른쪽 이름은 그걸 부르는 말이다.
                  이름만 있으면 얼마나 달라지는지 눌러보기 전에는 알 수 없다. */}
              <span style={{ fontSize: `${PREVIEW_PX[option.value]}px` }} className="font-bold">
                가
              </span>
              <span className="text-[13px] font-semibold">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
