import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

// 눌렀는지 안 눌렀는지 알 수 없으면 사람은 몇 번이고 다시 누른다. 그래서 누른 뒤 잠깐
// 아이콘과 글자를 바꿔 "됐다"를 보여준다. 알림창을 띄우지 않는 이유는, 복사는 되돌릴 것도
// 확인할 것도 없는 동작이라 창을 닫는 손이 한 번 더 가는 게 더 성가시기 때문이다.
const FEEDBACK_MS = 1600;

async function writeToClipboard(text) {
  // 요즘 브라우저의 정식 방법. 다만 https가 아니거나 권한이 막히면 던진다.
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // 옛 방식. 화면 밖에 임시 입력칸을 두고 복사한 뒤 치운다.
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(field);
  if (!ok) throw new Error('복사할 수 없어요.');
}

export default function CopyButton({ value, label = '복사', copiedLabel = '복사했어요', className }) {
  const [state, setState] = useState('idle'); // idle | copied | failed

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function handleCopy() {
    try {
      await writeToClipboard(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  const copied = state === 'copied';

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className={cn(
        'flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors',
        copied ? 'text-primary' : 'text-muted-foreground',
        className
      )}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {state === 'failed' ? '복사 실패' : copied ? copiedLabel : label}
    </button>
  );
}
