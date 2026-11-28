'use client';

import Link from 'next/link';
import { Monitor, PackageSearch } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PackingProductionReport from '@/components/packaging/PackingProductionReport';
import { useLanguage } from '@/contexts/LanguageContext';
import { primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';

export default function PackagingOverviewPage() {
  const { t } = useLanguage();

  return (
    <main style={{ padding: '0 20px 24px', height: '100%', overflowY: 'auto' }}>
      <PageHeader
        title={t('ui.包装中心管理', '包装中心管理')}
        subtitle={t('packaging.report.instructions', '按包装原单的生产日和原班次统计，交库状态单独显示。')}
        actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/terminal/packaging/dashboard" style={{ ...primaryActionButton, textDecoration: 'none' }}>
            <Monitor size={14} /> {t('ui.进入作业台', '进入作业台')}
          </Link>
          <Link href="/packaging/history" style={{ ...secondaryActionButton, textDecoration: 'none' }}>
            <PackageSearch size={14} /> {t('packaging.report.history', '包装历史')}
          </Link>
        </div>}
      />

      <PackingProductionReport historyPath="/packaging/history" />
    </main>
  );
}
