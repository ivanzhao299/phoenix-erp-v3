'use client';
import React from 'react';
import ReactDOM from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';

const LIGHT_THEMES: Record<string, any> = {
  confirm: { headerBg:'linear-gradient(135deg,#1f6feb 0%,#6366f1 100%)', accentColor:'#1f6feb', confirmBg:'linear-gradient(135deg,#1f6feb 0%,#6366f1 100%)', confirmShadow:'rgba(31,111,235,0.35)', confirmColor:'#fff' },
  warning: { headerBg:'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)', accentColor:'#d97706', confirmBg:'linear-gradient(135deg,#f59e0b 0%,#d97706 100%)', confirmShadow:'rgba(245,158,11,0.35)', confirmColor:'#fff' },
  danger:  { headerBg:'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)', accentColor:'#dc2626', confirmBg:'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)', confirmShadow:'rgba(220,38,38,0.35)', confirmColor:'#fff' },
  success: { headerBg:'linear-gradient(135deg,#238636 0%,#2ea043 100%)', accentColor:'#238636', confirmBg:'linear-gradient(135deg,#238636 0%,#2ea043 100%)', confirmShadow:'rgba(46,160,67,0.35)', confirmColor:'#fff' },
  alert:   { headerBg:'linear-gradient(135deg,#1f6feb 0%,#6366f1 100%)', accentColor:'#1f6feb', confirmBg:'linear-gradient(135deg,#1f6feb 0%,#6366f1 100%)', confirmShadow:'rgba(31,111,235,0.35)', confirmColor:'#fff' },
};
const DARK_THEMES: Record<string, any> = {
  confirm: { headerBg:'linear-gradient(135deg,rgba(31,111,235,0.18) 0%,rgba(99,102,241,0.12) 100%)', accentColor:'#60a5fa', headerBorder:'4px solid #3b82f6', titleColor:'#93c5fd', confirmBg:'linear-gradient(135deg,rgba(31,111,235,0.75) 0%,rgba(99,102,241,0.75) 100%)', confirmShadow:'rgba(31,111,235,0.2)', confirmColor:'#e0f2fe' },
  warning: { headerBg:'linear-gradient(135deg,rgba(245,158,11,0.16) 0%,rgba(217,119,6,0.10) 100%)', accentColor:'#fbbf24', headerBorder:'4px solid #f59e0b', titleColor:'#fcd34d', confirmBg:'linear-gradient(135deg,rgba(245,158,11,0.72) 0%,rgba(217,119,6,0.72) 100%)', confirmShadow:'rgba(245,158,11,0.18)', confirmColor:'#fef3c7' },
  danger:  { headerBg:'linear-gradient(135deg,rgba(220,38,38,0.16) 0%,rgba(185,28,28,0.10) 100%)', accentColor:'#f87171', headerBorder:'4px solid #dc2626', titleColor:'#fca5a5', confirmBg:'linear-gradient(135deg,rgba(220,38,38,0.72) 0%,rgba(185,28,28,0.72) 100%)', confirmShadow:'rgba(220,38,38,0.18)', confirmColor:'#fee2e2' },
  success: { headerBg:'linear-gradient(135deg,rgba(35,134,54,0.16) 0%,rgba(46,160,67,0.10) 100%)', accentColor:'#4ade80', headerBorder:'4px solid #22c55e', titleColor:'#86efac', confirmBg:'linear-gradient(135deg,rgba(35,134,54,0.72) 0%,rgba(46,160,67,0.72) 100%)', confirmShadow:'rgba(46,160,67,0.18)', confirmColor:'#d1fae5' },
  alert:   { headerBg:'linear-gradient(135deg,rgba(31,111,235,0.18) 0%,rgba(99,102,241,0.12) 100%)', accentColor:'#60a5fa', headerBorder:'4px solid #3b82f6', titleColor:'#93c5fd', confirmBg:'linear-gradient(135deg,rgba(31,111,235,0.75) 0%,rgba(99,102,241,0.75) 100%)', confirmShadow:'rgba(31,111,235,0.2)', confirmColor:'#e0f2fe' },
};

interface PhoenixDialogProps {
  isOpen: boolean;
  type?: string;
  icon?: string;
  title?: string;
  subtitle?: string;
  message?: string;
  children?: React.ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
  hideCancel?: boolean;
}

