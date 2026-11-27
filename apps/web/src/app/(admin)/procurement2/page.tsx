'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import u from '@/styles/uix-utils.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { resolveProcurementCenterHref } from '@/lib/home-navigation';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ProcurementRootRedirectPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { loading, hasPermission } = useAuth();

  useEffect(() => {
    if (loading) return;
    const path = resolveProcurementCenterHref(hasPermission, () => {
      const entries = [
        ['REQUEST', 'requests'], ['ORDER', 'orders'], ['SHIPMENT', 'shipments'],
        ['RECEIPT', 'receipts'], ['PAYMENT', 'payments'], ['SUPPLIER', 'suppliers'],
        ['PROJECT', 'projects'], ['FUND', 'shareholder-funds'], ['INIT', 'init'],
      ];
      const entry = entries.find(([menu]) => hasPermission(`MENU_PRC2_${menu}`, 'V'));
      return entry ? `/procurement2/${entry[1]}` : undefined;
    });
    router.replace(path ?? '/');
  }, [router, loading, hasPermission]);

  return <div className={u.emptyCenter}>{t('prc2.entering_center', '正在进入采购中心…')}</div>;
}
