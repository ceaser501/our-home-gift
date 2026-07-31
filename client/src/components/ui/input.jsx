import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Input };
