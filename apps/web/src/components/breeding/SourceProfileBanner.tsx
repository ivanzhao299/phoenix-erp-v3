'use client';
import { EGG_SOURCE_MENU } from '@/lib/egg-source-permissions';
import Link from 'next/link';
import { usePermission } from '@/hooks/usePermission';
import { useLanguage } from '@/contexts/LanguageContext';
import type { CSSProperties } from 'react';
import { type EggSourceProfile, varietyShortLabel } from '@/hooks/useEggSourceProfile';

export function SourceProfileBanner({ profile, loading, error, houseCode, style, context = 'inbound' }: {
  profile: EggSourceProfile | null;
  loading: boolean;
  error?: string | null;
  houseCode: string;
  style?: CSSProperties;
  context?: 'report'|'inbound';
}) {
  const { t } = useLanguage();
  const {canView}=usePermission(EGG_SOURCE_MENU);
  const link=canView?<Link href={{pathname:'/master-data/egg-sources', query:{houseCode}}}>
    {t('eggSources.title','蛋品来源档案')}</Link>:null;
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
      ⚠️ {context==='report' ? t('eggSources.reportNotice','当日来源档案待核实。请照常如实填日报，主管须在入库前核对。')
        : error || t('breeding.sourceProfile.missing','该舍产蛋日缺少有效来源档案，暂不能入库。')} {link}
    </div>;
  }
  if (profile.productMode === 'VARIANT') {
    const variety = profile.varietyName ?? profile.varietyCode ?? '';
    const shell = varietyShortLabel(profile);
    return <div style={{ ...base, border: '1px solid color-mix(in srgb, var(--color-primary) 30%, transparent)', background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)', color: 'var(--color-primary)', fontWeight: 600 }}>
      🟣 {t('breeding.sourceProfile.variant', '来源档案')}: {t(`ui.${variety}`, variety)}
      {shell && !variety.includes(shell) && <span>{t(`ui.${shell}`, shell)}</span>}
      {profile.varietyCode ? <span style={{ fontWeight: 400, fontFamily: 'monospace', fontSize: 11 }}>({profile.varietyCode})</span> : null}
      <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>{t('breeding.sourceProfile.variantHint', '本舍鸡蛋按该壳色产品线分级入库')}</span>{link}
    </div>;
  }
  return <div style={{ ...base, border: '1px solid var(--status-success-bg-strong)', background: 'var(--status-success-bg-medium)', color: 'var(--status-success)' }}>
    ✅ {t('breeding.sourceProfile.standard', '来源档案：普通蛋')}{link}
  </div>;
}
