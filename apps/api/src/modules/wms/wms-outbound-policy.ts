export const WMS_OUTBOUND_TYPES = [
  'SALE',
  'TRANSFER',
  'PRODUCTION_USE',
  'FEED_DISTRIBUTION',
  'MEDICINE_DISTRIBUTION',
  'LOGISTICS_USE',
  'SPARE_PART_USE',
  'OFFICE_USE',
  'MAINTENANCE_USE',
  'SCRAP',
  'RETURN',
  'STOCKTAKE_LOSS',
] as const;

export type WmsOutboundType = typeof WMS_OUTBOUND_TYPES[number];
export type WmsOutboundCategory =
  | 'SALES'
  | 'TRANSFER'
  | 'PRODUCTION'
  | 'FARM_OPERATION'
  | 'LOGISTICS'
  | 'MAINTENANCE'
  | 'ADMINISTRATION'
  | 'DISPOSAL'
  | 'PROCUREMENT_RETURN'
  | 'INVENTORY_ADJUSTMENT';
export type WmsOutboundWorkflow =
  | 'STANDALONE_OUTBOUND'
  | 'SALES_ORDER'
  | 'TRANSFER'
  | 'STOCKTAKE'
  | 'LOSS_APPROVAL';

export interface WmsOutboundTypePolicy {
  type: WmsOutboundType;
  source: string;
  category: WmsOutboundCategory;
  businessType: string;
  ledgerType: string;
  destinations: readonly string[];
  allowedItemTypes: readonly ('MATERIAL' | 'SKU')[];
  materialTypes?: readonly string[];
  managedBy: readonly WmsOutboundWorkflow[];
}

const MATERIAL_ONLY = ['MATERIAL'] as const;
const SKU_ONLY = ['SKU'] as const;
const BOTH_ITEM_TYPES = ['MATERIAL', 'SKU'] as const;

