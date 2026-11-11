export interface CommercialOrderItemState {
  productCode: string;
  gradeCode: string;
  qty: string;
  actualUnitPrice: string;
  skuCode?: string;
  quantityBasis?: 'BASE' | 'PACKAGE';
  _unit?: unknown;
  _resolved?: unknown;
  _manualPrice?: boolean;
  _managed?: boolean;
  _quoteError?: string;
}

/** Company changes invalidate every warehouse/SKU-dependent selection and quote. */
export function resetItemsForCompanyChange<T extends CommercialOrderItemState>(items: T[]): T[] {
  return items.map(() => ({ productCode: '', gradeCode: '', qty: '', actualUnitPrice: '' } as T));
}

export function isManagedCommercialSku(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const value = raw as Record<string, unknown>;
  return value.readonlyFlag === true || value.readonly_flag === true
    || value.varietyCode != null || value.variety_code != null
    || value.orgContextRequired === true || value.org_context_required === true;
}

export function managedItemNeedsQuote(item: CommercialOrderItemState): boolean {
  return Boolean(item._managed && (!item._resolved || item.actualUnitPrice === ''));
}
