'use client';

import { useState } from 'react';
import { StoreMembershipSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { T } from '@/styles/terminal-theme';
import { useLanguage } from '@/contexts/LanguageContext';

export default function TerminalStorePosEntryPage() {
  const [storeCode, setStoreCode] = useState('');
  const { t } = useLanguage();
  return <main style={{ padding: 32, color: T.TXT }}>
    <h1 style={{ marginTop: 0 }}>{t('ui.门店收银','门店收银')}</h1>
    <p style={{ color: T.MUT }}>{t('ui.V1-1门店收银入口说明','V1-1 仅提供受 membership 约束的入口。购物车、支付与库存成交将在后续阶段开放。')}</p>
    <div style={{ maxWidth: 480 }}>
      <StoreMembershipSelector value={storeCode} onChange={setStoreCode} />
    </div>
  </main>;
}