function PhoenixDialog({ isOpen, type='confirm', icon, title, subtitle, message, children, cancelLabel='取消', confirmLabel='确认', onCancel, onConfirm, hideCancel=false }: PhoenixDialogProps) {
  if (!isOpen || typeof document === 'undefined') return null;
  const { themeMode } = useTheme() || { themeMode: 'light' };
  const isDark = themeMode === 'dark' || (themeMode === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const t = isDark ? (DARK_THEMES[type] || DARK_THEMES.confirm) : (LIGHT_THEMES[type] || LIGHT_THEMES.confirm);

  const dialog = (
    <div onClick={e => { if (e.target === e.currentTarget && onCancel) onCancel(); }} style={{
      position:'fixed', inset:0, zIndex:999999,
      background: isDark ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.55)',
      display:'flex', alignItems:'center', justifyContent:'center',
      backdropFilter:'blur(10px)', fontFamily:"'Inter',-apple-system,sans-serif", padding:'16px',
    }}>
      <div style={{ background:'var(--bg-surface)', borderRadius:'20px', width:'520px', maxWidth:'96vw', maxHeight:'90vh',
        boxShadow: isDark ? '0 32px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.06)' : '0 32px 80px rgba(0,0,0,0.2),0 0 0 1px rgba(0,0,0,0.06)',
        overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ background:t.headerBg, borderLeft: isDark ? t.headerBorder : 'none', padding:'26px 32px 22px',
          display:'flex', alignItems:'flex-start', gap:'16px', flexShrink:0,
          borderBottom: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.2)' }}>
          {icon && (
            <span style={{ fontSize: isDark?'36px':'44px', lineHeight:1, flexShrink:0, marginTop:'2px',
              ...(isDark ? { width:'52px', height:'52px', display:'flex', alignItems:'center', justifyContent:'center',
                backgroundColor:`color-mix(in srgb, ${t.accentColor} 18%, transparent)`,
                borderRadius:'14px', border:`1px solid color-mix(in srgb, ${t.accentColor} 30%, transparent)` } : {}) }}>
              {icon}
            </span>
          )}
          <div style={{ paddingTop: icon && isDark ? '6px' : 0 }}>
            <div style={{ fontSize:'20px', fontWeight:'800', color: isDark ? t.titleColor : '#fff', letterSpacing:'-0.3px', lineHeight:1.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize:'13px', color: isDark ? `color-mix(in srgb,${t.titleColor} 70%,transparent)` : 'rgba(255,255,255,0.82)', marginTop:'5px', lineHeight:1.5 }}>{subtitle}</div>}
          </div>
        </div>
        {/* Body */}
        <div style={{ padding:'24px 32px', overflowY:'auto', flex:1 }}>
          {message && <p style={{ fontSize:'15px', color:'var(--text-main)', lineHeight:'1.75', margin:0, whiteSpace:'pre-line' }}>{message}</p>}
          {children}
        </div>
        {/* Actions */}
        <div style={{ padding:'12px 32px 26px', display:'flex', gap:'12px', flexShrink:0, borderTop:'1px solid var(--border-color)' }}>
          {!hideCancel && (
            <button onClick={onCancel} style={{ flex:1, padding:'13px', fontSize:'14px', fontWeight:'600',
              border:'1.5px solid var(--border-color)', borderRadius:'10px',
              background:'var(--bg-element)', color:'var(--text-muted)', cursor:'pointer', transition:'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background='var(--bg-surface)'; (e.currentTarget as HTMLElement).style.color='var(--text-main)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='var(--bg-element)'; (e.currentTarget as HTMLElement).style.color='var(--text-muted)'; }}>
              {cancelLabel}
            </button>
          )}
          <button onClick={onConfirm} style={{ flex: hideCancel ? 1 : 1.6, padding:'13px', fontSize:'14px', fontWeight:'700',
            border:'none', borderRadius:'10px', background:t.confirmBg, color:t.confirmColor,
            cursor:'pointer', boxShadow:`0 4px 16px ${t.confirmShadow}`, transition:'all 0.15s', letterSpacing:'0.2px' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity='0.88'; (e.currentTarget as HTMLElement).style.transform='translateY(-1px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity='1'; (e.currentTarget as HTMLElement).style.transform='translateY(0)'; }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(dialog, document.body);
}

export default PhoenixDialog;
