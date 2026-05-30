import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:   'bg-bg-muted text-text-muted border border-border',
        success:   'bg-success/10  text-success  border border-success/20',
        warning:   'bg-warning/10  text-warning  border border-warning/20',
        danger:    'bg-danger/10   text-danger   border border-danger/20',
        info:      'bg-info/10     text-info     border border-info/20',
        brand:     'bg-brand/10    text-brand    border border-brand/20',
        outline:   'border border-border text-text-muted bg-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
