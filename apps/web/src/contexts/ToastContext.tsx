'use client';
import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';

interface Toast { id: number; type: string; message: string; }
interface ToastColor { border: string; bg: string; }
interface ToastActions {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastActions | null>(null);

const ICONS: Record<string, string> = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
const COLORS: Record<string, ToastColor> = {
  success: { border:'var(--status-success)', bg:'rgba(16,185,129,0.08)' },
  error:   { border:'var(--status-danger)', bg:'rgba(239,68,68,0.08)' },
  warning: { border:'var(--status-warning)', bg:'rgba(245,158,11,0.08)' },
  info:    { border:'var(--status-info)', bg:'rgba(59,130,246,0.08)' },
};

function ToastItem({ id, type = 'info', message, onRemove }: Toast & { onRemove: (id: number) => void }) {
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
      background:'var(--bg-card)',
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
      <span style={{ fontSize:13.5, lineHeight:1.55, color:'var(--text-primary)', fontWeight:500 }}>{message}</span>
    </div>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  if (!toasts.length || typeof document === 'undefined') return null;
  return ReactDOM.createPortal(
    <div style={{ position:'fixed', top:20, right:20, zIndex:999999, display:'flex', flexDirection:'column', gap:10, pointerEvents:'none' }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents:'auto' }}>
          <ToastItem {...t} onRemove={onRemove} />
        </div>
      ))}
    </div>,
    document.body
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const add = useCallback((type: string, message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
  }, []);
  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // G25-B：监听 api-client 派发的全局 api-error 事件，自动显示后端错误 toast
  //   解决 F2 欠债：之前后端 error 静默丢失（页面 catch 不一定 toast），调试困难
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; status?: number; code?: string };
      const prefix = detail.status ? `[${detail.status}] ` : '';
      add('error', `${prefix}${detail.message ?? 'API 请求失败'}`);
    };
    window.addEventListener('api-error', handler);
    return () => window.removeEventListener('api-error', handler);
  }, [add]);

  // 审批提交后提示"提交给谁审批"（后端 ApprovalHintInterceptor 注入 + api-client 派发）
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { roleZh?: string | null; names?: string[] };
      const role = d.roleZh || '审批人';
      const names = d.names && d.names.length ? `（${d.names.join('、')}）` : '';
      add('success', `已提交，等待【${role}】审批${names}`);
    };
    window.addEventListener('approval-hint', handler);
    return () => window.removeEventListener('approval-hint', handler);
  }, [add]);

  // add 已 useCallback 稳定 → toast 仅构建一次，避免每次渲染换引用让所有 useToast 消费者重渲染
  const toast = useMemo(() => ({
    success: (msg: string) => add('success', msg),
    error: (msg: string) => add('error', msg),
    warning: (msg: string) => add('warning', msg),
    info: (msg: string) => add('info', msg),
  }), [add]);
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
