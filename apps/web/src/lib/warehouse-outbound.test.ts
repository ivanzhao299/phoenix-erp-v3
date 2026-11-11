import { describe, expect, it } from 'vitest';
import {
  ISSUE_OUTBOUND_TYPES,
  constrainOutboundBatchLine,
  validateOutboundBatch,
  resetOutboundDestination,
  OUTBOUND_DESTINATIONS,
  STANDALONE_OUTBOUND_TYPES,
  canCreateOutboundType,
  isStandaloneOutboundType,
  validateOutboundDestination,
  validateOutboundItem,
  validateOutboundQuantity,
} from './warehouse-outbound';

describe('warehouse outbound form policy', () => {
  it('keeps outbound and issue destinations aligned with the backend policy', () => {
    expect(OUTBOUND_DESTINATIONS.SALE).toEqual(['CUSTOMER', 'STORE']);
    expect(OUTBOUND_DESTINATIONS.TRANSFER).toEqual(['WAREHOUSE']);
    expect(OUTBOUND_DESTINATIONS.STOCKTAKE_LOSS).toEqual(['OTHER']);
    expect(OUTBOUND_DESTINATIONS.PRODUCTION_USE).toEqual(['HOUSE', 'DEPARTMENT', 'PROJECT']);
    expect(OUTBOUND_DESTINATIONS.OFFICE_USE).toEqual(['DEPARTMENT', 'EMPLOYEE']);
    expect(OUTBOUND_DESTINATIONS.RETURN).toEqual(['SUPPLIER']);
  });

  it('exposes every standalone type while keeping transfer on its atomic workflow', () => {
    expect(STANDALONE_OUTBOUND_TYPES).toEqual([
      'SALE', 'PRODUCTION_USE', 'FEED_DISTRIBUTION', 'MEDICINE_DISTRIBUTION',
      'LOGISTICS_USE', 'SPARE_PART_USE', 'OFFICE_USE', 'MAINTENANCE_USE', 'SCRAP', 'RETURN',
    ]);
    expect(ISSUE_OUTBOUND_TYPES).toEqual([
      'PRODUCTION_USE', 'FEED_DISTRIBUTION', 'MEDICINE_DISTRIBUTION',
      'LOGISTICS_USE', 'SPARE_PART_USE', 'OFFICE_USE', 'MAINTENANCE_USE',
    ]);
    expect(isStandaloneOutboundType('RETURN')).toBe(true);
    expect(isStandaloneOutboundType('TRANSFER')).toBe(false);
    expect(isStandaloneOutboundType('STOCKTAKE_LOSS')).toBe(false);
  });

  it('keeps create permissions separated between ordinary and issue menus', () => {
    expect(canCreateOutboundType('SALE', { inout: true, issue: false })).toBe(true);
    expect(canCreateOutboundType('PRODUCTION_USE', { inout: true, issue: false })).toBe(false);
    expect(canCreateOutboundType('PRODUCTION_USE', { inout: false, issue: true })).toBe(true);
    expect(canCreateOutboundType('PRODUCTION_USE', { inout: true, issue: true, issueOnly: true })).toBe(true);
    expect(canCreateOutboundType('SALE', { inout: true, issue: true, issueOnly: true })).toBe(false);
    expect(canCreateOutboundType('TRANSFER', { inout: true, issue: true })).toBe(false);
  });

  it('rejects destination combinations outside the type contract', () => {
    expect(validateOutboundDestination('TRANSFER', 'WAREHOUSE')).toBeUndefined();
    expect(validateOutboundDestination('TRANSFER', 'HOUSE')).toContain('WAREHOUSE');
    expect(validateOutboundDestination('SALE', 'SUPPLIER')).toContain('CUSTOMER / STORE');
    expect(validateOutboundDestination('UNKNOWN', 'OTHER')).toContain('不支持的出库类型');
  });

  it('rejects invalid quantities before the request is sent', () => {
    expect(validateOutboundQuantity(0)).toContain('必须大于 0');
    expect(validateOutboundQuantity(1.2345)).toContain('最多保留 3 位');
    expect(validateOutboundQuantity(1.234)).toBeUndefined();
  });

  it('rejects SKU issue and material sale selections before submit', () => {
    expect(validateOutboundItem('SKU-1', { type: 'PRODUCTION_USE', item_type: 'SKU' })).toContain('只允许领用物料');
    expect(validateOutboundItem('MAT-1', { type: 'SALE', item_type: 'MATERIAL' })).toContain('产成品 SKU');
  });
});

it('clears hidden recipient values when the type or destination changes', () => {
  const sale = { type: 'RETURN', destination_type: 'CUSTOMER', destination_customer_code: 'CUST-A', destination_code: 'stale' };
  expect(resetOutboundDestination(sale, 'type')).toMatchObject({ destination_type: 'SUPPLIER', destination_customer_code: '', destination_code: '' });
  expect(resetOutboundDestination({ type: 'SALE', destination_type: 'STORE', destination_customer_code: 'CUST-A' }, 'destination_type')).toMatchObject({ destination_type: 'STORE', destination_customer_code: '' });
  expect(resetOutboundDestination(sale, 'qty')).toBe(sale);
});

