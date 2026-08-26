export const OUTBOUND_DESTINATIONS: Record<string, readonly string[]> = {
  SALE: ['CUSTOMER', 'STORE'],
  PRODUCTION_USE: ['HOUSE', 'DEPARTMENT', 'PROJECT'],
  FEED_DISTRIBUTION: ['HOUSE'],
  MEDICINE_DISTRIBUTION: ['HOUSE'],
  LOGISTICS_USE: ['DEPARTMENT', 'PROJECT', 'EMPLOYEE'],
  SPARE_PART_USE: ['DEPARTMENT', 'PROJECT', 'EMPLOYEE'],
  OFFICE_USE: ['DEPARTMENT', 'EMPLOYEE'],
  MAINTENANCE_USE: ['HOUSE', 'DEPARTMENT', 'PROJECT'],
  SCRAP: ['OTHER'],
  RETURN: ['SUPPLIER'],
};

const MATERIAL_ONLY = new Set([
  'PRODUCTION_USE', 'FEED_DISTRIBUTION', 'MEDICINE_DISTRIBUTION',
  'LOGISTICS_USE', 'SPARE_PART_USE', 'OFFICE_USE', 'MAINTENANCE_USE',
]);

export function validateOutboundQuantity(value: unknown): string | undefined {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0 || Math.abs(Math.round(qty * 1000) - qty * 1000) > 1e-7) {
    return '出库数量必须大于 0，且最多保留 3 位小数';
  }
  return undefined;
}

export function validateOutboundItem(_value: unknown, values: Record<string, unknown>): string | undefined {
  const type = String(values.type ?? '').toUpperCase();
  const itemType = String(values.item_type ?? '').toUpperCase();
  if (MATERIAL_ONLY.has(type) && itemType && itemType !== 'MATERIAL') {
    return `${type} 只允许领用物料，不能选择产成品 SKU`;
  }
  if (type === 'SALE' && itemType && itemType !== 'SKU') {
    return '销售出库只允许选择产成品 SKU';
  }
  return undefined;
}
