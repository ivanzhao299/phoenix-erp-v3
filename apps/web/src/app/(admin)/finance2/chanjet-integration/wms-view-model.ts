export type WmsScopeFreshness = 'FRESH' | 'STALE' | 'MISSING' | 'FAILED';

export interface WmsScopeEvidence {
  endpointKey: string;
  label: string;
  entityType: string;
  bookId: string;
  bookName: string;
  sourceRows: number;
  latestPulledAt: string | null;
  latestSyncStatus: string;
  latestSyncError: string | null;
}

export interface WmsScopeSummary {
  total: number;
  fresh: number;
  stale: number;
  missing: number;
  failed: number;
  permissionFailures: number;
}

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isPermissionFailure(message: string | null | undefined): boolean {
  if (!message) return false;
  return /(?:50111|openToken.*(?:权限|permission)|无调用该接口的权限)/i.test(message);
}

export function getWmsScopeFreshness(
  scope: WmsScopeEvidence,
  now = Date.now(),
): WmsScopeFreshness {
  if (scope.latestSyncStatus === 'FAIL') return 'FAILED';
  if (!scope.latestPulledAt) return 'MISSING';
  const pulledAt = new Date(scope.latestPulledAt).getTime();
  if (!Number.isFinite(pulledAt) || now - pulledAt >= FRESHNESS_WINDOW_MS) return 'STALE';
  return 'FRESH';
}

export function summarizeWmsScopes(
  scopes: WmsScopeEvidence[],
  now = Date.now(),
): WmsScopeSummary {
  return scopes.reduce<WmsScopeSummary>((summary, scope) => {
    const freshness = getWmsScopeFreshness(scope, now);
    summary.total += 1;
    summary[freshness.toLowerCase() as 'fresh' | 'stale' | 'missing' | 'failed'] += 1;
    if (isPermissionFailure(scope.latestSyncError)) summary.permissionFailures += 1;
    return summary;
  }, {
    total: 0,
    fresh: 0,
    stale: 0,
    missing: 0,
    failed: 0,
    permissionFailures: 0,
  });
}

export function isWmsMappingType(mappingType: string): boolean {
  return [
    'COMPANY',
    'DEPARTMENT',
    'PROJECT',
    'WAREHOUSE',
    'PRODUCT',
    'UOM',
    'CURRENCY',
  ].includes(mappingType);
}

export function isWmsReconciliationType(type: string, subjectType: string): boolean {
  return /(?:WMS|INVENTORY|STOCK|WAREHOUSE|入库|出库|库存|仓库)/i.test(`${type} ${subjectType}`);
}
