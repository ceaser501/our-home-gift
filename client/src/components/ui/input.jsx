import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 그림자를 걷었다. 테두리가 이미 '여기가 칸'이라고 말하고 있어서, 그림자는 같은 말을
        // 한 번 더 하는 것이다. 시트 안에서 칸이 여럿 서면 그 그림자가 겹쳐 지저분해진다.
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm transition-colors',
        'placeholder:text-muted-foreground',
        // 폰에서는 손가락으로 짚어 칸에 들어온다. focus-visible 은 키보드로 들어왔을 때만
        // 걸리는 규칙이라, 그것만 두면 탭으로 열었을 때 지금 어느 칸에 적고 있는지가 안 보인다.
        'focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Input };
