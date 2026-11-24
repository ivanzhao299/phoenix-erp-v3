'use client';
import { useEffect, useMemo, useState } from 'react';
import request from '@/lib/api-client';

/** A commercial source is scoped to a house and its egg date, independently of flock genetics. */
export interface EggSourceProfile {
  profileCode: string;
  companyCode: string;
  farmCode: string;
  siteCode: string;
  houseCode: string;
  eggDate?: string;
  productMode: 'STANDARD' | 'VARIANT' | string;
  varietyCode: string | null;
  varietyName: string | null;
  shellColor: string | null;
}

interface ProfileEntry {
  key: object;
  error: string | null;
  profile: EggSourceProfile | null;
}

function normalize(raw: EggSourceProfile | { data: EggSourceProfile | null } | null): EggSourceProfile | null {
  // 兼容 {code,data} 信封与直接对象两种返回形态（同 useProductGrades 的处理）
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as { data: EggSourceProfile | null }).data ?? null;
  }
  return (raw as EggSourceProfile | null) ?? null;
}

export function useEggSourceProfile(houseCode: string, eggDate: string, companyCode?: string, revision = 0) {
  const house = houseCode.trim();
  const key = useMemo(() => ({ house, eggDate, companyCode, revision }), [house, eggDate, companyCode, revision]);
  const [entry, setEntry] = useState<ProfileEntry | null>(null);

  useEffect(() => {
    if (!key.house || !key.eggDate) return;
    const controller = new AbortController();
    const qs = new URLSearchParams({ houseCode: key.house, eggDate: key.eggDate });
    if (key.companyCode) qs.set('companyCode', key.companyCode);
    request<EggSourceProfile | { data: EggSourceProfile | null } | null>(`/lookup/egg-source-profile?${qs}`,
      { signal: controller.signal, silent: true })
      .then(raw => {
        const profile = normalize(raw);
        if (profile && (profile.houseCode !== key.house || (profile.eggDate && profile.eggDate !== key.eggDate)
            || (key.companyCode && profile.companyCode !== key.companyCode)
            || !['STANDARD', 'VARIANT'].includes(profile.productMode))) throw new Error('来源档案与所选鸡舍不一致');
        if (!controller.signal.aborted) setEntry({ key, profile, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setEntry({ key, profile: null, error: error instanceof Error ? error.message : '来源档案未核实' });
      });
    return () => controller.abort();
  }, [key]);

  const current = entry?.key === key ? entry : null;
  return { profile: current?.profile ?? null, error: current?.error ?? null, loading: !!house && !!eggDate && !current };
}

/** 品种短名（红壳/粉壳）；STANDARD 或无档案返回空串，等级行标签不加后缀。 */
export function varietyShortLabel(profile: EggSourceProfile | null): string {
  if (!profile || profile.productMode !== 'VARIANT') return '';
  if (profile.shellColor === 'RED') return '红壳';
  if (profile.shellColor === 'PINK') return '粉壳';
  return profile.varietyName ?? profile.varietyCode ?? '';
}
