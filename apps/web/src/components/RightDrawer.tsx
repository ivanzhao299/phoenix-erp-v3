'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface RightDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
  footer?: React.ReactNode;
}

// Z-index hierarchy (2025 V3 standard):
//   Sidebar      → 10001
//   Sidebar tap  → 10200  ← intercepts sidebar clicks when drawer open
//   Drawer panel → 10100  ← above sidebar
//   Backdrop     → 10100  ← covers full viewport
//   ConfirmDialog→ 10200
export default function RightDrawer({
  isOpen, onClose, title, children, width = '480px', footer,
}: RightDrawerProps) {
  const { t } = useLanguage();
  const savedScroll = useRef(0);

  useEffect(() => {
    const scrollEl = document.getElementById('phx-content-scroll');
    if (isOpen) {
      if (scrollEl) savedScroll.current = scrollEl.scrollTop;
      const sw = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = sw > 0 ? `${sw}px` : '';
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      const t = setTimeout(() => {
        if (scrollEl) scrollEl.scrollTo({ top: savedScroll.current, behavior: 'smooth' });
      }, 300);
      return () => clearTimeout(t);
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* ── Sidebar tap intercept ── */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: 'var(--sidebar-width, 56px)', bottom: 0,
          zIndex: 10200, cursor: 'pointer',
        }}
      />

      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 56, left: 0, right: 0, bottom: 0,
          zIndex: 10100,
          background: 'rgba(0,0,0,0.45)',
          animation: 'phxFadeIn 0.22s ease forwards',
        }}
      />

      {/* ── Drawer panel ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 56,
          right: 0,
          bottom: 0,
          width,
          maxWidth: '96vw',
          zIndex: 10100,
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'phxSlideInRight 0.26s cubic-bezier(0.4,0,0.2,1) forwards',
          overflow: 'hidden',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--bg-card, #f9fafb)',
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            title={t('ui.关闭', '关闭')}
            aria-label={t('ui.关闭抽屉', '关闭抽屉')}
            style={{
              width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-muted, #f3f4f6)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '20px 24px',
          scrollBehavior: 'smooth',
          overscrollBehavior: 'contain',
        }}>
          {children}
        </div>

        {/* Footer (optional) */}
        {footer && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-card, #f9fafb)',
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes phxSlideInRight {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1;   }
        }
        @keyframes phxFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      ` }} />
    </>,
    document.body,
  );
}
