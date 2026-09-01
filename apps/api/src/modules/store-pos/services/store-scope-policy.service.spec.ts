import { ForbiddenException } from '@nestjs/common';
import { StoreScopePolicy } from './store-scope-policy.service';

const membership = { storeId: '1', storeCode: 'STORE-A', storeName: 'A', companyCode: 'COMP-A', timezone: 'Asia/Shanghai', businessDayCutoff: '00:00:00', role: 'CASHIER', roles: ['CASHIER'], hasSalesWarehouse: true };

function subject(opts: { memberships?: any[]; bindings?: string[]; scope?: any; legacy?: string } = {}) {
  const memberships = opts.memberships ?? [membership];
  const bindings = opts.bindings ?? ['WH-A'];
  const ds = { query: jest.fn(async (sql: string) => {
    if (sql.includes('FROM store_memberships m')) return memberships;
    if (sql.includes('FROM store_master s')) return [{
      storeId: '1', storeCode: 'STORE-A', storeName: 'A', companyCode: 'COMP-A',
      timezone: 'Asia/Shanghai', businessDayCutoff: '00:00:00',
    }];
    if (sql.includes('FROM store_warehouse_bindings b')) return bindings.map((warehouseCode, index) => ({
      warehouseCode, purpose: sql.includes('b.purpose=ANY') ? (index === 0 ? 'SALES' : 'RETURNS') : undefined,
    }));
    return [];
  }) } as any;
  const values: any = {
    user: { userId: 7, storeCode: opts.legacy ?? 'STORE-A' },
    dataScope: opts.scope ?? { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'] },
  };
  return new StoreScopePolicy(ds, { get: (key: string) => values[key] } as any);
}

describe('StoreScopePolicy V1-1 quadrants', () => {
  it('aggregates same-store memberships into one deterministic context', async () => {
    const manager = { ...membership, role: 'STORE_MANAGER', roles: ['STORE_MANAGER'] };
    const contexts = await subject({ memberships: [membership, manager] }).listMembershipStores();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      storeCode: 'STORE-A', role: 'STORE_MANAGER', roles: ['CASHIER', 'STORE_MANAGER'],
    });
  });

  it('returns one context per store for a multi-store user', async () => {
    const b = { ...membership, storeId: '2', storeCode: 'STORE-B', storeName: 'B' };
    await expect(subject({ memberships: [membership, b] }).listMembershipStores())
      .resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ storeCode: 'STORE-A' }),
        expect.objectContaining({ storeCode: 'STORE-B' }),
      ]));
  });

  it('keeps membership/store status and validity filters in the contexts contract', async () => {
    const policy = subject();
    await policy.listMembershipStores();
    const sql = (policy as any).ds.query.mock.calls[0][0] as string;
    expect(sql).toContain("m.status='ACTIVE'");
    expect(sql).toContain("s.status='ACTIVE'");
    expect(sql).toContain('m.effective_from<=NOW()');
    expect(sql).toContain('m.effective_to>=NOW()');
  });

  it('reports a membership context without a sales warehouse', async () => {
    const noWarehouse = { ...membership, hasSalesWarehouse: false };
    await expect(subject({ memberships: [noWarehouse] }).listMembershipStores())
      .resolves.toEqual([expect.objectContaining({ storeCode: 'STORE-A', hasSalesWarehouse: false })]);
  });

  it('reports whether each membership store has a WarehouseScope intersection', async () => {
    const policy = subject({ scope: { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'] } });
    await policy.listMembershipStores();
    const [sql, params] = (policy as any).ds.query.mock.calls[0];
    expect(sql).toContain('hasWarehouseScopeIntersection');
    expect(params).toEqual([7, false, ['WH-A']]);
  });

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

  it('resolves store identity and bindings for a warehouse approver without membership', async () => {
    await expect(subject({ memberships: [], bindings: ['STORE-WH', 'WH-A'] }).resolveStoreContext('STORE-A'))
      .resolves.toMatchObject({ storeCode: 'STORE-A', companyCode: 'COMP-A', warehouseCodes: ['STORE-WH', 'WH-A'] });
  });

  it('keeps store-context lookup fail-closed outside the approver company scope', async () => {
    await expect(subject({ memberships: [], scope: {
      isGlobal: false, allowedCompanyCodes: ['COMP-X'], allowedWarehouseCodes: ['WH-A'],
    } }).resolveStoreContext('STORE-A')).rejects.toThrow('门店公司不在 DataScope');
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

  it('inventory scope unions SALES and RETURNS bindings then intersects WarehouseScope', async () => {
    const policy = subject({ bindings: ['WH-A', 'WH-RET'], scope: {
      isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'],
    } });
    const result = await policy.resolveInventory('STORE-A');
    expect(result.warehouseCodes).toEqual(['WH-A']);
    const bindingCall = (policy as any).ds.query.mock.calls.find((call: any[]) => call[0].includes("b.purpose=ANY"));
    expect(bindingCall[1]).toEqual(['1', ['SALES', 'RETURNS']]);
  });
});
