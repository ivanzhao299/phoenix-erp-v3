'use client';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-bg-card group-[.toaster]:text-text group-[.toaster]:border-border group-[.toaster]:shadow-[var(--shadow-md)] group-[.toaster]:rounded-card',
          description: 'group-[.toast]:text-text-muted',
          actionButton: 'group-[.toast]:bg-brand group-[.toast]:text-white',
          cancelButton:  'group-[.toast]:bg-bg-muted group-[.toast]:text-text-muted',
          error:   'group-[.toaster]:!bg-danger/10 group-[.toaster]:!border-danger/20 group-[.toaster]:!text-danger',
          success: 'group-[.toaster]:!bg-success/10 group-[.toaster]:!border-success/20 group-[.toaster]:!text-success',
          warning: 'group-[.toaster]:!bg-warning/10 group-[.toaster]:!border-warning/20 group-[.toaster]:!text-warning',
        },
      }}
      {...props}
    />
  );
}
