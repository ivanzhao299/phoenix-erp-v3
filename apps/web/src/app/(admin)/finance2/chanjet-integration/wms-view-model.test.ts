import { describe, expect, it } from 'vitest';
import {
  getWmsScopeFreshness,
  isPermissionFailure,
  isWmsMappingType,
  summarizeWmsScopes,
  type WmsScopeEvidence,
} from './wms-view-model';

const NOW = Date.parse('2026-07-28T12:00:00.000Z');

function scope(patch: Partial<WmsScopeEvidence> = {}): WmsScopeEvidence {
  return {
    endpointKey: 'STOCK_IN',
    label: '采购入库',
    entityType: 'CHANJET_STOCK_IN',
    bookId: 'BOOK-1',
    bookName: '测试账套',
    sourceRows: 3,
    latestPulledAt: '2026-07-28T11:00:00.000Z',
    latestSyncStatus: 'SUCCESS',
    latestSyncError: null,
    ...patch,
  };
}

describe('WMS administrator view model', () => {
  it('fails closed for failed, stale, and missing scope evidence', () => {
    expect(getWmsScopeFreshness(scope(), NOW)).toBe('FRESH');
    expect(getWmsScopeFreshness(scope({
      latestPulledAt: '2026-07-27T11:59:59.000Z',
    }), NOW)).toBe('STALE');
    expect(getWmsScopeFreshness(scope({ latestPulledAt: null }), NOW)).toBe('MISSING');
    expect(getWmsScopeFreshness(scope({
      latestSyncStatus: 'FAIL',
      latestSyncError: '50111 openToken无调用该接口的权限',
    }), NOW)).toBe('FAILED');
  });

  it('summarizes all scope evidence without treating missing data as success', () => {
    const summary = summarizeWmsScopes([
      scope(),
      scope({ endpointKey: 'OTHER_STOCK_IN', latestSyncStatus: 'FAIL', latestSyncError: '50111 openToken无调用该接口的权限' }),
      scope({ endpointKey: 'STOCK_COUNT', latestPulledAt: null }),
      scope({ endpointKey: 'STOCK_TRANSFER', latestPulledAt: '2026-07-26T10:00:00.000Z' }),
    ], NOW);

    expect(summary).toEqual({
      total: 4,
      fresh: 1,
      stale: 1,
      missing: 1,
      failed: 1,
      permissionFailures: 1,
    });
  });

  it('recognizes WMS master-data mappings and permission failures', () => {
    expect(isWmsMappingType('WAREHOUSE')).toBe(true);
    expect(isWmsMappingType('PRODUCT')).toBe(true);
    expect(isWmsMappingType('SUBJECT')).toBe(false);
    expect(isPermissionFailure('50111 openToken无调用该接口的权限')).toBe(true);
    expect(isPermissionFailure('network timeout')).toBe(false);
  });
});
