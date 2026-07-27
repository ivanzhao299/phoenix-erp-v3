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
] as const;

export type WmsOutboundType = typeof WMS_OUTBOUND_TYPES[number];

export const WMS_ISSUE_OUTBOUND_TYPES = new Set<WmsOutboundType>([
  'PRODUCTION_USE',
  'FEED_DISTRIBUTION',
  'MEDICINE_DISTRIBUTION',
  'LOGISTICS_USE',
  'SPARE_PART_USE',
  'OFFICE_USE',
  'MAINTENANCE_USE',
]);

const TYPE_POLICIES: Record<WmsOutboundType, {
  ledgerType: string;
  destinations: string[];
  materialTypes?: string[];
}> = {
  SALE: {
    ledgerType: 'SALE_OUTBOUND',
    destinations: ['CUSTOMER', 'STORE'],
  },
  TRANSFER: {
    ledgerType: 'TRANSFER_OUT',
    destinations: ['WAREHOUSE'],
  },
  PRODUCTION_USE: {
    ledgerType: 'PRODUCTION_ISSUE',
    destinations: ['HOUSE', 'DEPARTMENT', 'PROJECT'],
  },
  FEED_DISTRIBUTION: {
    ledgerType: 'FEED_ISSUE',
    destinations: ['HOUSE'],
    materialTypes: ['FEED_RAW'],
  },
  MEDICINE_DISTRIBUTION: {
    ledgerType: 'MEDICINE_ISSUE',
    destinations: ['HOUSE'],
    materialTypes: ['VET_DRUG'],
  },
  LOGISTICS_USE: {
    ledgerType: 'LOGISTICS_ISSUE',
    destinations: ['DEPARTMENT', 'PROJECT', 'EMPLOYEE'],
  },
  SPARE_PART_USE: {
    ledgerType: 'SPARE_PART_ISSUE',
    destinations: ['DEPARTMENT', 'PROJECT', 'EMPLOYEE'],
    materialTypes: ['EQUIPMENT', 'TOOL', 'CONSTRUCTION', 'OTHER'],
  },
  OFFICE_USE: {
    ledgerType: 'OFFICE_ISSUE',
    destinations: ['DEPARTMENT', 'EMPLOYEE'],
    materialTypes: ['OFFICE'],
  },
  MAINTENANCE_USE: {
    ledgerType: 'MAINTENANCE_ISSUE',
    destinations: ['HOUSE', 'DEPARTMENT', 'PROJECT'],
    materialTypes: ['EQUIPMENT', 'TOOL', 'CONSTRUCTION', 'OTHER'],
  },
  SCRAP: {
    ledgerType: 'SCRAP_OUTBOUND',
    destinations: ['OTHER'],
  },
  RETURN: {
    ledgerType: 'PURCHASE_RETURN_OUT',
    destinations: ['SUPPLIER'],
  },
};

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

export function isIssueOutboundType(type: unknown): boolean {
  return WMS_ISSUE_OUTBOUND_TYPES.has(value(type).toUpperCase() as WmsOutboundType);
}

export function resolveOutboundLedgerType(type: unknown): string {
  const normalized = value(type).toUpperCase() as WmsOutboundType;
  return TYPE_POLICIES[normalized]?.ledgerType ?? 'OUTBOUND';
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
  const policy = TYPE_POLICIES[type];
  if (!policy) {
    errors.push(`不支持的出库类型：${type || '(空)'}`);
    return errors;
  }
  if (type === 'TRANSFER') {
    errors.push('库存调拨必须通过调拨管理的原子双边事务，不得以独立出库单执行');
  }

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
  if (
    type === 'TRANSFER'
    && destinationType === 'WAREHOUSE'
    && value(input.destination_warehouse_code) === value(input.warehouse_code)
  ) {
    errors.push('调拨出库的调入仓库不能与出库仓库相同');
  }

  const itemType = value(input.item_type).toUpperCase();
  const materialType = value(input.material_type).toUpperCase();
  if (policy.materialTypes && itemType && itemType !== 'MATERIAL') {
    errors.push(`${type} 只能领用物料主数据，不能领用产成品 SKU`);
  }
  if (policy.materialTypes && materialType && !policy.materialTypes.includes(materialType)) {
    errors.push(`${type} 不允许领用物料类别 ${materialType}`);
  }
  if (type === 'SALE' && itemType && itemType !== 'SKU') {
    errors.push('销售出库只能选择可销售产成品 SKU');
  }

  return errors;
}