export const WMS_OUTBOUND_TYPE_POLICIES: Readonly<Record<WmsOutboundType, WmsOutboundTypePolicy>> = {
  SALE: {
    type: 'SALE',
    source: 'SALES_ORDER',
    category: 'SALES',
    businessType: 'SALE',
    ledgerType: 'SALE_OUTBOUND',
    destinations: ['CUSTOMER', 'STORE'],
    allowedItemTypes: SKU_ONLY,
    managedBy: ['STANDALONE_OUTBOUND', 'SALES_ORDER'],
  },
  TRANSFER: {
    type: 'TRANSFER',
    source: 'WAREHOUSE_TRANSFER',
    category: 'TRANSFER',
    businessType: 'TRANSFER',
    ledgerType: 'TRANSFER_OUT',
    destinations: ['WAREHOUSE'],
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['TRANSFER'],
  },
  PRODUCTION_USE: {
    type: 'PRODUCTION_USE',
    source: 'PRODUCTION_ORDER',
    category: 'PRODUCTION',
    businessType: 'PRODUCTION_USE',
    ledgerType: 'PRODUCTION_ISSUE',
    destinations: ['HOUSE', 'DEPARTMENT', 'PROJECT'],
    allowedItemTypes: MATERIAL_ONLY,
    managedBy: ['STANDALONE_OUTBOUND'],
  },
  FEED_DISTRIBUTION: {
    type: 'FEED_DISTRIBUTION',
    source: 'FARM_FEED_LEDGER',
    category: 'FARM_OPERATION',
    businessType: 'FEED_DISTRIBUTION',
    ledgerType: 'FEED_ISSUE',
    destinations: ['HOUSE'],
    allowedItemTypes: MATERIAL_ONLY,
    materialTypes: ['FEED_RAW'],
    managedBy: ['STANDALONE_OUTBOUND'],
  },
  MEDICINE_DISTRIBUTION: {
    type: 'MEDICINE_DISTRIBUTION',
    source: 'FARM_MEDICINE_LEDGER',
    category: 'FARM_OPERATION',
    businessType: 'MEDICINE_DISTRIBUTION',
    ledgerType: 'MEDICINE_ISSUE',
    destinations: ['HOUSE'],
    allowedItemTypes: MATERIAL_ONLY,
    materialTypes: ['VET_DRUG'],
    managedBy: ['STANDALONE_OUTBOUND'],
  },
  LOGISTICS_USE: {
    type: 'LOGISTICS_USE',
    source: 'LOGISTICS_REQUISITION',
    category: 'LOGISTICS',
    businessType: 'LOGISTICS_USE',
    ledgerType: 'LOGISTICS_ISSUE',
    destinations: ['DEPARTMENT', 'PROJECT', 'EMPLOYEE'],
    allowedItemTypes: MATERIAL_ONLY,
    managedBy: ['STANDALONE_OUTBOUND'],
  },
  SPARE_PART_USE: {
    type: 'SPARE_PART_USE',
    source: 'SPARE_PART_REQUISITION',
    category: 'MAINTENANCE',
    businessType: 'SPARE_PART_USE',
    ledgerType: 'SPARE_PART_ISSUE',
    destinations: ['DEPARTMENT', 'PROJECT', 'EMPLOYEE'],
    allowedItemTypes: MATERIAL_ONLY,
    materialTypes: ['EQUIPMENT', 'TOOL', 'CONSTRUCTION', 'OTHER'],
    managedBy: ['STANDALONE_OUTBOUND'],
  },
  OFFICE_USE: {
    type: 'OFFICE_USE',
    source: 'OFFICE_REQUISITION',
    category: 'ADMINISTRATION',
    businessType: 'OFFICE_USE',
    ledgerType: 'OFFICE_ISSUE',
    destinations: ['DEPARTMENT', 'EMPLOYEE'],
    allowedItemTypes: MATERIAL_ONLY,
    materialTypes: ['OFFICE'],
    managedBy: ['STANDALONE_OUTBOUND'],
  },
  MAINTENANCE_USE: {
    type: 'MAINTENANCE_USE',
    source: 'MAINTENANCE_WORK_ORDER',
    category: 'MAINTENANCE',
    businessType: 'MAINTENANCE_USE',
    ledgerType: 'MAINTENANCE_ISSUE',
    destinations: ['HOUSE', 'DEPARTMENT', 'PROJECT'],
    allowedItemTypes: MATERIAL_ONLY,
    materialTypes: ['EQUIPMENT', 'TOOL', 'CONSTRUCTION', 'OTHER'],
    managedBy: ['STANDALONE_OUTBOUND'],
  },
  SCRAP: {
    type: 'SCRAP',
    source: 'APPROVED_SCRAP',
    category: 'DISPOSAL',
    businessType: 'SCRAP',
    ledgerType: 'SCRAP_OUTBOUND',
    destinations: ['OTHER'],
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['STANDALONE_OUTBOUND', 'LOSS_APPROVAL'],
  },
  RETURN: {
    type: 'RETURN',
    source: 'PURCHASE_RETURN',
    category: 'PROCUREMENT_RETURN',
    businessType: 'PURCHASE_RETURN',
    ledgerType: 'PURCHASE_RETURN_OUT',
    destinations: ['SUPPLIER'],
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['STANDALONE_OUTBOUND'],
  },
  STOCKTAKE_LOSS: {
    type: 'STOCKTAKE_LOSS',
    source: 'STOCKTAKE',
    category: 'INVENTORY_ADJUSTMENT',
    businessType: 'STOCKTAKE_LOSS',
    ledgerType: 'STOCKTAKE_DOWN',
    destinations: ['OTHER'],
    allowedItemTypes: BOTH_ITEM_TYPES,
    managedBy: ['STOCKTAKE'],
  },
};

export const WMS_ISSUE_OUTBOUND_TYPES = new Set<WmsOutboundType>(
  WMS_OUTBOUND_TYPES.filter(type => [
    'PRODUCTION',
    'FARM_OPERATION',
    'LOGISTICS',
    'MAINTENANCE',
    'ADMINISTRATION',
  ].includes(WMS_OUTBOUND_TYPE_POLICIES[type].category)),
);

