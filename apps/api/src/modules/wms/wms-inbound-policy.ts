export const WMS_INBOUND_TYPES = [
  'PURCHASE',
  'PRODUCTION',
  'TRANSFER',
  'TRANSFER_RECEIVE',
  'RETURN',
  'SALES_RETURN',
  'ADJUSTMENT',
  'STOCKTAKE_GAIN',
  'OPENING',
] as const;

export type WmsInboundType = typeof WMS_INBOUND_TYPES[number];
export type WmsInboundCategory =
  | 'PROCUREMENT'
  | 'PRODUCTION'
  | 'TRANSFER'
  | 'SALES_RETURN'
  | 'INVENTORY_ADJUSTMENT'
  | 'OPENING_BALANCE';
export type WmsInboundWorkflow =
  | 'GENERIC_INBOUND'
  | 'PURCHASE_RECEIPT'
  | 'TRANSFER'
  | 'STOCKTAKE'
  | 'OPENING_IMPORT';

export interface WmsInboundTypePolicy {
  type: WmsInboundType;
  source: string;
  category: WmsInboundCategory;
  businessType: string;
  ledgerType: string;
  allowedItemTypes: readonly ('MATERIAL' | 'SKU')[];
  managedBy: readonly WmsInboundWorkflow[];
}

const BOTH_ITEM_TYPES = ['MATERIAL', 'SKU'] as const;

export const WMS_INBOUND_TYPE_POLICIES: Readonly<Record<WmsInboundType, WmsInboundTypePolicy>> = {
  PURCHASE: {
    type: 'PURCHASE',
    source: 'PURCHASE_RECEIPT',
    category: 'PROCUREMENT',
    businessType: 'PURCHASE',
    ledgerType: 'PURCHASE_INBOUND',
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['GENERIC_INBOUND', 'PURCHASE_RECEIPT'],
  },
  PRODUCTION: {
    type: 'PRODUCTION',
    source: 'PRODUCTION_COMPLETION',
    category: 'PRODUCTION',
    businessType: 'PRODUCTION',
    ledgerType: 'PRODUCTION_INBOUND',
    allowedItemTypes: ['SKU'],
    managedBy: ['GENERIC_INBOUND'],
  },
  TRANSFER: {
    type: 'TRANSFER',
    source: 'WAREHOUSE_TRANSFER',
    category: 'TRANSFER',
    businessType: 'TRANSFER',
    ledgerType: 'TRANSFER_IN',
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['TRANSFER'],
  },
  TRANSFER_RECEIVE: {
    type: 'TRANSFER_RECEIVE',
    source: 'WAREHOUSE_TRANSFER',
    category: 'TRANSFER',
    businessType: 'TRANSFER',
    ledgerType: 'TRANSFER_IN',
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['TRANSFER'],
  },
  RETURN: {
    type: 'RETURN',
    source: 'SALES_RETURN',
    category: 'SALES_RETURN',
    businessType: 'SALES_RETURN',
    ledgerType: 'SALES_RETURN_INBOUND',
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['GENERIC_INBOUND'],
  },
  SALES_RETURN: {
    type: 'SALES_RETURN',
    source: 'SALES_RETURN',
    category: 'SALES_RETURN',
    businessType: 'SALES_RETURN',
    ledgerType: 'SALES_RETURN_INBOUND',
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['GENERIC_INBOUND'],
  },
  ADJUSTMENT: {
    type: 'ADJUSTMENT',
    source: 'STOCKTAKE',
    category: 'INVENTORY_ADJUSTMENT',
    businessType: 'STOCKTAKE_GAIN',
    ledgerType: 'STOCKTAKE_UP',
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['STOCKTAKE'],
  },
  STOCKTAKE_GAIN: {
    type: 'STOCKTAKE_GAIN',
    source: 'STOCKTAKE',
    category: 'INVENTORY_ADJUSTMENT',
    businessType: 'STOCKTAKE_GAIN',
    ledgerType: 'STOCKTAKE_UP',
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['STOCKTAKE'],
  },
  OPENING: {
    type: 'OPENING',
    source: 'APPROVED_OPENING_IMPORT',
    category: 'OPENING_BALANCE',
    businessType: 'OPENING',
    ledgerType: 'OPENING_INBOUND',
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['GENERIC_INBOUND', 'OPENING_IMPORT'],
  },
};

export interface WmsInboundPolicyInput {
  type?: unknown;
  item_type?: unknown;
}

function value(input: unknown): string {
  return String(input ?? '').trim().toUpperCase();
}

export function resolveInboundPolicy(type: unknown): WmsInboundTypePolicy | null {
  return WMS_INBOUND_TYPE_POLICIES[value(type) as WmsInboundType] ?? null;
}

export function resolveInboundLedgerType(type: unknown): string {
  return resolveInboundPolicy(type)?.ledgerType ?? 'INBOUND';
}

export function validateInboundWorkflow(
  type: unknown,
  workflow: WmsInboundWorkflow,
): string[] {
  const policy = resolveInboundPolicy(type);
  if (!policy) return [`不支持的入库类型：${value(type) || '(空)'}`];
  if (policy.managedBy.includes(workflow)) return [];
  if (policy.category === 'TRANSFER') {
    return ['库存调拨必须通过调拨管理的原子双边事务，不得以独立入库单执行'];
  }
  if (policy.category === 'INVENTORY_ADJUSTMENT') {
    return ['盘盈必须通过盘点审批工作流入账，不得以独立入库单执行'];
  }
  return [`${policy.type} 必须通过 ${policy.managedBy.join(' / ')} 工作流执行`];
}

/**
 * 入库来源决定库存品目边界：
 * - 采购可收原材料、低值物料，也可收外购产成品 SKU；
 * - 生产完工只能把已建档的产成品/半成品 SKU 转入仓库；
 * - 调拨接收、销售退货、盘盈和期初必须沿用既有库存品目身份。
 */
export function validateInboundPolicy(input: WmsInboundPolicyInput): string[] {
  const errors: string[] = [];
  const type = value(input.type) as WmsInboundType;
  const itemType = value(input.item_type) as 'MATERIAL' | 'SKU';
  const policy = resolveInboundPolicy(type);

  if (!policy) {
    errors.push(`不支持的入库类型：${type || '(空)'}`);
    return errors;
  }
  if (!policy.allowedItemTypes.includes(itemType)) {
    if (!['MATERIAL', 'SKU'].includes(itemType)) {
      errors.push('入库品目必须来自物料主数据或产成品 SKU');
    } else {
      errors.push(`${type} 只允许 ${policy.allowedItemTypes.join(' / ')} 品目`);
    }
  }

  return errors;
}
