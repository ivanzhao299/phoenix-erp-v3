/**
 * Destination contract mirrored from the WMS outbound policy.
 * TRANSFER is included for filtering/validation parity, but is intentionally
 * handled by the atomic transfer workflow rather than standalone outbounds.
 */
export const OUTBOUND_DESTINATIONS: Record<string, readonly string[]> = {
  SALE: ['CUSTOMER', 'STORE'],
  TRANSFER: ['WAREHOUSE'],
  PRODUCTION_USE: ['HOUSE', 'DEPARTMENT', 'PROJECT'],
  FEED_DISTRIBUTION: ['HOUSE'],
  MEDICINE_DISTRIBUTION: ['HOUSE'],
  LOGISTICS_USE: ['DEPARTMENT', 'PROJECT', 'EMPLOYEE'],
  SPARE_PART_USE: ['DEPARTMENT', 'PROJECT', 'EMPLOYEE'],
  OFFICE_USE: ['DEPARTMENT', 'EMPLOYEE'],
  MAINTENANCE_USE: ['HOUSE', 'DEPARTMENT', 'PROJECT'],
  SCRAP: ['OTHER'],
  RETURN: ['SUPPLIER'],
  // Dedicated stocktake workflow; never exposed by the standalone form.
  STOCKTAKE_LOSS: ['OTHER'],
};

/** Types registered in INV_OUTBOUND_TYPE and accepted by standalone create. */
export const STANDALONE_OUTBOUND_TYPES = [
  'SALE',
  'PRODUCTION_USE',
  'FEED_DISTRIBUTION',
  'MEDICINE_DISTRIBUTION',
  'LOGISTICS_USE',
  'SPARE_PART_USE',
  'OFFICE_USE',
  'MAINTENANCE_USE',
  'SCRAP',
  'RETURN',
] as const;

/** Internal issue types retain their dedicated MENU_WMS_ISSUE entry point. */
export const ISSUE_OUTBOUND_TYPES = [
  'PRODUCTION_USE',
  'FEED_DISTRIBUTION',
  'MEDICINE_DISTRIBUTION',
  'LOGISTICS_USE',
  'SPARE_PART_USE',
  'OFFICE_USE',
  'MAINTENANCE_USE',
] as const;

export function isStandaloneOutboundType(type: unknown): boolean {
  return (STANDALONE_OUTBOUND_TYPES as readonly string[]).includes(String(type ?? '').trim().toUpperCase());
}

export function canCreateOutboundType(
  type: unknown,
  permissions: { inout: boolean; issue: boolean; issueOnly?: boolean },
): boolean {
  const normalizedType = String(type ?? '').trim().toUpperCase();
  if (!isStandaloneOutboundType(normalizedType)) return false;
  if ((permissions.issueOnly ?? false) && !(ISSUE_OUTBOUND_TYPES as readonly string[]).includes(normalizedType)) {
    return false;
  }
  return (ISSUE_OUTBOUND_TYPES as readonly string[]).includes(normalizedType)
    ? permissions.issue
    : permissions.inout;
}

export function validateOutboundDestination(type: unknown, destinationType: unknown): string | undefined {
  const normalizedType = String(type ?? '').trim().toUpperCase();
  const normalizedDestination = String(destinationType ?? '').trim().toUpperCase();
  const allowed = OUTBOUND_DESTINATIONS[normalizedType];
  if (!allowed) return `不支持的出库类型：${normalizedType || '(空)'}`;
  if (!allowed.includes(normalizedDestination)) {
    return `${normalizedType} 的去向类型必须是 ${allowed.join(' / ')}`;
  }
  return undefined;
}

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
