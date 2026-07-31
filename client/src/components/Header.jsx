import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

export default function Header() {
  return (
    <header className="flex items-center gap-2.5 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-2">
      <Logo className="size-7 shrink-0" />
      <h1 className="m-0 flex-1 text-xl font-bold text-foreground">아워홈 기프티콘</h1>
      <ThemeToggle />
    </header>
  );
}
