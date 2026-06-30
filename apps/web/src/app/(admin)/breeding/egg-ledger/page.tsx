'use client';

/**
 * G15：/breeding/egg-ledger 已废弃
 * ════════════════════════════════════════════════════════════════════════
 * 业务方明确：废弃此页（实测 inv_batches.warehouse_code='FARM_EGG' 0 行，
 * 业务方未实际使用）。蛋品流向收口为：
 *   · 养殖统计 → /breeding/daily（含可选 9 档 JSONB）
 *   · 销售入库 → /breeding/daily-inbound（TEMP_PRODUCTION_INBOUND 模式）
 *
 * 路由保留作为外链兼容，自动跳转到 /breeding/daily。
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';

export default function DeprecatedEggLedgerPage() {
  const { t } = useLanguage();
  const router = useRouter();
  useEffect(() => {
    router.replace('/breeding/daily');
  }, [router]);
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
      <h3 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>{t('breeding.pageMigrated', '页面已迁移')}</h3>
      <p>{t('breeding.eggLedgerMerged', '蛋品台账已合并到「日生产日报」，正在跳转…')}</p>
    </div>
  );
}
