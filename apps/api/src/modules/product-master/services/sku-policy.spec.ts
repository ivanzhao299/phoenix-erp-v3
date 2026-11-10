import { EntityManager } from 'typeorm';
import { SkuPolicy, SKU_IDENTITY_FIELDS } from './sku-policy';
import { SkuWriter } from './sku-writer';
import { MasterDataRuntimeService } from '../../master-data/master-data-runtime.service';
import { GenericCrudService } from '../../generic-crud/generic-crud.service';

function writer(db: any) { return new SkuWriter(db, {} as any, { logInTransaction: jest.fn() } as any); }

const sku = { sku_code: 'SKU-1', product_code: 'P1', grade_code: 'G1', spec_code: 'S1', sku_name: 'Eggs', status: 'ACTIVE' };
const core = ['sal_order_items', 'sal_price_items', 'inv_batches', 'inv_ledger'];
const refs = [...core, 'sal_store_sale_items', 'sal_return_items', 'store_replenishment_request_lines', 'wms_stocktake', 'ord_order_items', 'pkg_packing_records'];
function fixture(reference?: string, failure?: 'catalog' | 'probe' | 'lock') {
  const columns = refs.map(table_name => ({ table_name, column_name: table_name === 'pkg_packing_records' ? 'batches_json' : table_name === 'ord_order_items' ? 'item_code' : table_name === 'wms_stocktake' ? 'item' : 'sku_code', data_type: table_name === 'pkg_packing_records' ? 'jsonb' : 'character varying' }));
  let stored = { ...sku };
  const query = jest.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes('information_schema.columns')) {
      if (failure === 'catalog') throw new Error('catalog unavailable');
      return columns;
    }
    if (sql.startsWith('LOCK TABLE')) {
      if (failure === 'lock') throw new Error('lock unavailable');
      return [];
    }
    if (sql.startsWith('SELECT 1 FROM')) {
      if (failure === 'probe') throw new Error('reference probe unavailable');
      return reference && sql.includes(`"${reference}"`) ? [{ exists: 1 }] : [];
    }
    if (sql.startsWith('UPDATE product_skus')) {
      const fields = sql.match(/SET (.*?)(?:,updated_at)/)?.[1].split(',').map(v => v.split('=')[0].replace(/"/g, '')) ?? [];
      fields.forEach((field, i) => { stored = { ...stored, [field]: values[i] }; });
      return [stored];
    }
    if (sql.includes('FOR UPDATE')) return [{ ...stored }];
    if (sql.includes('FOR SHARE')) return [{ status: 'ACTIVE', product_name: 'Eggs' }];
    return [];
  });
  const manager = { query } as unknown as EntityManager;
  const db = { query, transaction: jest.fn(async (fn: (m: EntityManager) => Promise<unknown>) => fn(manager)) };
  return { db, manager, query, stored: () => stored };
}

