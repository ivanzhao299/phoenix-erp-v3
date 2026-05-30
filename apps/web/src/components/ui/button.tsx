'use client';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn text-sm font-medium cursor-pointer select-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:   'bg-brand text-white hover:opacity-90 active:scale-[0.98]',
        secondary: 'bg-bg-muted text-text hover:opacity-80 border border-border',
        outline:   'border border-border bg-bg-card text-text hover:bg-bg-muted',
        ghost:     'text-text hover:bg-bg-muted',
        danger:    'bg-danger text-white hover:opacity-90 active:scale-[0.98]',
        success:   'bg-success text-white hover:opacity-90',
        link:      'text-brand underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        xs:   'h-6  px-2.5 text-xs gap-1',
        sm:   'h-7  px-3   text-xs',
        default: 'h-9 px-4',
        lg:   'h-10 px-6   text-base',
        icon: 'h-9  w-9',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
