'use client';
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';

const ToastContext = createContext<any>(null);

const ICONS: Record<string, string> = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
const COLORS: Record<string, any> = {
  success: { border:'#10b981', bg:'rgba(16,185,129,0.08)' },
  error:   { border:'#ef4444', bg:'rgba(239,68,68,0.08)' },
  warning: { border:'#f59e0b', bg:'rgba(245,158,11,0.08)' },
  info:    { border:'#3b82f6', bg:'rgba(59,130,246,0.08)' },
};

function ToastItem({ id, type = 'info', message, onRemove }: any) {
  const [leaving, setLeaving] = React.useState(false);
  const dismiss = React.useCallback(() => {
    setLeaving(true);
    setTimeout(() => onRemove(id), 280);
  }, [id, onRemove]);
  React.useEffect(() => {
    const t = setTimeout(dismiss, 3500);
    return () => clearTimeout(t);
  }, [dismiss]);
  const c = COLORS[type] || COLORS.info;
  return (
    <div onClick={dismiss} style={{
      display:'flex', alignItems:'flex-start', gap:10,
      padding:'12px 16px', borderRadius:12,
      background:'var(--bg-surface, #fff)',
      border:`1px solid ${c.border}30`,
      borderLeft:`4px solid ${c.border}`,
      boxShadow:'0 8px 32px rgba(0,0,0,0.12)',
      cursor:'pointer', maxWidth:360, minWidth:240,
      backdropFilter:'blur(8px)',
      fontFamily:"'Inter',-apple-system,sans-serif",
      transform: leaving ? 'translateX(110%)' : 'translateX(0)',
      opacity: leaving ? 0 : 1,
      transition:'transform 0.28s ease, opacity 0.28s ease',
    }}>
      <span style={{ fontSize:18, lineHeight:1.4, flexShrink:0 }}>{ICONS[type]}</span>
      <span style={{ fontSize:13.5, lineHeight:1.55, color:'var(--text-main, #1e293b)', fontWeight:500 }}>{message}</span>
    </div>
  );
}

function ToastContainer({ toasts, onRemove }: any) {
  if (!toasts.length || typeof document === 'undefined') return null;
  return ReactDOM.createPortal(
    <div style={{ position:'fixed', top:20, right:20, zIndex:999999, display:'flex', flexDirection:'column', gap:10, pointerEvents:'none' }}>
      {toasts.map((t: any) => (
        <div key={t.id} style={{ pointerEvents:'auto' }}>
          <ToastItem {...t} onRemove={onRemove} />
        </div>
      ))}
    </div>,
    document.body
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<any[]>([]);
  const idRef = useRef(0);
  const add = useCallback((type: string, message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);
  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  const toast = {
    success: (msg: string) => add('success', msg),
    error:   (msg: string) => add('error',   msg),
    warning: (msg: string) => add('warning', msg),
    info:    (msg: string) => add('info',    msg),
  };
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
