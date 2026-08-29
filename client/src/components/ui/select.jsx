import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

// 열어둔 칸을 다시 눌러 닫는 일을 우리가 맡는다.
//
// 라딕스는 목록을 열 때 body의 pointer-events를 꺼버린다. 그래서 트리거는 그때부터
// 눌림을 못 받고, 라딕스도 '트리거를 다시 눌렀다'를 닫는 신호로 치지 않는다. 화면
// 가운데의 칸을 눌렀는데 아무 일도 안 일어나면, 쓰는 사람에게는 그냥 고장이다.
// (아래 사람 이름을 눌러야만 닫힌다는 이야기가 이것이었다.)
//
// 눌림은 못 받아도 어디를 눌렀는지는 알 수 있다. 목록이 열려 있는 동안만 document에서
// 눌림을 듣고, 그 자리가 트리거 위면 닫는다. 시트의 검은 막이 그 눌림을 먼저 가로채지
// 않도록 index.css에서 함께 손봤다 — 둘이 같이 있어야 동작한다.
const TriggerRefContext = React.createContext(null);

function useCloseOnTriggerPress(open, triggerRef, close) {
  // 삼킬 click 하나를 효과 바깥에 둔다. 닫으면 open이 false가 되면서 아래 효과가 정리되는데,
  // 정리에서 이걸 같이 거두면 정작 뒤따라오는 click이 그대로 통과해 도로 열린다.
  // 한 번 겪고 나서야 알았다 — 닫히자마자 다시 열리고 있었다.
  const swallowRef = React.useRef(null);

  const clearSwallow = React.useCallback(() => {
    if (!swallowRef.current) return;
    document.removeEventListener('click', swallowRef.current, true);
    swallowRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;

    const onDown = (event) => {
      const el = triggerRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (!inside) return;

      event.preventDefault();
      event.stopPropagation();

      // 손가락에서는 눌림 뒤에 click이 한 번 더 온다. 라딕스는 마우스가 아닐 때 그 click을
      // '열기'로 받는다 — 눌림만 막으면 닫았다가 같은 손짓에 도로 열린다.
      clearSwallow();
      const swallow = (next) => {
        next.preventDefault();
        next.stopPropagation();
        clearSwallow();
      };
      swallowRef.current = swallow;
      document.addEventListener('click', swallow, true);
      // click이 끝내 안 오는 경우(손가락을 끌어서 뗀 경우)에 대비해 곧 거둔다.
      setTimeout(clearSwallow, 400);

      close();
    };

    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, triggerRef, close, clearSwallow]);

  // 창이 통째로 사라질 때만 거둔다.
  React.useEffect(() => clearSwallow, [clearSwallow]);
}

function Select({ open, defaultOpen, onOpenChange, ...props }) {
  const controlled = open !== undefined;
  const [selfOpen, setSelfOpen] = React.useState(defaultOpen ?? false);
  const isOpen = controlled ? open : selfOpen;
  const triggerRef = React.useRef(null);

  const setOpen = React.useCallback(
    (next) => {
      if (!controlled) setSelfOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );

  const close = React.useCallback(() => setOpen(false), [setOpen]);
  useCloseOnTriggerPress(isOpen, triggerRef, close);

  return (
    <TriggerRefContext.Provider value={triggerRef}>
      <SelectPrimitive.Root data-slot="select" open={isOpen} onOpenChange={setOpen} {...props} />
    </TriggerRefContext.Provider>
  );
}

function SelectValue({ ...props }) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({ className, size = 'default', children, ...props }) {
  const triggerRef = React.useContext(TriggerRefContext);
  return (
    <SelectPrimitive.Trigger
      ref={triggerRef}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors",
        // 높이는 variant로 붙는다. 그래서 className에 h-[52px]를 줘도 이쪽이 이긴다 —
        // tailwind-merge는 variant가 다르면 같은 속성으로 안 보고 둘 다 남긴다.
        // 큰 칸이 필요하면 size="lg"를 쓴다. 등록 창의 52px 칸들이 그것이다.
        'data-[size=default]:h-10 data-[size=sm]:h-9 data-[size=lg]:h-[52px]',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({ className, children, position = 'popper', ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          'relative z-50 max-h-(--radix-select-content-available-height) min-w-32 overflow-x-hidden overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        position={position}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
          <ChevronUpIcon className="size-4" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport
          className={cn(
            'p-1',
            position === 'popper' && 'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width) scroll-my-1'
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
          <ChevronDownIcon className="size-4" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none",
        'focus:bg-accent focus:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem };
