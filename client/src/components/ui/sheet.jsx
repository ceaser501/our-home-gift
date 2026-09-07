import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Sheet({ ...props }) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        className
      )}
      {...props}
    />
  );
}

function SheetContent({ className, children, side = 'bottom', showClose = true, ...props }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col gap-4 bg-card shadow-lg transition ease-in-out',
          'data-[state=closed]:duration-200 data-[state=open]:duration-300',
          side === 'bottom' &&
            cn(
              'inset-x-0 bottom-0 mx-auto w-full max-w-(--sheet-max-width) rounded-t-[20px] border-t',
              'max-h-[calc(92dvh/var(--ui-scale))]',
              'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom'
            ),
          side === 'right' &&
            cn(
              'inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm',
              'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-right'
            ),
          className
        )}
        style={{ '--sheet-max-width': '480px' }}
        // 열자마자 첫 버튼에 포커스가 잡히지 않게 한다.
        //
        // 기본 동작은 창이 열리면 안쪽 첫 번째 누를 수 있는 것으로 포커스를 옮기는
        // 것이다. 키보드로 쓰는 화면에서는 맞는 동작이지만 폰에서는 '이름 바꾸기'
        // 버튼이 눌린 것처럼 테두리가 씌워진 채로 떠서, 뭘 잘못 눌렀나 싶어진다.
        //
        // 글자를 적는 시트(이름 바꾸기·금액 입력·가족 만들기)는 입력칸에 autoFocus를
        // 직접 달아뒀다. 그건 이 설정과 상관없이 그대로 뜬다.
        onOpenAutoFocus={(event) => event.preventDefault()}
        {...props}
      >
        {children}
        {/* 보이는 동그라미는 34px 그대로 두고, 누를 자리만 44px로 넓힌다.
            창 오른쪽 위 모서리라 엄지가 조금만 밖으로 나가도 빗나가는 자리다 —
            아이폰에서 "잘 안 눌린다"는 말이 여기서 나왔다. 애플이 권하는 최소
            과녁이 44pt다. 음수 마진으로 넓혀서 보이는 위치는 그대로 둔다. */}
        {showClose && (
          // X 만 남기고 뒤의 회색 동그라미를 걷었다. 시트에서 유일하게 채워진 덩어리라
          // 제목보다 먼저 눈에 들어왔는데, 닫기는 먼저 볼 것이 아니다.
          //
          // 크기는 제목 줄 상자와 같은 24 다. 글자 크기(20)가 아니라 줄 상자에 맞춘다 —
          // 옆에 나란히 서는 것은 글자가 아니라 그 줄이라서, 20 으로 두면 여전히 작아 보인다.
          //
          // 자리는 제목의 가운데선에 맞춘다. 헤더 위 여백 20 에 줄 상자 24 의 절반을 더하면
          // 32 이고, 누를 자리 44 의 절반이 22 이므로 위에서 10 이다.
          //
          // 오른쪽 10 은 X 의 오른쪽 끝을 본문 여백 20 에 맞추기 위한 값이다(10 + (44-24)/2).
          // 보이는 것은 24 짜리 하나지만 누를 자리는 44 를 지킨다.
          <SheetPrimitive.Close className="absolute top-2.5 right-2.5 flex size-11 items-center justify-center text-muted-foreground focus:outline-hidden">
            <XIcon className="size-6" />
            <span className="sr-only">닫기</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }) {
  // pr-15 는 오른쪽 위 닫기 버튼을 피하는 자리다. 그 버튼을 껍데기가 그리므로 피하는
  // 여백도 껍데기가 갖는다. 열일곱 시트가 전부 이 값을 손으로 적어 왔는데, 하나라도
  // 빠뜨리면 제목이 X 아래로 들어간다.
  //
  // 14(56) 였다가 15(60) 로 늘렸다. 동그라미를 34 에서 40 으로 키우면서 44px 과녁이
  // 왼쪽으로 2px 더 나왔고, 그만큼 제목과 겹쳤다. 보이는 것은 안 바뀌었는데 누를 자리가
  // 자라서 생긴 겹침이라 화면만 봐서는 안 보인다.
  // 사방 20 이다. 아래만 12 로 좁던 것을 위와 맞췄다 — 제목 잉크를 기준으로 재면
  // 위가 22(패딩 20 + 행간 여백 2)인데 아래는 14 였다.
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1 p-5 pr-15', className)} {...props} />;
}

function SheetTitle({ className, ...props }) {
  // 기본값이 16 이었는데 열 시트가 19 로 덮어쓰고 있었다. 기본값이 틀린 것이라 실제로
  // 쓰는 값으로 맞춘다. 19 는 스케일에 없어서 title(20)로 올린다 — 뜻도 그 자리다.
  //
  // 덮어쓰지 않던 넷(가족 바꾸기·고르개·카드 메뉴·구성원)은 16 에서 20 으로 오른다.
  // 그 넷은 제목이 부제(14)와 2px 차이라 제목으로 서지 못하고 있었다.
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-title font-bold tracking-heading text-foreground', className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription };
