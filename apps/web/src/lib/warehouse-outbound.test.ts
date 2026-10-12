import { describe, expect, it } from 'vitest';
import {
  ISSUE_OUTBOUND_TYPES,
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
