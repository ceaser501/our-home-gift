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
              'inset-x-0 bottom-0 mx-auto w-full max-w-(--sheet-max-width) rounded-t-2xl border-t',
              'max-h-[92dvh]',
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
        {...props}
      >
        {children}
        {showClose && (
          <SheetPrimitive.Close className="absolute top-4 right-4 rounded-full bg-muted p-2 opacity-80 transition-opacity hover:opacity-100 focus:outline-hidden">
            <XIcon className="size-4" />
            <span className="sr-only">닫기</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1 px-5 pt-5', className)} {...props} />;
}

function SheetTitle({ className, ...props }) {
  return (
    <SheetPrimitive.Title data-slot="sheet-title" className={cn('text-base font-semibold text-foreground', className)} {...props} />
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
