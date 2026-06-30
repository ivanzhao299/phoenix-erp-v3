'use client';
import React from 'react';
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * WorkbenchKit 部件（Design System V2 · UI-2.5）— POS/作业台专用组件。
 * 全部走 CSS 变量(暗色/独立深色由 token 管理),大触摸目标,工业/收银友好。
 * 供 store-pos / terminal / packaging 等作业台页面采用,消除页面硬编码。
 */

/** WorkbenchHeader — 作业台顶栏(标题 + 状态 + 操作) */
export function WorkbenchHeader({ title, status, actions }: { title: string; status?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: 'var(--bg-card)', borderBottom: '2px solid var(--border)' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-primary)' }}>{title}</div>
      {status}
      {actions && <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>{actions}</div>}
    </div>
  );
}

/** WorkbenchProductCard — 大商品卡(收银选品用) */
export function WorkbenchProductCard({ name, price, sku, sub, disabled, onClick }: {
  name: string; price: string | number; sku?: string; sub?: string; disabled?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', padding: 14, minHeight: 92, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{name}</div>
      {sku && <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>{sku}</div>}
      <div style={{ marginTop: 'auto', fontSize: 18, fontWeight: 800, color: 'var(--status-success)' }}>¥{typeof price === 'number' ? price.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : price}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{sub}</div>}
    </button>
  );
}

/** WorkbenchCartPanel — 购物车面板容器 */
export function WorkbenchCartPanel({ title, children, footer }: { title?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { t } = useLanguage();
  const resolvedTitle = title ?? t('ui.购物车','购物车');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 700, color: 'var(--color-primary)' }}>{resolvedTitle}</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>{children}</div>
      {footer && <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>{footer}</div>}
    </div>
  );
}

/** WorkbenchSummaryBar — 底部结算汇总条 */
export function WorkbenchSummaryBar({ items }: { items: { label: string; value: string; accent?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <div key={i} style={{ flex: '1 1 120px', padding: '12px 18px', borderLeft: i === 0 ? 'none' : '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{it.label}</div>
          <div style={{ fontSize: it.accent ? 24 : 18, fontWeight: 800, color: it.accent ? 'var(--status-success)' : 'var(--text-primary)', marginTop: 2 }}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/** WorkbenchKeypad — 数字键盘(数量/金额录入) */
export function WorkbenchKeypad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {keys.map((k) => (
        <button key={k} onClick={() => onKey(k)}
          style={{ minHeight: 56, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>
          {k}
        </button>
      ))}
    </div>
  );
}

/** WorkbenchEmptyState — 作业台空态(空购物车/无商品) */
export function WorkbenchEmptyState({ icon: Icon, title, hint }: { icon?: React.ElementType; title?: string; hint?: string }) {
  const { t } = useLanguage();
  const resolvedTitle = title ?? t('ui.暂无数据','暂无数据');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40, color: 'var(--text-secondary)', textAlign: 'center' }}>
      {Icon && <div style={{ color: 'var(--text-disabled)' }}><Icon size={40} /></div>}
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{resolvedTitle}</div>
      {hint && <div style={{ fontSize: 13 }}>{hint}</div>}
    </div>
  );
}
