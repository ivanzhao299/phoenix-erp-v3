import { ProductPolicy } from '../product-master/services/product-policy';
import { PackagingService } from './packaging.service';

it('requires the fixed product inside shift completion transaction before any shift/inventory mutation', async () => {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM pkg_shifts')) return [{ id: 1, shift_date: '2026-11-10', house_code: 'H1', shift_time: '早班', status: 'PENDING' }];
    if (sql.includes('FROM brd_houses')) return [{ house_code: 'H1', farm_code: 'F1', company_code: 'LEGACY-COMPANY' }];
    if (sql.includes('FROM md_egg_source_profiles')) return []; // Company is known, but has never configured profiles.
    return [];
  });
  const manager = { query: jest.fn() };
  const db = { query, transaction: jest.fn(async (run: any) => run(manager)) };
  const ensure = jest.spyOn(ProductPolicy, 'ensureRawEggProduct').mockRejectedValue(new Error('fixed product invalid'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const svc = new PackagingService(db as any, {} as any);
    await expect(svc.completeShift(1, { total_qty: 30 }, 7)).resolves.toMatchObject({ code: 500, msg: 'fixed product invalid' });
    expect(ensure).toHaveBeenCalledWith(manager, '7');
    expect(manager.query).not.toHaveBeenCalled();
    expect(query.mock.calls.every(([sql]) => !sql.includes('INSERT INTO mst_products'))).toBe(true);
  } finally { ensure.mockRestore(); log.mockRestore(); }
});
