'use client';
import { useEffect, useState } from 'react';
import request from '@/lib/api-client';

/**
 * useEggSourceProfile — 鸡舍蛋品来源档案 hook（2026-11-14）
 * ════════════════════════════════════════════════════════════════════════
 * 数据源：GET /api/lookup/egg-source-profile?houseCode=&eggDate=
 *   md_egg_source_profiles 是鸡舍 → 商业产品模式的权威映射
 *   （孟赛 6 舍 STANDARD 普通分级；东鹏 01/03/05 粉壳、02/04 红壳）。
 *   此前该映射只在服务端入库/SKU 解析内部使用，日产蛋入库/日生产日报
 *   表单无法跟随鸡舍展示品种 —— 本 hook 把档案只读带到录入页。
 *
 * 语义：
 *   profile === null 且 !loading → 该鸡舍无有效档案（提交会被服务端 resolve fail-closed 拒绝）
 *   品种由档案决定，前端只展示、不传值（防伪造；服务端仍以档案为准）。
 *
 * 实现约定（与 useProductGrades 同款）：effect 内不做同步 setState，
 * 状态按 (house|date) 键存档、派生读取 —— 切舍/改日期时旧档案立即失效，
 * loading 派生为"当前键尚无落盘结果"。
 */

export interface EggSourceProfile {
  profileCode: string;
  companyCode: string;
  farmCode: string;
  siteCode: string;
  houseCode: string;
  productMode: 'STANDARD' | 'VARIANT' | string;
  varietyCode: string | null;
  varietyName: string | null;
  shellColor: string | null;
}

interface ProfileEntry {
  key: string;
  profile: EggSourceProfile | null;
}

function normalize(raw: EggSourceProfile | { data: EggSourceProfile | null } | null): EggSourceProfile | null {
  // 兼容 {code,data} 信封与直接对象两种返回形态（同 useProductGrades 的处理）
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as { data: EggSourceProfile | null }).data ?? null;
  }
  return (raw as EggSourceProfile | null) ?? null;
}

export function useEggSourceProfile(houseCode: string, eggDate?: string) {
  const house = houseCode.trim();
  const key = `${house}|${eggDate ?? ''}`;
  const [entry, setEntry] = useState<ProfileEntry | null>(null);

  useEffect(() => {
    if (!house) return;
    let cancelled = false;
    const qs = new URLSearchParams({ houseCode: house });
    if (eggDate) qs.set('eggDate', eggDate);
    request<EggSourceProfile | { data: EggSourceProfile | null } | null>(`/lookup/egg-source-profile?${qs.toString()}`)
      .then(raw => { if (!cancelled) setEntry({ key, profile: normalize(raw) }); })
      .catch(() => { if (!cancelled) setEntry({ key, profile: null }); });
    return () => { cancelled = true; };
  }, [house, eggDate, key]);

  const current = entry?.key === key ? entry : null;
  return { profile: current?.profile ?? null, loading: !!house && !current };
}

/** 品种短名（红壳/粉壳）；STANDARD 或无档案返回空串，等级行标签不加后缀。 */
export function varietyShortLabel(profile: EggSourceProfile | null): string {
  if (!profile || profile.productMode !== 'VARIANT') return '';
  if (profile.shellColor === 'RED') return '红壳';
  if (profile.shellColor === 'PINK') return '粉壳';
  return profile.varietyName ?? profile.varietyCode ?? '';
}
