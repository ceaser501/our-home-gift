import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

// 실제 테마는 index.html의 인라인 스크립트가 앱이 그려지기 전에 정해둔다.
// 여기서는 그 값을 그대로 읽어와서 버튼 아이콘만 맞춘다.
function getInitialTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export default function ThemeToggle({ asRow = false }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // 크롬의 자동 어둡게 기능이 다시 끼어들지 않도록 meta도 같이 맞춰준다.
    // "only"를 붙여야 브라우저가 임의로 색을 뒤집지 않는다.
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = theme === 'dark' ? 'only dark' : 'only light';
    // 설치해서 쓰면 폰 상태바가 이 색으로 칠해진다. 배경과 같게 두어야 이어져 보인다.
    // 값은 index.css의 --background와 맞춘다.
    const tint = document.querySelector('meta[name="theme-color"]');
    if (tint) tint.content = theme === 'dark' ? '#121216' : '#ffffff';
    localStorage.setItem('theme', theme);
  }, [theme]);

  const isDark = theme === 'dark';
  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  if (asRow) {
    return (
      <button type="button" onClick={toggle} className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm">
        {isDark ? <Sun className="size-4.5 text-muted-foreground" /> : <Moon className="size-4.5 text-muted-foreground" />}
        <span className="flex-1 text-foreground">다크 모드</span>
        <span className={isDark ? 'text-xs font-semibold text-primary' : 'text-xs text-muted-foreground'}>
          {isDark ? '켜짐' : '꺼짐'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
