'use client';

import { WarehouseSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { useLanguage } from '@/contexts/LanguageContext';

export function PermissionWarehouse({ value, onChange, disabled }: {
  value: string; onChange: (code:string)=>void; disabled?: boolean;
}) {
  const { t } = useLanguage();
  const label = t('eggSources.permission.warehouse','蛋品来源目标仓范围');
  return <WarehouseSelector value={value} onChange={onChange} ariaLabel={label}
    placeholder={label} disabled={disabled} preserveValue/>;
}
