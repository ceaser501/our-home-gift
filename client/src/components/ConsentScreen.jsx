import { useState } from 'react';
import { Check, ChevronRight, FileCheck2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { agreeToCurrent } from '../consent';
import { signOut } from '../auth';
import { cn } from '@/lib/utils';

// 세 가지 모두 필수다. 선택 항목(마케팅 수신 등)이 없어서 "전체 동의"와 개별 동의가
// 결국 같은 결과인데도 둘 다 두는 이유는, 하나씩 눌러 확인하고 싶은 사람과 한 번에
// 넘어가고 싶은 사람이 다 있기 때문이다.
// '~에 동의합니다'는 뺐다. 체크박스가 이미 그 뜻이라 두 번 말하는 셈이었다.
// '(필수)'도 셋 다 뺐다 — 위의 '세 가지 모두 동의가 필요해요' 한 줄이 대신한다.
// '만 14세 이상입니다'는 그대로 둔다. 이건 동의가 아니라 사실 확인이다.
const ITEMS = [
  { key: 'terms', label: '서비스 이용약관', href: 'terms.html' },
  { key: 'privacy', label: '개인정보 수집 및 이용', href: 'privacy.html' },
  { key: 'age', label: '만 14세 이상입니다', href: null },
];

// 미리 알려주는 것들. 한 문단에 붙여뒀더니 다섯 줄로 흘러서 아무도 안 읽었다.
// 사실이 셋이면 줄도 셋이어야 한다.
const NOTICES = [
  '등록한 기프티콘은 같은 가족의 다른 구성원에게 보여요',
  '사진을 자동으로 읽어드릴 때 이미지가 국외로 전송돼요',
  '만 14세 미만은 이용하실 수 없어요',
];

// 안 누른 자리에는 아무것도 그리지 않는다. 예전에는 회색 체크가 보여서, 이미 동의한
// 것처럼 읽혔다. 빈 원이 "아직 아니다"를 말한다.
function CheckCircle({ checked }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
      )}
    >
      {checked && <Check className="size-3.5" strokeWidth={3} />}
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
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-6 bg-background px-6 py-9">
      <div className="flex flex-col items-center gap-2.5">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent">
          <FileCheck2 className="size-6 text-primary" />
        </span>
        <h1 className="m-0 text-center text-[21px] font-bold tracking-[-0.028em] text-foreground">
          시작하기 전에
          <br />
          확인해주세요
        </h1>
        <p className="m-0 text-center text-[14.5px] font-medium text-muted-foreground">
          세 가지 모두 동의가 필요해요
        </p>
      </div>

      <div className="flex flex-col gap-1">
        {/* 이 앱에서 테두리는 '누르거나 적는 것'의 표시다. 전체 동의는 실제로 누르는
            자리가 왼쪽 원이라, 줄 전체에 테두리를 두르면 버튼처럼 보인다.
            배경 채움은 "이 줄이 아래 셋을 대표한다"는 묶음을 말한다. */}
        <button
          type="button"
          onClick={toggleAll}
          className={cn(
            'flex items-center gap-3.5 rounded-2xl px-4 py-4 text-left transition-colors',
            allAgreed ? 'bg-primary/8' : 'bg-secondary'
          )}
        >
          <CheckCircle checked={allAgreed} />
          <span className="flex-1 text-[16px] font-bold tracking-[-0.015em] text-foreground">전체 동의</span>
        </button>

        <div className="flex flex-col px-1">
          {ITEMS.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-1 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border/40"
            >
              <button
                type="button"
                onClick={() => toggle(item.key)}
                className="flex flex-1 items-center gap-3 py-3 text-left"
              >
                <CheckCircle checked={Boolean(agreed[item.key])} />
                <span className="flex-1 text-[15px] font-medium break-keep text-foreground">{item.label}</span>
              </button>
              {/* 내용을 확인하러 가는 길과 동의하는 행위를 분리한다. 문서를 열려다 실수로
                  동의가 눌리면 동의를 받은 의미가 없다. */}
              {item.href && (
                <a
                  href={`${import.meta.env.BASE_URL}${item.href}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${item.label} 전문 보기`}
                  className="flex size-10 shrink-0 items-center justify-center text-muted-foreground"
                >
                  <ChevronRight className="size-4" />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[13px] bg-secondary/60 px-4 py-3.5">
        <p className="m-0 text-[13px] font-bold text-foreground/70">미리 알려드려요</p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {NOTICES.map((line) => (
            <li
              key={line}
              className="flex gap-2 text-[13.5px] leading-relaxed font-medium break-keep text-muted-foreground"
            >
              <span className="text-border">·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="m-0 text-sm text-destructive">{error}</p>}

      <Button
        size="lg"
        className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
        disabled={!allAgreed || saving}
        onClick={handleSubmit}
      >
        {saving ? '저장하는 중…' : '동의하고 시작하기'}
      </Button>

      {/* 나가는 길의 테두리는 지킨다. 위 버튼이 체크 전까지 흐릿하게 죽어 있어서,
          아래까지 글자만 있으면 누를 수 있는 것이 하나도 없는 화면이 된다. */}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 w-full rounded-xl text-[14.5px] font-semibold text-foreground/70"
        onClick={() => signOut()}
      >
        동의하지 않고 나가기
      </Button>
    </div>
  );
}