describe('SKU identity protection', () => {
  it.each(SKU_IDENTITY_FIELDS)('blocks referenced %s changes', async key => {
    const f = fixture('sal_order_items');
    await expect(writer(f.db).update('SKU-1', { [key]: 'NEW' })).rejects.toMatchObject({ status: 409 });
    expect(f.stored()[key]).toBe(sku[key]);
  });
  it.each(SKU_IDENTITY_FIELDS)('allows unreferenced %s changes', async key => {
    const f = fixture();
    await expect(writer(f.db).update('SKU-1', { [key]: 'NEW' })).resolves.toMatchObject({ [key]: 'NEW' });
    expect(f.db.transaction).toHaveBeenCalledTimes(1);
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('LOCK TABLE'))).toBe(true);
  });
  it.each(refs)('blocks references in %s, including inactive/historical documents', async table => {
    const f = fixture(table);
    await expect(writer(f.db).update('SKU-1', { grade_code: 'G2' })).rejects.toThrow(table);
    expect(f.stored().grade_code).toBe('G1');
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('LOCK TABLE'))).toBe(false);
  });
  it.each(['catalog', 'probe', 'lock'] as const)('does not permit writes after %s failure', async failure => {
    const f = fixture(undefined, failure);
    await expect(writer(f.db).update('SKU-1', { grade_code: 'G2' })).rejects.toThrow('unavailable');
    expect(f.stored().grade_code).toBe('G1');
  });
  it('rejects busy reference tables with a retryable conflict and no identity write', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith('LOCK TABLE')) throw Object.assign(new Error('busy'), { code: '55P03' });
      return original(sql, values);
    });
    await expect(writer(f.db).update('SKU-1', { spec_code: 'S2' })).rejects.toMatchObject({ status: 409 });
    expect(f.stored().spec_code).toBe('S1');
  });
  it('rechecks references after obtaining the nonwaiting locks', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation()!;
    let locked = false;
    f.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith('LOCK TABLE')) { locked = true; expect(sql).toContain('NOWAIT'); }
      if (locked && sql.startsWith('SELECT 1 FROM "inv_batches"')) return [{ exists: 1 }];
      return original(sql, values);
    });
    await expect(writer(f.db).update('SKU-1', { spec_code: 'S2' })).rejects.toMatchObject({ status: 409 });
    expect(f.stored().spec_code).toBe('S1');
  });
  it('returns a retryable conflict when the SKU row is busy, including name edits', async () => {
    const db = { transaction: jest.fn((fn: any) => fn({ query: jest.fn().mockRejectedValue(Object.assign(new Error('busy'), { code: '55P03' })) })) };
    await expect(writer(db).update('SKU-1', { sku_name: 'New name' })).rejects.toMatchObject({ status: 409 });
  });
  it('rejects an overlong second probe instead of continuing with identity update', async () => {
    const f = fixture();
    const original = f.query.getMockImplementation()!;
    let locked = false;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => locked ? 3001 : 0);
    f.query.mockImplementation(async (sql, values) => {
      if (sql.startsWith('LOCK TABLE')) {
        // First call establishes the deadline, the next simulates elapsed scan time.
        now.mockReturnValueOnce(0).mockReturnValue(3001);
        locked = true;
      }
      return original(sql, values);
    });
    try {
      await expect(writer(f.db).update('SKU-1', { spec_code: 'S2' })).rejects.toMatchObject({ status: 409 });
      expect(f.stored().spec_code).toBe('S1');
    } finally { now.mockRestore(); }
  });
  it('blocks incomplete schemas instead of treating missing reference columns as zero references', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) } as any;
    await expect(SkuPolicy.assertIdentityChange(manager, sku, { grade_code: 'G2' })).rejects.toThrow('缺少 sal_order_items.sku_code');
  });
  it('allows names and remarks, and resubmission of unchanged identity on referenced SKUs', async () => {
    const f = fixture('sal_order_items');
    await expect(writer(f.db).update('SKU-1', { product_code: 'P1', sku_name: 'New name', remark: 'Note' })).resolves.toMatchObject({ sku_name: 'New name', remark: 'Note' });
    expect(f.query.mock.calls.some(([sql]) => sql.includes('information_schema'))).toBe(false);
  });
  it('protects the runtime write entry point', async () => {
    const f = fixture('sal_price_items');
    const runtime = new MasterDataRuntimeService(f.db as any, {} as any, { logInTransaction: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any);
    await expect(runtime.update('sku', 'SKU-1', { spec_code: 'S2' })).rejects.toMatchObject({ status: 409 });
    expect(f.stored().spec_code).toBe('S1');
  });
  it('blocks physical SKU deletion through generic CRUD', async () => {
    const f = fixture('sal_order_items');
    await expect(new GenericCrudService(f.db as any).remove('product_skus', 'id', 1)).rejects.toMatchObject({ status: 403 });
    expect(f.query).not.toHaveBeenCalled();
  });
  it('rejects SKU code changes and empty identity values', async () => {
    const f = fixture();
    await expect(writer(f.db).update('SKU-1', { sku_code: 'NEW' })).rejects.toMatchObject({ status: 400 });
    await expect(writer(f.db).update('SKU-1', { spec_code: '' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('SKU usability with database business date', () => {
  it.each([
    { status: 'FROZEN' }, { status: 'ARCHIVED' }, { status: 'DRAFT' },
    { effective_date: '2026-11-11' }, { expire_date: '2026-11-09' },
  ])('rejects unusable rows %o', async changes => {
    const manager = { query: jest.fn().mockResolvedValue([{ ...sku, today: '2026-11-10', ...changes }]) } as any;
    await expect(SkuPolicy.requireUsable(manager, 'SKU-1')).rejects.toMatchObject({ status: 400 });
  });
  it('accepts both inclusive date boundaries', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ ...sku, today: '2026-11-10', effective_date: '2026-11-10', expire_date: '2026-11-10' }]) } as any;
    await expect(SkuPolicy.requireUsable(manager, 'SKU-1')).resolves.toMatchObject(sku);
  });
});
