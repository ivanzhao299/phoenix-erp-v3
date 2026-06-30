'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import u from '@/styles/uix-utils.module.css';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ProcurementRootRedirectPage() {
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    router.replace('/procurement2/dashboard');
  }, [router]);

  return <div className={u.emptyCenter}>{t('prc2.entering_center', '正在进入采购中心…')}</div>;
}
