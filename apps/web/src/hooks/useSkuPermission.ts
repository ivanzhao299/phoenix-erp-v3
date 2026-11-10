'use client';
import { usePermission } from './usePermission';

/** Mirrors the server's explicit legacy SKU mapping; viewing never grants creation. */
export function useSkuPermission() {
  const current = usePermission('MENU_MD_SKU');
  const legacy = usePermission('MENU_MASTER_SKU');
  return {
    canView: current.canView || legacy.canView,
    canCreate: current.canCreate || legacy.canEdit,
    canEdit: current.canEdit || legacy.canEdit,
  };
}
