import { ForbiddenException } from '@nestjs/common';
import { StoreScopePolicy } from './store-scope-policy.service';

const membership = { storeId: '1', storeCode: 'STORE-A', storeName: 'A', companyCode: 'COMP-A', timezone: 'Asia/Shanghai', businessDayCutoff: '00:00:00', role: 'CASHIER', hasSalesWarehouse: true };

function subject(opts: { memberships?: any[]; bindings?: string[]; scope?: any; legacy?: string } = {}) {
  const memberships = opts.memberships ?? [membership];
  const bindings = opts.bindings ?? ['WH-A'];
  const ds = { query: jest.fn(async (sql: string) => {
    if (sql.includes('FROM store_memberships m')) return memberships;
    if (sql.includes('FROM store_warehouse_bindings b')) return bindings.map(warehouseCode => ({ warehouseCode }));
    return [];
  }) } as any;
  const values: any = {
    user: { userId: 7, storeCode: opts.legacy ?? 'STORE-A' },
    dataScope: opts.scope ?? { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'] },
  };
  return new StoreScopePolicy(ds, { get: (key: string) => values[key] } as any);
}

describe('StoreScopePolicy V1-1 quadrants', () => {
  it('cashier with membership and warehouse intersection is limited to that store', async () => {
    await expect(subject().resolve('STORE-A')).resolves.toMatchObject({ storeCode: 'STORE-A', warehouseCodes: ['WH-A'] });
    await expect(subject().resolve('STORE-B')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fails closed when membership has no warehouse intersection', async () => {
    await expect(subject({ scope: { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-X'] } }).resolve('STORE-A'))
      .rejects.toThrow('仓权限交集');
  });

  it('supports a multi-store manager selecting exactly one context', async () => {
    const b = { ...membership, storeId: '2', storeCode: 'STORE-B', storeName: 'B' };
    await expect(subject({ memberships: [membership, b] }).resolve('STORE-B')).resolves.toMatchObject({ storeCode: 'STORE-B' });
  });

  it('does not grant Finance POS access without explicit membership', async () => {
    await expect(subject({ memberships: [] }).resolve('STORE-A')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires binding even for Admin/GROUP global scope', async () => {
    await expect(subject({ bindings: [], scope: { isGlobal: true, allowedCompanyCodes: [], allowedWarehouseCodes: [] } }).resolve('STORE-A'))
      .rejects.toThrow('仓权限交集');
  });

  it('legacy mismatch changes metrics but never the membership result', async () => {
    const before = StoreScopePolicy.metrics().shadowMismatch;
    await expect(subject({ legacy: 'STORE-OLD' }).resolve('STORE-A')).resolves.toMatchObject({ storeCode: 'STORE-A' });
    expect(StoreScopePolicy.metrics().shadowMismatch).toBe(before + 1);
  });

  it('zero membership rejects even if legacy matches', async () => {
    await expect(subject({ memberships: [], legacy: 'STORE-A' }).resolve('STORE-A')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
