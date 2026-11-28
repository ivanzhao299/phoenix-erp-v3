'use client';

import PageHeader from '@/components/PageHeader';
import PackingProductionReport from '@/components/packaging/PackingProductionReport';
import { useLanguage } from '@/contexts/LanguageContext';

export default function PackagingDailyReportPage() {
  const { t } = useLanguage();

  return (
    <main style={{ padding: '0 20px 24px', height: '100%', overflowY: 'auto' }}>
      <PageHeader
        title={t('ui.包装日报', '包装日报')}
        subtitle={t('packaging.report.instructions', '按包装原单的生产日和原班次统计，交库状态单独显示。')}
        breadcrumb={[t('ui.包装中心', '包装中心'), t('ui.包装日报', '包装日报')]}
      />
      <PackingProductionReport historyPath="/packaging/history" />
    </main>
  );
}
