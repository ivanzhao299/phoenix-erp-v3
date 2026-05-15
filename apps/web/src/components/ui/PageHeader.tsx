"use client";

import React from "react";
import styles from "./page-header.module.css";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

// ── Status Badge ─────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE:   { label: "启用", color: "#22c55e" },
  INACTIVE: { label: "停用", color: "#64748b" },
  PENDING:  { label: "待处理", color: "#f59e0b" },
  OPEN:     { label: "进行中", color: "#3b82f6" },
  CLOSED:   { label: "已关闭", color: "#64748b" },
  DONE:     { label: "完成", color: "#22c55e" },
  ERROR:    { label: "异常", color: "#ef4444" },
};

export function StatusBadge({ value }: { value: string }) {
  const info = STATUS_MAP[value] ?? { label: value, color: "#94a3b8" };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 12,
      fontWeight: 500,
      padding: "2px 8px",
      borderRadius: 12,
      background: info.color + "22",
      color: info.color,
      border: `1px solid ${info.color}44`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: info.color, display: "inline-block" }} />
      {info.label}
    </span>
  );
}

// ── Action Button ─────────────────────────────────────────────
interface ActionBtnProps {
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export function ActionBtn({ onClick, children, variant = "secondary", disabled }: ActionBtnProps) {
  const colors = {
    primary:   { bg: "var(--brand-primary)", color: "#0f172a", border: "transparent" },
    secondary: { bg: "var(--bg-elevated)",   color: "var(--text-secondary)", border: "var(--border)" },
    danger:    { bg: "rgba(239,68,68,0.1)",  color: "#ef4444", border: "rgba(239,68,68,0.3)" },
  }[variant];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "7px 16px",
        fontSize: 13,
        fontWeight: 500,
        borderRadius: "var(--radius-sm)",
        background: colors.bg,
        color: colors.color,
        border: `1px solid ${colors.border}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}
