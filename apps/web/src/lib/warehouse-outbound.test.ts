import { describe, expect, it } from 'vitest';
import { OUTBOUND_DESTINATIONS, validateOutboundItem, validateOutboundQuantity } from './warehouse-outbound';

describe('warehouse outbound form policy', () => {
  it('keeps outbound and issue destinations aligned with the backend policy', () => {
    expect(OUTBOUND_DESTINATIONS.SALE).toEqual(['CUSTOMER', 'STORE']);
    expect(OUTBOUND_DESTINATIONS.PRODUCTION_USE).toEqual(['HOUSE', 'DEPARTMENT', 'PROJECT']);
    expect(OUTBOUND_DESTINATIONS.OFFICE_USE).toEqual(['DEPARTMENT', 'EMPLOYEE']);
    expect(OUTBOUND_DESTINATIONS.RETURN).toEqual(['SUPPLIER']);
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
