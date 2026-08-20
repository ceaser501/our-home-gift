import { useState } from 'react';
import { Check, ChevronRight, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { agreeToCurrent } from '../consent';
import { signOut } from '../auth';
import { cn } from '@/lib/utils';

// 세 가지 모두 필수다. 선택 항목(마케팅 수신 등)이 없어서 "전체 동의"와 개별 동의가
// 결국 같은 결과인데도 둘 다 두는 이유는, 하나씩 눌러 확인하고 싶은 사람과 한 번에
// 넘어가고 싶은 사람이 다 있기 때문이다.
const ITEMS = [
  { key: 'terms', label: '서비스 이용약관에 동의합니다', href: 'terms.html' },
  { key: 'privacy', label: '개인정보 수집 및 이용에 동의합니다', href: 'privacy.html' },
  { key: 'age', label: '만 14세 이상입니다', href: null },
];

function CheckCircle({ checked }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors',
        checked ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
}

export default function ConsentScreen({ userId, onDone }) {
  const [agreed, setAgreed] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allAgreed = ITEMS.every((item) => agreed[item.key]);

  function toggle(key) {
    setAgreed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleAll() {
    setAgreed(allAgreed ? {} : Object.fromEntries(ITEMS.map((item) => [item.key, true])));
  }

  async function handleSubmit() {
    if (!allAgreed || saving) return;
    setSaving(true);
    setError('');
    try {
      await agreeToCurrent(userId);
      onDone();
    } catch (err) {
      setError(err.message || '동의를 저장하지 못했어요.');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-5 bg-background px-6 py-10">
      <div className="flex flex-col items-center gap-1.5">
        <FileCheck2 className="size-9 text-primary" />
        <h1 className="m-0 text-xl font-bold text-foreground">시작하기 전에 확인해주세요</h1>
        <p className="m-0 text-center text-base break-keep text-muted-foreground">
          아래 내용에 동의하셔야 모아콘을 이용하실 수 있어요.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={toggleAll}
          className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors',
            allAgreed ? 'border-primary bg-primary/8' : 'border-border bg-card'
          )}
        >
          <CheckCircle checked={allAgreed} />
          <span className="flex-1 text-[15px] font-bold text-foreground">전체 동의</span>
        </button>

        <div className="flex flex-col px-1">
          {ITEMS.map((item) => (
            <div key={item.key} className="flex items-center">
              <button
                type="button"
                onClick={() => toggle(item.key)}
                className="flex flex-1 items-center gap-3 py-3 text-left"
              >
                <CheckCircle checked={Boolean(agreed[item.key])} />
                <span className="flex-1 text-sm break-keep text-foreground">
                  {item.label} <span className="text-muted-foreground">(필수)</span>
                </span>
              </button>
              {/* 내용을 확인하러 가는 길과 동의하는 행위를 분리한다. 문서를 열려다 실수로
                  동의가 눌리면 동의를 받은 의미가 없다. */}
              {item.href && (
                <a
                  href={`${import.meta.env.BASE_URL}${item.href}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${item.label} 전문 보기`}
                  className="shrink-0 p-2 text-muted-foreground"
                >
                  <ChevronRight className="size-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="m-0 rounded-xl bg-secondary px-3.5 py-3 text-sm leading-relaxed break-keep text-muted-foreground">
        만 14세 미만은 법정대리인의 동의가 필요해 이용하실 수 없어요. 등록한 기프티콘은 같은 가족의
        다른 구성원에게 보이고, 사진을 자동으로 읽어드릴 때는 이미지가 국외로 전송돼요. 자세한 내용은
        위 문서에 있어요.
      </p>

      {error && <p className="m-0 text-sm text-destructive">{error}</p>}

      <Button size="lg" className="w-full rounded-xl" disabled={!allAgreed || saving} onClick={handleSubmit}>
        {saving ? '저장하는 중…' : '동의하고 시작하기'}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full rounded-xl text-muted-foreground"
        onClick={() => signOut()}
      >
        동의하지 않고 나가기
      </Button>
    </div>
  );
}