export interface WmsOutboundPolicyInput {
  type?: unknown;
  qty?: unknown;
  item?: unknown;
  item_type?: unknown;
  material_type?: unknown;
  warehouse_code?: unknown;
  destination_type?: unknown;
  destination_code?: unknown;
  destination_house_code?: unknown;
  destination_customer_code?: unknown;
  destination_warehouse_code?: unknown;
  destination_store_code?: unknown;
  department_code?: unknown;
  project_code?: unknown;
  receiver_username?: unknown;
}

function value(input: unknown): string {
  return String(input ?? '').trim();
}

export function resolveOutboundPolicy(type: unknown): WmsOutboundTypePolicy | null {
  return WMS_OUTBOUND_TYPE_POLICIES[value(type).toUpperCase() as WmsOutboundType] ?? null;
}

export function isIssueOutboundType(type: unknown): boolean {
  return WMS_ISSUE_OUTBOUND_TYPES.has(value(type).toUpperCase() as WmsOutboundType);
}

export function resolveOutboundLedgerType(type: unknown): string {
  return resolveOutboundPolicy(type)?.ledgerType ?? 'OUTBOUND';
}

export function validateOutboundWorkflow(
  type: unknown,
  workflow: WmsOutboundWorkflow,
): string[] {
  const policy = resolveOutboundPolicy(type);
  if (!policy) return [`不支持的出库类型：${value(type).toUpperCase() || '(空)'}`];
  if (policy.managedBy.includes(workflow)) return [];
  if (policy.category === 'TRANSFER') {
    return ['库存调拨必须通过调拨管理的原子双边事务，不得以独立出库单执行'];
  }
  if (policy.category === 'INVENTORY_ADJUSTMENT') {
    return ['盘亏必须通过盘点审批工作流入账，不得以独立出库单执行'];
  }
  return [`${policy.type} 必须通过 ${policy.managedBy.join(' / ')} 工作流执行`];
}

export function resolveOutboundDestinationCode(input: WmsOutboundPolicyInput): string {
  const destinationType = value(input.destination_type).toUpperCase();
  if (destinationType === 'HOUSE') return value(input.destination_house_code || input.destination_code);
  if (destinationType === 'CUSTOMER') return value(input.destination_customer_code || input.destination_code);
  if (destinationType === 'WAREHOUSE') return value(input.destination_warehouse_code || input.destination_code);
  if (destinationType === 'STORE') return value(input.destination_store_code || input.destination_code);
  if (destinationType === 'DEPARTMENT') return value(input.department_code || input.destination_code);
  if (destinationType === 'PROJECT') return value(input.project_code || input.destination_code);
  if (destinationType === 'EMPLOYEE') return value(input.receiver_username || input.destination_code);
  return value(input.destination_code);
}

export function validateOutboundPolicy(input: WmsOutboundPolicyInput): string[] {
  const errors: string[] = [];
  const type = value(input.type).toUpperCase() as WmsOutboundType;
  const policy = resolveOutboundPolicy(type);
  if (!policy) {
    errors.push(`不支持的出库类型：${type || '(空)'}`);
    return errors;
  }
  errors.push(...validateOutboundWorkflow(type, 'STANDALONE_OUTBOUND'));

  const qty = Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0 || Math.abs(Math.round(qty * 1000) - qty * 1000) > 1e-7) {
    errors.push('出库数量必须大于 0，且最多保留 3 位小数');
  }
  if (!value(input.item)) errors.push('物料或 SKU 必填');

  const destinationType = value(input.destination_type).toUpperCase();
  if (!policy.destinations.includes(destinationType)) {
    errors.push(`${type} 的去向类型必须是 ${policy.destinations.join(' / ')}`);
  } else if (!resolveOutboundDestinationCode(input)) {
    errors.push(`去向为 ${destinationType} 时必须填写对应去向`);
  }

  const itemType = value(input.item_type).toUpperCase();
  const materialType = value(input.material_type).toUpperCase();
  if (itemType && !policy.allowedItemTypes.includes(itemType as 'MATERIAL' | 'SKU')) {
    errors.push(`${type} 只允许 ${policy.allowedItemTypes.join(' / ')} 品目`);
  }
  if (policy.materialTypes && materialType && !policy.materialTypes.includes(materialType)) {
    errors.push(`${type} 不允许领用物料类别 ${materialType}`);
  }

  return errors;
}
