import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// 실제 테마는 index.html의 인라인 스크립트가 앱이 그려지기 전에 정해둔다.
// 여기서는 그 값을 그대로 읽어와서 버튼 아이콘만 맞춘다.
function getInitialTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // 크롬의 자동 어둡게 기능이 다시 끼어들지 않도록 meta도 같이 맞춰준다.
    // "only"를 붙여야 브라우저가 임의로 색을 뒤집지 않는다.
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = theme === 'dark' ? 'only dark' : 'only light';
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