describe('outbound batch policy', () => {
  const permissions = { inout: true, issue: true };
  const header = { type: 'SALE', destination_type: 'CUSTOMER', destination_code: 'C-1', warehouse_code: 'WH-1', date: '2026-11-11' };
  const lines = [1, 2, 3].map(i => ({ _key: String(i), item: `SKU-${i}`, item_type: 'SKU', item_name: `Egg ${i}`, sku_code: `SKU-${i}`, product_code: 'P-1', batch_no: `B-${i}`, unit: '枚', qty: '2', quantityBasis: 'BASE' }));

  it('clears all incompatible identities on every line, including newly added/picked lines', () => {
    const issue = resetOutboundDestination({ ...header, type: 'PRODUCTION_USE', destination_name: 'Customer', destination_customer_code: 'C-1' }, 'type');
    expect(issue).toMatchObject({ destination_type: 'HOUSE', destination_code: '', destination_name: '', destination_customer_code: '' });
    const constrained = lines.map(line => constrainOutboundBatchLine(line, issue));
    for (const [index, line] of constrained.entries()) {
      expect(line).toMatchObject({ _key: String(index + 1), qty: '2', item: '', item_type: '', item_name: '', sku_code: '', product_code: '', batch_no: '', unit: '', quantityBasis: undefined });
    }
    expect(validateOutboundBatch({ ...issue, destination_code: 'H-1' }, constrained, permissions)).toContain('第 1 行');
    // A newly added line cannot bypass the current type's policy by picking SKU.
    expect(constrainOutboundBatchLine({ ...lines[0], _key: 'new' }, issue).item).toBe('');
    const materials = constrained.map((line, i) => constrainOutboundBatchLine({ ...line, item: `M-${i}`, item_type: 'MATERIAL', material_code: `M-${i}` }, issue));
    expect(materials.every(line => !!line.item)).toBe(true);
    expect(validateOutboundBatch({ ...issue, destination_code: 'H-1' }, materials, permissions)).toBeUndefined();
    expect(materials.map(line => constrainOutboundBatchLine(line, header)).every(line => line.item === '' && line.material_code === '')).toBe(true);
  });

  it('checks every row, finite quantities and required master-data identity before submit', () => {
    expect(validateOutboundBatch(header, lines, permissions)).toBeUndefined();
    for (const bad of [{ item_type: 'MATERIAL' }, { qty: 'NaN' }, { qty: 'Infinity' }, { qty: '0' }, { qty: '1.2345' }, { item_type: '' }]) {
      expect(validateOutboundBatch(header, [lines[0], { ...lines[1], ...bad }], permissions)).toContain('第 2 行');
    }
    expect(validateOutboundBatch({ ...header, destination_code: '' }, lines, permissions)).toContain('去向');
    expect(validateOutboundBatch({ ...header, destination_type: 'SUPPLIER' }, lines, permissions)).toContain('CUSTOMER / STORE');
  });

  it('rejects dedicated workflow types and unauthorized types even with valid rows/destinations', () => {
    for (const type of ['TRANSFER', 'STOCKTAKE_LOSS', 'UNKNOWN']) {
      expect(validateOutboundBatch({ ...header, type, destination_type: OUTBOUND_DESTINATIONS[type]?.[0] }, lines, permissions)).toContain('专用业务流程');
    }
    expect(validateOutboundBatch(header, lines, { inout: false, issue: true })).toContain('没有创建权限');
    expect(validateOutboundBatch(header, lines, { ...permissions, issueOnly: true })).toContain('没有创建权限');
    expect(validateOutboundBatch({ ...header, type: 'PRODUCTION_USE', destination_type: 'HOUSE' }, lines, { inout: true, issue: false })).toContain('没有创建权限');
  });

  it('reuses destination policy for every standalone type and clears every hidden recipient', () => {
    for (const type of STANDALONE_OUTBOUND_TYPES) {
      const next = resetOutboundDestination({ ...header, type, destination_type: 'INVALID', destination_code: 'stale', destination_name: 'stale', destination_house_code: 'stale', department_code: 'stale', project_code: 'stale', receiver_username: 'stale' }, 'type');
      expect(next.destination_type).toBe(OUTBOUND_DESTINATIONS[type][0]);
      expect(validateOutboundDestination(type, next.destination_type)).toBeUndefined();
      expect(next).toMatchObject({ destination_code: '', destination_name: '', destination_house_code: '', department_code: '', project_code: '', receiver_username: '' });
    }
    // Even two types sharing HOUSE must discard the previous recipient.
    expect(resetOutboundDestination({ ...header, type: 'FEED_DISTRIBUTION', destination_type: 'HOUSE', destination_code: 'H-old' }, 'type')).toMatchObject({ destination_type: 'HOUSE', destination_code: '' });
  });
});
