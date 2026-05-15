"use client";
import { useEffect, useRef, memo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./rightDrawer.module.css";

interface RightDrawerProps {
  open: boolean;
  title: string;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

// ✅ 关键：不再 return null — 保持 DOM 挂载，用 CSS 控制显隐
// 这样可以避免 CrudForm 在每次打开/关闭时重新挂载（造成闪烁和卡顿）
// createPortal 挂到 document.body 确保遮罩覆盖全屏（不受下层 stacking context 限制）
export const RightDrawer = memo(function RightDrawer({
  open, title, width = 520, onClose, children, footer,
}: RightDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // 关闭时 Escape 键
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // 打开时锁定 body 滚动
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // 打开时焦点管理（可访问性）
  useEffect(() => {
    if (open && drawerRef.current) {
      const focusable = drawerRef.current.querySelector<HTMLElement>(
        "input, select, textarea, button:not([disabled])"
      );
      focusable?.focus();
    }
  }, [open]);

  const overlay = (
    // ✅ 用 aria-hidden + pointer-events + opacity 控制显隐，不卸载组件
    <div
      className={styles.overlay}
      aria-hidden={!open}
      style={{
        opacity:       open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        visibility:    open ? "visible" : "hidden",
        transition:    "opacity 220ms ease, visibility 220ms",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={drawerRef}
        className={styles.drawer}
        style={{
          width,
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 220ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose} title="关闭" aria-label="关闭抽屉">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {children}
        </div>

        {/* Footer */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );

  // SSR 安全：服务端没有 document.body，等客户端挂载后才渲染 portal
  if (!mounted) return null;
  return createPortal(overlay, document.body);
});
