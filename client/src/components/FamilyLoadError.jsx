import { useState } from 'react';
import { CloudOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Logo from './Logo';

// 가족을 못 읽었을 때.
//
// 이 화면이 없던 시절에는 못 읽은 것을 '가족 없음'으로 쳐서 가족 만들기 창이 떴다.
// 쓰고 있던 사람에게 그 창이 뜨면 가족을 하나 더 만들어버릴 수 있고, 그러면 기프티콘이
// 두 집으로 갈린다. 되돌리기 어려운 일이다.
//
// 그래서 여기서 멈춘다. 앱을 켠 직후는 네트워크가 아직 안 붙어 있는 순간이라, 대개는
// 한 번 더 누르면 들어간다.
export default function FamilyLoadError({ onRetry }) {
  const [trying, setTrying] = useState(false);

  function retry() {
    setTrying(true);
    onRetry();
    // 다시 읽는 동안 이 화면은 로딩 화면으로 갈아끼워진다. 그래도 실패해서 여기로
    // 돌아오면 버튼이 다시 눌려야 하므로 잠깐 뒤 풀어준다.
    setTimeout(() => setTrying(false), 4000);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-9 pb-16">
      <Logo className="size-14" />

      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CloudOff className="size-6" />
        </span>
        {/* 무슨 일이 있었는지와 무엇을 하면 되는지, 두 마디. 왜 그런지는 위 주석에 있다. */}
        <p className="m-0 text-[17px] font-bold tracking-[-0.02em] text-foreground">
          연결이 고르지 않아요
        </p>
        <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
          잠시 뒤 다시 시도해주세요.
        </p>
      </div>

      <Button
        type="button"
        size="lg"
        onClick={retry}
        disabled={trying}
        className="h-[52px] w-full max-w-[300px] rounded-[13px] text-[15.5px] font-bold"
      >
        <RotateCcw className="size-[18px]" />
        다시 시도
      </Button>
    </div>
  );
}
