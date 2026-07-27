import { validateInboundPolicy } from './wms-inbound-policy';

describe('WMS inbound policy', () => {
  it('allows purchasing raw materials and external finished goods', () => {
    expect(validateInboundPolicy({ type: 'PURCHASE', item_type: 'MATERIAL' })).toEqual([]);
    expect(validateInboundPolicy({ type: 'PURCHASE', item_type: 'SKU' })).toEqual([]);
  });

  it('only allows a canonical SKU for production completion inbound', () => {
    expect(validateInboundPolicy({ type: 'PRODUCTION', item_type: 'SKU' })).toEqual([]);
    expect(validateInboundPolicy({ type: 'PRODUCTION', item_type: 'MATERIAL' }))
      .toContain('生产入库只能选择已建档的产成品或半成品 SKU');
  });

  it('rejects free text identities and unsupported inbound types', () => {
    expect(validateInboundPolicy({ type: 'RETURN', item_type: '' }))
      .toContain('入库品目必须来自物料主数据或产成品 SKU');
    expect(validateInboundPolicy({ type: 'MAGIC', item_type: 'SKU' })[0])
      .toContain('不支持的入库类型');
  });

  it('keeps transfer, return, adjustment and opening on canonical identities', () => {
    for (const type of ['TRANSFER', 'TRANSFER_RECEIVE', 'RETURN', 'ADJUSTMENT', 'OPENING']) {
      expect(validateInboundPolicy({ type, item_type: 'MATERIAL' })).toEqual([]);
      expect(validateInboundPolicy({ type, item_type: 'SKU' })).toEqual([]);
    }
  });
});
