import { createHash } from 'node:crypto';

export const MAPPING_TYPES = ['DEPARTMENT', 'CASH_ACCOUNT', 'WAREHOUSE', 'PRODUCT', 'UOM'];

export function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['data', 'result', 'rows', 'items', 'list', 'entities', 'mappings']) {
    if (Array.isArray(value[key])) return value[key];
    const nested = rowsOf(value[key]);
    if (nested.length) return nested;
  }
  return [];
}

export function closureBatch(item) {
  if (item.disposition === 'NO_ERP_MASTER_REQUIRED') return 'B0_INTENTIONAL_NON_MAPPING';
  if (item.disposition === 'CHANJET_CHANGE_PROPOSAL') return 'B1_CHANJET_ONE_ROW_CANARY';
  if (item.disposition === 'ERP_AUTO_APPLY_ELIGIBLE') return 'B2_ERP_LOW_RISK_MASTER';
  if (item.disposition === 'CROSS_SYSTEM_REVIEW_REQUIRED') return 'B7_BUSINESS_OWNER_REVIEW';
  if (item.disposition === 'KEEP_HOLD') return 'B8_EVIDENCE_COLLECTION';
  if (item.mappingType === 'DEPARTMENT') return 'B3_ORGANIZATION_POLICY';
  if (item.mappingType === 'WAREHOUSE') return 'B4_LOCATION_POLICY';
  if (item.mappingType === 'UOM') return 'B5_PRODUCT_UOM_POLICY';
  if (item.mappingType === 'PRODUCT') return 'B6_PRODUCT_DOMAIN_POLICY';
  return 'B8_EVIDENCE_COLLECTION';
}

export function publicUserSummary(user, orgBindings) {
  const id = String(user.id ?? user.userId ?? user.user_id ?? '');
  const username = String(user.username ?? '');
  const identityHash = createHash('sha256').update(`${id}:${username}`).digest('hex').slice(0, 16);
  return {
    identityHash,
    status: String(user.status ?? ''),
    orgBindingCount: orgBindings.length,
    hasOrgBinding: orgBindings.length > 0,
  };
}

export function summarizeBy(items, key) {
  return items.reduce((summary, item) => {
    const value = String(item[key] || 'UNKNOWN');
    summary[value] = (summary[value] || 0) + 1;
    return summary;
  }, {});
}
