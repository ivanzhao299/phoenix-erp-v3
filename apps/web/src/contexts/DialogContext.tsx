'use client';
import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import PhoenixDialog from '../components/PhoenixDialog';

type DialogOpts = {
  type?: string; icon?: string; title?: string; subtitle?: string;
  message?: string; content?: React.ReactNode; cancelLabel?: string; confirmLabel?: string;
};
type DialogState = DialogOpts & { hideCancel: boolean };
type DialogContextValue = {
  showAlert:   (opts: DialogOpts) => Promise<boolean>;
  showConfirm: (opts: DialogOpts) => Promise<boolean>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const _open = useCallback((opts: DialogOpts, hideCancel: boolean) => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setState({ ...opts, hideCancel });
    });
  }, []);

  const _close = useCallback((result: boolean) => {
    setState(null);
    if (resolveRef.current) { resolveRef.current(result); resolveRef.current = null; }
  }, []);

  const showAlert   = useCallback((opts: DialogOpts) => _open(opts, true),  [_open]);
  const showConfirm = useCallback((opts: DialogOpts) => _open(opts, false), [_open]);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {state && (
        <PhoenixDialog
          isOpen={true}
          type={state.type}
          icon={state.icon}
          title={state.title}
          subtitle={state.subtitle}
          message={state.message}
          cancelLabel={state.cancelLabel}
          confirmLabel={state.confirmLabel}
          hideCancel={state.hideCancel}
          onCancel={() => _close(false)}
          onConfirm={() => _close(true)}
        >
          {state.content || null}
        </PhoenixDialog>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>');
  return ctx;
}
