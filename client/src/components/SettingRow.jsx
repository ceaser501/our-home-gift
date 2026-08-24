import { ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

// 내 메뉴의 줄들. 세 가지뿐이라 한 군데 모아둔다 — 켜고 끄는 줄, 앱 안으로 가는 줄,
// 브라우저로 나가는 줄.
//
// 예전에는 줄마다 같은 flex 묶음을 손으로 다시 적었고, 그래서 자동 찾기 줄만 체크박스이던
// 시절도 있었다. 나란히 놓인 설정이 서로 다르게 켜지면 어느 게 켜진 건지 한눈에 안 읽힌다.

// 스위치 그림.
//
// 켜짐/꺼짐을 글자로 적던 자리다. 글자만 있으면 지금 상태를 알려주는 표시인지 눌러서
// 바꾸는 것인지 알 수 없다. 스위치는 그 둘을 한 모양으로 말한다.
//
// 이건 그림일 뿐이라 aria-hidden이다. 상태는 이 그림을 품은 버튼이 role="switch"로 알린다 —
// 줄 전체가 버튼이라 스위치를 정확히 조준하지 않아도 눌리고, 버튼 안에 버튼은 넣을 수 없다.
export function SwitchTrack({ on }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-[30px] w-12 shrink-0 items-center rounded-full px-[3px] transition-colors',
        on ? 'justify-end bg-primary' : 'justify-start bg-input'
      )}
    >
      <span className="size-6 rounded-full bg-card shadow-sm" />
    </span>
  );
}

// 켜고 끄는 줄. 아이콘 · 이름(설명) · 스위치.
export function SettingSwitchRow({ icon: Icon, label, hint, on, onToggle, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled}
      className="flex w-full items-center gap-[13px] px-0.5 py-3 text-left disabled:opacity-50"
    >
      <Icon className="size-5 shrink-0 text-foreground/70" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15.5px] tracking-[-0.015em] text-foreground">{label}</span>
        {hint && <span className="mt-0.5 text-[13px] font-medium break-keep text-muted-foreground">{hint}</span>}
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}

// 어디론가 가는 줄.
//
// 오른쪽 표시가 두 가지다. 앱 안에서 열리면 ›, 브라우저로 나가면 ↗. 누르기 전에
// "여기서 열리나 나가나"를 알려주는 값이라 모양이 달라야 한다.
export function SettingLinkRow({ icon: Icon, label, onClick, href }) {
  const external = Boolean(href);
  const Mark = external ? ExternalLink : ChevronRight;

  const inner = (
    <>
      <Icon className="size-5 shrink-0 text-foreground/70" />
      <span className="flex-1 text-left text-[15.5px] tracking-[-0.015em] text-foreground">{label}</span>
      <Mark
        className={cn('shrink-0 text-muted-foreground/60', external ? 'size-4' : 'size-[17px]')}
        strokeWidth={2.2}
      />
    </>
  );

  const className = 'flex w-full items-center gap-[13px] px-0.5 py-[13px] no-underline';

  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

// 구역 하나. 제목과 줄들.
//
// 구역 사이는 20px, 줄 사이는 2px이다. 눈이 쉬는 곳은 줄 사이가 아니라 구역과 구역
// 사이라, 거기만 벌리면 줄이 열 개여도 세 덩어리로 읽힌다.
export function SettingSection({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="m-0 pb-1 text-[13px] font-bold tracking-[-0.01em] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
