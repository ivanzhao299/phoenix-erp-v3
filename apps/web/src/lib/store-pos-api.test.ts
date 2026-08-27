import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({ default: vi.fn(async () => ({ data: [{ storeCode: 'STORE-A' }] })) }));
import request from '@/lib/api-client';
import { loadStorePosContexts, storePosRequest } from './store-pos-api';

describe('shared Store POS scoped client', () => {
  it('Admin and Terminal use the same membership context endpoint', async () => {
    await expect(loadStorePosContexts()).resolves.toEqual([{ storeCode: 'STORE-A' }]);
    expect(request).toHaveBeenCalledWith('/v2/store-sales/contexts', { method: 'GET', body: undefined });
  });

  it('never adds a legacy store fallback to requests', async () => {
    await storePosRequest('POST', '/api/v2/store-sales/1/return', { reason: 'x' });
    expect(request).toHaveBeenLastCalledWith('/v2/store-sales/1/return', { method: 'POST', body: JSON.stringify({ reason: 'x' }) });
  });
});
