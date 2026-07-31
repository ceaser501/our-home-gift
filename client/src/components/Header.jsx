import { LogOut } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import { useFamily } from '../FamilyContext';

export default function Header() {
  const { family, signOut } = useFamily();

  return (
    <header className="flex flex-col gap-1 px-5 pt-[max(16px,env(safe-area-inset-top))] pb-2">
      <div className="flex items-center gap-2.5">
        <Logo className="size-7 shrink-0" />
        <h1 className="m-0 flex-1 text-xl font-bold text-foreground">아워홈 기프티콘</h1>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => signOut()}
          aria-label="로그아웃"
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
      <p className="m-0 pl-9.5 text-xs text-muted-foreground">
        {family.name} · 초대코드 {family.invite_code}
      </p>
    </header>
  );
}
