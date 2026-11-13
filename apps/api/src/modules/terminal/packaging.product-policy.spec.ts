import { PackagingService } from './packaging.service';

it('completes shift records without manufacturing raw-egg product or inventory', async () => {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM pkg_shifts')) return [{ id: 1, shift_date: '2026-11-10', house_code: 'H1', shift_time: '早班', status: 'PENDING' }];
    if (sql.includes('FROM brd_houses')) return [{ house_code: 'H1', farm_code: 'F1', company_code: 'LEGACY-COMPANY' }];
    if (sql.includes('FROM md_egg_source_profiles')) return []; // Company is known, but has never configured profiles.
    return [];
  });
  const manager = { query: jest.fn(async () => []) };
  const db = { query, transaction: jest.fn(async (run: any) => run(manager)) };
  const svc = new PackagingService(db as any, {} as any);
  const result = await svc.completeShift(1, { total_qty: 30 }, 7);
  expect(result).toMatchObject({ code: 200 });
  const executed = [...query.mock.calls, ...manager.query.mock.calls].map(([sql]) => String(sql));
  expect(executed.some(sql => sql.includes('INSERT INTO mst_products'))).toBe(false);
  expect(executed.some(sql => sql.includes('INSERT INTO inv_batches'))).toBe(false);
  expect(executed.some(sql => sql.includes('INSERT INTO inv_ledger'))).toBe(false);
  expect(executed.some(sql => sql.includes('PRD-EGG-RAW'))).toBe(false);
  expect(executed.some(sql => sql.includes('INSERT INTO pkg_tasks'))).toBe(true);
  expect(executed.some(sql => sql.includes('INSERT INTO brd_daily_logs') || sql.includes('UPDATE brd_daily_logs'))).toBe(true);
});
