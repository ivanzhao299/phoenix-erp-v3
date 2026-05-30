'use client';
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
      'data-[state=open]:animate-[phx-fade-in_0.15s_ease]',
      'data-[state=closed]:animate-[phx-fade-out_0.15s_ease]',
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const sheetVariants = cva(
  'fixed z-50 bg-bg-card border-border shadow-[var(--shadow-lg)] transition ease-[var(--ease-spring)] flex flex-col',
  {
    variants: {
      side: {
        right:  'inset-y-0 right-0 h-full w-full sm:max-w-xl border-l data-[state=open]:animate-[phx-slide-in-r_0.25s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[phx-slide-out-r_0.2s_ease-in]',
        left:   'inset-y-0 left-0  h-full w-full sm:max-w-xl border-r data-[state=open]:animate-[phx-slide-in-l_0.25s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[phx-slide-out-l_0.2s_ease-in]',
        bottom: 'inset-x-0 bottom-0 h-auto w-full max-h-[80vh] border-t data-[state=open]:animate-[phx-slide-in-b_0.25s_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[phx-slide-out-b_0.2s_ease-in]',
      },
    },
    defaultVariants: { side: 'right' },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 text-text-muted hover:opacity-100 hover:text-text transition-opacity focus:outline-none">
        <X size={16} />
        <span className="sr-only">关闭</span>
      </DialogPrimitive.Close>
      {children}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1 px-5 pt-5 pb-4 border-b border-border shrink-0', className)} {...props} />
);
const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0 mt-auto', className)} {...props} />
);
const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto p-5', className)} {...props} />
);
const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('font-semibold text-sm text-text', className)} {...props} />
));
SheetTitle.displayName = 'SheetTitle';
const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-xs text-text-muted', className)} {...props} />
));
SheetDescription.displayName = 'SheetDescription';

export {
  Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay,
  SheetContent, SheetHeader, SheetFooter, SheetBody, SheetTitle, SheetDescription,
};
