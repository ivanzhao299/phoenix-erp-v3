export const WMS_INBOUND_TYPES = [
  'PURCHASE',
  'PRODUCTION',
  'TRANSFER',
  'TRANSFER_RECEIVE',
  'RETURN',
  'ADJUSTMENT',
  'OPENING',
] as const;

export type WmsInboundType = typeof WMS_INBOUND_TYPES[number];

export interface WmsInboundPolicyInput {
  type?: unknown;
  item_type?: unknown;
}

function value(input: unknown): string {
  return String(input ?? '').trim().toUpperCase();
}

/**
 * 入库来源决定库存品目边界：
 * - 采购可收原材料、低值物料，也可收外购产成品 SKU；
 * - 生产完工只能把已建档的产成品/半成品 SKU 转入仓库；
 * - 调拨接收、退货、盘盈和期初必须沿用既有库存品目身份。
 */
export function validateInboundPolicy(input: WmsInboundPolicyInput): string[] {
  const errors: string[] = [];
  const type = value(input.type) as WmsInboundType;
  const itemType = value(input.item_type);

  if (!WMS_INBOUND_TYPES.includes(type)) {
    errors.push(`不支持的入库类型：${type || '(空)'}`);
    return errors;
  }
  if (!['MATERIAL', 'SKU'].includes(itemType)) {
    errors.push('入库品目必须来自物料主数据或产成品 SKU');
    return errors;
  }
  if (type === 'PRODUCTION' && itemType !== 'SKU') {
    errors.push('生产入库只能选择已建档的产成品或半成品 SKU');
  }

  return errors;
}
