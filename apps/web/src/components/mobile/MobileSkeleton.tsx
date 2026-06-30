'use client';
/**
 * MobileSkeleton — 手机端通用骨架屏组件
 *
 * 用法示例:
 *   if (loading) return <MobilePageSkeleton title="饲料台账" tabs={['今日','历史']} />;
 */

import { useMobileTheme } from '@/contexts/MobileThemeContext';
import { useLanguage } from "@/contexts/LanguageContext";

// ── 原子骨架块 ────────────────────────────────────────────────────────────────

/** 单个矩形骨架块 */
export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius, flexShrink: 0, ...style }}
    />
  );
}

/** 骨架卡片（模拟一条数据行） */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  const { t, isDark } = useMobileTheme();
  return (
    <div style={{
      background: isDark ? 'var(--gray-800)' : 'var(--bg-card)',
      borderRadius: 14,
      padding: '14px 14px 12px',
      border: `1px solid ${isDark ? 'var(--gray-700)' : 'var(--gray-200)'}`,
      marginBottom: 10,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* 顶行：标题 + 徽章 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonBlock width="55%" height={14} />
        <SkeletonBlock width={52} height={20} radius={20} />
      </div>
      {lines >= 2 && <SkeletonBlock width="80%" height={12} />}
      {lines >= 3 && <SkeletonBlock width="45%" height={12} />}
    </div>
  );
}

/** 骨架统计格子（2列） */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  const { isDark } = useMobileTheme();
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: isDark ? 'var(--gray-800)' : 'var(--bg-card)',
          borderRadius: 14, padding: '14px',
          border: `1px solid ${isDark ? 'var(--gray-700)' : 'var(--gray-200)'}`,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <SkeletonBlock width="60%" height={11} />
          <SkeletonBlock width="40%" height={22} />
        </div>
      ))}
    </div>
  );
}

// ── 完整页面骨架 ──────────────────────────────────────────────────────────────

interface MobilePageSkeletonProps {
  /** 顶部标题（显示真实标题，立即可见） */
  title: string;
  /** Tab 标签列表 */
  tabs?: string[];
  /** 卡片数量 */
  cards?: number;
  /** 卡片每张行数 */
  cardLines?: number;
  /** 是否显示统计格子 */
  statGrid?: boolean;
  onBack?: () => void;
}

/**
 * 完整页面骨架屏
 * - header 使用真实标题（让用户知道已切到正确页面）
 * - 内容区显示 shimmer 骨架
 */
export function MobilePageSkeleton({
  title,
  tabs,
  cards = 4,
  cardLines = 2,
  statGrid = false,
  onBack,
}: MobilePageSkeletonProps) {
  const { t, isDark } = useMobileTheme();

  return (
    <div style={{ minHeight: '100vh', background: isDark ? 'var(--slate-900)' : 'var(--slate-100)' }}>
      {/* ── 顶栏（真实内容，立即渲染） ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: isDark ? 'var(--slate-800)' : 'var(--bg-card)',
        borderBottom: `1px solid ${isDark ? 'var(--slate-700)' : 'var(--slate-200)'}`,
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{ background: 'none', border: 'none', color: t.text, cursor: 'pointer', padding: 4 }}
            >
              ‹
            </button>
          )}
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text }}>{title}</span>
        </div>
        {/* 刷新按钮占位 */}
        <SkeletonBlock width={28} height={28} radius={8} />
      </div>

      {/* ── Tab 骨架 ── */}
      {tabs && tabs.length > 0 && (
        <div style={{
          display: 'flex', margin: '12px 16px 0',
          background: isDark ? 'var(--slate-800)' : 'var(--slate-200)',
          borderRadius: 12, padding: 4, gap: 4,
        }}>
          {tabs.map((label, i) => (
            <div key={i} style={{
              flex: 1, padding: '9px 0', borderRadius: 9,
              background: i === 0 ? (isDark ? 'var(--gray-700)' : 'var(--gray-300)') : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 13, color: t.textSub, opacity: 0.7 }}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 内容骨架 ── */}
      <div style={{ padding: '12px 16px 80px' }}>
        {statGrid && <SkeletonStatGrid count={4} />}
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} lines={cardLines} />
        ))}
      </div>
    </div>
  );
}

// ── 空状态 ────────────────────────────────────────────────────────────────────

interface MobileEmptyStateProps {
  icon?: string;
  title?: string;
  desc?: string;
  action?: React.ReactNode;
}

/**
 * 空状态组件 — 替代"暂无数据"文字，提供图标+标题+说明+可选操作按钮
 * 用法：
 *   <MobileEmptyState icon="📭" title="暂无记录" desc="今日还没有数据" />
 */
export function MobileEmptyState({
  icon = '📭',
  title,
  desc,
  action,
}: MobileEmptyStateProps) {
  const { t } = useMobileTheme();
  const { t: tr } = useLanguage();
  const resolvedTitle = title ?? tr('ui.暂无数据','暂无数据');
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 6 }}>{resolvedTitle}</div>
      {desc && (
        <div style={{ fontSize: 13, color: t.textFaint, lineHeight: 1.6, maxWidth: 240 }}>{desc}</div>
      )}
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}
