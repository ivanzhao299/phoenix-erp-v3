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

export type OutboundCreatePermissions = { inout: boolean; issue: boolean; issueOnly?: boolean };

export function canCreateOutboundType(
  type: unknown,
  permissions: OutboundCreatePermissions,
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
  if (!allowed) return `不支持的出库类型：${normalizedType || '(empty)'}`;
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

/** Changing the business type/destination must not retain a hidden recipient. */
export function resetOutboundDestination(values: Record<string, unknown>, changedField: string): Record<string, unknown> {
  if (changedField !== 'type' && changedField !== 'destination_type') return values;
  const allowed = OUTBOUND_DESTINATIONS[String(values.type)] ?? [];
  const destination = allowed.includes(String(values.destination_type)) ? values.destination_type : (allowed[0] ?? '');
  return { ...values, destination_type: destination,
    destination_house_code: '', destination_customer_code: '', destination_warehouse_code: '',
    destination_store_code: '', department_code: '', project_code: '', receiver_username: '', destination_code: '',
    destination_name: '', destination_house_name: '', destination_customer_name: '', destination_warehouse_name: '',
    destination_store_name: '', department_name: '', project_name: '', receiver_name: '',
  };
}

/** Apply the same item policy to every existing, newly added or picked batch line. */
export function constrainOutboundBatchLine<T extends Record<string, unknown>>(line: T, header: Record<string, unknown>): T {
  if (!validateOutboundItem(line.item, { ...line, type: header.type })) return line;
  return { ...line, item: '', item_name: '', item_type: '', material_type: '', material_code: '',
    sku_code: '', product_code: '', spec_code: '', grade_code: '', unit: '', batch_no: '', quantityBasis: undefined };
}

/** Frontend guard only: dictionary options still come from SYS dictionary data. */
export function validateOutboundBatch(
  header: Record<string, unknown>,
  items: readonly Record<string, unknown>[],
  permissions: OutboundCreatePermissions,
): string | undefined {
  if (!canCreateOutboundType(header.type, permissions)) return '该类型必须通过专用业务流程或没有创建权限';
  const destinationError = validateOutboundDestination(header.type, header.destination_type);
  if (destinationError) return destinationError;
  if (!header.date || !header.warehouse_code) return '请选择出库日期和出库仓库';
  if (!String(header.destination_code ?? '').trim()) return '请选择或填写去向';
  if (!items.length) return '请添加出库明细';
  for (const [index, line] of items.entries()) {
    const error = !line.item || !line.item_type ? '请选择库存主档品目' :
      validateOutboundItem(line.item, { ...line, type: header.type }) || validateOutboundQuantity(line.qty);
    if (error) return `第 ${index + 1} 行：${error}`;
  }
  return undefined;
}
