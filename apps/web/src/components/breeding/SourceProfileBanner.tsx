'use client';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CSSProperties } from 'react';
import type { EggSourceProfile } from '@/hooks/useEggSourceProfile';

/**
 * SourceProfileBanner — 鸡舍蛋品来源档案横幅（日产蛋入库 / 日生产日报共用）
 *
 * 选舍后展示该舍的商业产品模式：
 *   · VARIANT  → 🟣 品种名（红壳蛋/粉壳蛋）+ 品种码，提示按对应壳色产品线入库
 *   · STANDARD → 普通分级
 *   · 无档案   → 警示"提交将被服务端拒绝"（resolveSourceProfile fail-closed）
 * 品种由 md_egg_source_profiles 决定，横幅只读展示，不提供选择。
 */
export function SourceProfileBanner({ profile, loading, houseCode, style }: {
  profile: EggSourceProfile | null;
  loading: boolean;
  houseCode: string;
  style?: CSSProperties;
}) {
  const { t } = useLanguage();
  if (!houseCode) return null;
  const base: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', borderRadius: 7, fontSize: 12, lineHeight: 1.5,
    flexWrap: 'wrap', ...style,
  };
  if (loading) {
    return <div style={{ ...base, border: '1px solid var(--border)', background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}>
      {t('breeding.sourceProfile.loading', '来源档案加载中…')}
    </div>;
  }
  if (!profile) {
    return <div style={{ ...base, border: '1px solid var(--status-warning)', background: 'var(--status-warning-bg-light)', color: 'var(--status-warning)' }}>
      ⚠️ {t('breeding.sourceProfile.missing', '该鸡舍无蛋品来源档案，提交将被服务端拒绝。请先在主数据为该鸡舍配置 md_egg_source_profiles。')}
    </div>;
  }
  if (profile.productMode === 'VARIANT') {
    const variety = profile.varietyName ?? profile.varietyCode ?? '';
    return <div style={{ ...base, border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)', background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)', color: 'var(--color-primary)', fontWeight: 600 }}>
      🟣 {t('breeding.sourceProfile.variant', '来源档案')}: {t(`ui.${variety}`, variety)}
      {profile.varietyCode ? <span style={{ fontWeight: 400, fontFamily: 'monospace', fontSize: 11 }}>({profile.varietyCode})</span> : null}
      <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>{t('breeding.sourceProfile.variantHint', '本舍鸡蛋按该壳色产品线分级入库')}</span>
    </div>;
  }
  return <div style={{ ...base, border: '1px solid var(--status-success-bg-strong)', background: 'var(--status-success-bg-medium)', color: 'var(--status-success)' }}>
    ✅ {t('breeding.sourceProfile.standard', '来源档案:普通分级(STANDARD)')}
  </div>;
}
