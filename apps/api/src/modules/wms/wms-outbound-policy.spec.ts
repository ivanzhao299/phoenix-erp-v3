import {
  WMS_OUTBOUND_TYPES,
  isIssueOutboundType,
  resolveOutboundDestinationCode,
  resolveOutboundLedgerType,
  resolveOutboundPolicy,
  validateOutboundWorkflow,
  validateOutboundPolicy,
} from './wms-outbound-policy';

describe('WMS outbound policy', () => {
  it('defines source, category, ledger and managed workflow for every outbound type', () => {
    for (const type of WMS_OUTBOUND_TYPES) {
      expect(resolveOutboundPolicy(type)).toEqual(expect.objectContaining({
        type,
        source: expect.any(String),
        category: expect.any(String),
        businessType: expect.any(String),
        ledgerType: expect.any(String),
        destinations: expect.any(Array),
        allowedItemTypes: expect.any(Array),
        managedBy: expect.any(Array),
      }));
    }
  });

  it('classifies production and logistics consumption as issue outbound', () => {
    expect(isIssueOutboundType('PRODUCTION_USE')).toBe(true);
    expect(isIssueOutboundType('LOGISTICS_USE')).toBe(true);
    expect(isIssueOutboundType('SALE')).toBe(false);
    expect(resolveOutboundLedgerType('SPARE_PART_USE')).toBe('SPARE_PART_ISSUE');
  });

  it('accepts fractional feed issue quantities and resolves the house destination', () => {
    const input = {
      type: 'FEED_DISTRIBUTION',
      qty: 125.5,
      item: 'MAT-FEED-001',
      item_type: 'MATERIAL',
      material_type: 'FEED_RAW',
      destination_type: 'HOUSE',
      destination_house_code: 'HOUSE-MS-01',
    };
    expect(validateOutboundPolicy(input)).toEqual([]);
    expect(resolveOutboundDestinationCode(input)).toBe('HOUSE-MS-01');
    expect(resolveOutboundLedgerType(input.type)).toBe('FEED_ISSUE');
  });

  it('rejects a finished SKU used as medicine and missing destination', () => {
    expect(validateOutboundPolicy({
      type: 'MEDICINE_DISTRIBUTION',
      qty: 2,
      item: 'SKU-EGG-A',
      item_type: 'SKU',
      destination_type: 'HOUSE',
    })).toEqual(expect.arrayContaining([
      '去向为 HOUSE 时必须填写对应去向',
      'MEDICINE_DISTRIBUTION 只允许 MATERIAL 品目',
    ]));
  });

  it('requires sales outbound to use a customer/store destination and SKU', () => {
    expect(validateOutboundPolicy({
      type: 'SALE',
      qty: 30,
      item: 'MAT-FEED-001',
      item_type: 'MATERIAL',
      destination_type: 'HOUSE',
      destination_house_code: 'HOUSE-1',
    })).toEqual([
      'SALE 的去向类型必须是 CUSTOMER / STORE',
      'SALE 只允许 SKU 品目',
    ]);
  });

  it('forces warehouse transfers through the atomic transfer workflow', () => {
    expect(validateOutboundPolicy({
      type: 'TRANSFER',
      qty: 10,
      item: 'SKU-EGG-A',
      item_type: 'SKU',
      warehouse_code: 'WH-A',
      destination_type: 'WAREHOUSE',
      destination_warehouse_code: 'WH-B',
    })).toContain('库存调拨必须通过调拨管理的原子双边事务，不得以独立出库单执行');
    expect(validateOutboundWorkflow('TRANSFER', 'TRANSFER')).toEqual([]);
  });

  it('forces stocktake losses through stocktake approval', () => {
    expect(validateOutboundPolicy({
      type: 'STOCKTAKE_LOSS',
      qty: 1,
      item: 'MAT-1',
      item_type: 'MATERIAL',
      destination_type: 'OTHER',
      destination_code: 'STOCKTAKE',
    })).toContain('盘亏必须通过盘点审批工作流入账，不得以独立出库单执行');
    expect(validateOutboundWorkflow('STOCKTAKE_LOSS', 'STOCKTAKE')).toEqual([]);
  });

  it('keeps production, logistics and spare-part issues on material identities', () => {
    for (const type of ['PRODUCTION_USE', 'LOGISTICS_USE', 'SPARE_PART_USE']) {
      expect(validateOutboundPolicy({
        type,
        qty: 1,
        item: 'SKU-EGG-A',
        item_type: 'SKU',
        material_type: 'EQUIPMENT',
        destination_type: type === 'PRODUCTION_USE' ? 'HOUSE' : 'DEPARTMENT',
        destination_code: 'DEST-1',
      })).toContain(`${type} 只允许 MATERIAL 品目`);
    }
  });

  it('allows purchase returns only toward suppliers and retains canonical identities', () => {
    expect(validateOutboundPolicy({
      type: 'RETURN',
      qty: 2,
      item: 'MAT-FEED-001',
      item_type: 'MATERIAL',
      destination_type: 'SUPPLIER',
      destination_code: 'SUP-1',
    })).toEqual([]);
    expect(resolveOutboundPolicy('RETURN')).toMatchObject({
      source: 'PURCHASE_RETURN',
      category: 'PROCUREMENT_RETURN',
      ledgerType: 'PURCHASE_RETURN_OUT',
    });
  });
});
