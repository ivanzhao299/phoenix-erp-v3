import {
  isIssueOutboundType,
  resolveOutboundDestinationCode,
  resolveOutboundLedgerType,
  validateOutboundPolicy,
} from './wms-outbound-policy';

describe('WMS outbound policy', () => {
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
      'MEDICINE_DISTRIBUTION 只能领用物料主数据，不能领用产成品 SKU',
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
      '销售出库只能选择可销售产成品 SKU',
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
  });
});
