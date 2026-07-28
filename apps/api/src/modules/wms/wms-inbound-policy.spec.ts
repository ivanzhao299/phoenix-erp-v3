import {
  WMS_INBOUND_TYPES,
  resolveInboundPolicy,
  validateInboundPolicy,
  validateInboundWorkflow,
} from './wms-inbound-policy';

describe('WMS inbound policy', () => {
  it('defines source, category, ledger and managed workflow for every inbound type', () => {
    for (const type of WMS_INBOUND_TYPES) {
      expect(resolveInboundPolicy(type)).toEqual(expect.objectContaining({
        type,
        source: expect.any(String),
        category: expect.any(String),
        businessType: expect.any(String),
        ledgerType: expect.any(String),
        allowedItemTypes: expect.any(Array),
        managedBy: expect.any(Array),
      }));
    }
  });

  it('allows purchasing raw materials and external finished goods', () => {
    expect(validateInboundPolicy({ type: 'PURCHASE', item_type: 'MATERIAL' })).toEqual([]);
    expect(validateInboundPolicy({ type: 'PURCHASE', item_type: 'SKU' })).toEqual([]);
    expect(resolveInboundPolicy('PURCHASE')).toMatchObject({
      source: 'PURCHASE_RECEIPT',
      category: 'PROCUREMENT',
      ledgerType: 'PURCHASE_INBOUND',
    });
  });

  it('only allows a canonical SKU for production completion inbound', () => {
    expect(validateInboundPolicy({ type: 'PRODUCTION', item_type: 'SKU' })).toEqual([]);
    expect(validateInboundPolicy({ type: 'PRODUCTION', item_type: 'MATERIAL' }))
      .toContain('PRODUCTION 只允许 SKU 品目');
  });

  it('rejects free text identities and unsupported inbound types', () => {
    expect(validateInboundPolicy({ type: 'RETURN', item_type: '' }))
      .toContain('入库品目必须来自物料主数据或产成品 SKU');
    expect(validateInboundPolicy({ type: 'MAGIC', item_type: 'SKU' })[0])
      .toContain('不支持的入库类型');
  });

  it('keeps transfer, return, stocktake gain and opening on canonical identities', () => {
    for (const type of [
      'TRANSFER',
      'TRANSFER_RECEIVE',
      'RETURN',
      'SALES_RETURN',
      'ADJUSTMENT',
      'STOCKTAKE_GAIN',
      'OPENING',
    ]) {
      expect(validateInboundPolicy({ type, item_type: 'MATERIAL' })).toEqual([]);
      expect(validateInboundPolicy({ type, item_type: 'SKU' })).toEqual([]);
    }
  });

  it('forces transfer and stocktake gains through their atomic managed workflows', () => {
    expect(validateInboundWorkflow('TRANSFER_RECEIVE', 'GENERIC_INBOUND'))
      .toContain('库存调拨必须通过调拨管理的原子双边事务，不得以独立入库单执行');
    expect(validateInboundWorkflow('STOCKTAKE_GAIN', 'GENERIC_INBOUND'))
      .toContain('盘盈必须通过盘点审批工作流入账，不得以独立入库单执行');
    expect(validateInboundWorkflow('TRANSFER_RECEIVE', 'TRANSFER')).toEqual([]);
    expect(validateInboundWorkflow('STOCKTAKE_GAIN', 'STOCKTAKE')).toEqual([]);
  });
});
