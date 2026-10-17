import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ProductionInboundService } from './production-inbound.service';
import { EggInventoryService } from './egg-inventory.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';

// Explicit disposable fixture only; never load application environment or migrations.
const fixtureUrl = process.env.ISSUE381_PG_URL;
const fixture = fixtureUrl ? describe : describe.skip;

fixture('Issue 381 real PostgreSQL inbound transactions and retries', () => {
  let db: DataSource;
  let service: ProductionInboundService;
  let scope: { isGlobal: boolean; allowedCompanyCodes: string[]; allowedWarehouseCodes: string[] };
  const grades = ['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'];
  const cls = { get: (key: string) => key === 'dataScope' ? scope : { username: 'issue381-fixture' } };
  const payload = () => ({ houseCode: 'HOUSE-A', eggDate: '2026-10-17', items: [
    { grade: 'GRADE_1', qty: 11 }, { grade: 'GRADE_1', qty: 22 },
  ] });

  beforeAll(async () => {
    const url = new URL(fixtureUrl!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/issue381_fixture' || !process.env.ISSUE381_FIXTURE_OWNER) {
      throw new Error('Owned loopback issue381_fixture required');
    }
    db = await new DataSource({ type: 'postgres', url: fixtureUrl, synchronize: false, migrationsRun: false,
      installExtensions: false, extra: { max: 8 } }).initialize();
    // The caller creates this marker in its freshly provisioned database. Verify before any fixture writes.
    const owners: Array<{ owner_key: string }> = await db.query('SELECT owner_key FROM issue381_fixture_owner');
    if (owners.length !== 1 || owners[0].owner_key !== process.env.ISSUE381_FIXTURE_OWNER) {
      throw new Error('Fixture ownership mismatch');
    }
    await db.query(`
      CREATE TABLE IF NOT EXISTS product_grades (grade_code text PRIMARY KEY, status text, sort_order int);
      CREATE TABLE IF NOT EXISTS product_skus (sku_code text PRIMARY KEY, product_code text, grade_code text, spec_code text, status text);
      CREATE TABLE IF NOT EXISTS sys_organizations (org_code text PRIMARY KEY, company_code text, org_type text, status text);
      CREATE TABLE IF NOT EXISTS brd_farms (farm_code text PRIMARY KEY, company_code text, mapped_site_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_houses (house_code text PRIMARY KEY, farm_code text, status text);
      CREATE TABLE IF NOT EXISTS wms_warehouses (warehouse_code text PRIMARY KEY, company_code text, site_code text, status text, type text, domain text);
      CREATE TABLE IF NOT EXISTS wms_locations (location_code text PRIMARY KEY, warehouse_code text, status text);
      CREATE TABLE IF NOT EXISTS inv_batches (id serial PRIMARY KEY, batch_no text UNIQUE, product_code text, company_code text,
        warehouse_code text, location_code text, egg_date date, inbound_date date, expire_date date,
        quality_grade text, packaging_spec text, source_type text, source_no text, qty numeric, qty_available numeric,
        status text, sku_code text, grade_code_std text, spec_code text, packaging_batch_ref text,
        collection_batch_ref text, created_at timestamptz, updated_at timestamptz);
      CREATE TABLE IF NOT EXISTS inv_ledger (id serial PRIMARY KEY, batch_no text REFERENCES inv_batches(batch_no), change_type text,
        qty_change numeric, operator text, store_code text, ref_no text, note text, batch_expire_date date,
        quality_grade text, company_code text, sku_code text, log_date date, warehouse_code text, location_code text);
      TRUNCATE inv_ledger, inv_batches, product_skus, product_grades, sys_organizations,
        brd_farms, brd_houses, wms_warehouses, wms_locations RESTART IDENTITY;
    `);
    for (const [i, grade] of grades.entries()) {
      await db.query("INSERT INTO product_grades VALUES ($1,'ACTIVE',$2)", [grade, i]);
      await db.query("INSERT INTO product_skus VALUES ($1,'PRD-EGG-RAW',$2,'LOOSE','ACTIVE')", [`SKU-${grade}`, grade]);
    }
    for (const company of ['A', 'B']) {
      await db.query("INSERT INTO sys_organizations VALUES ($1,$1,'COMPANY','ACTIVE')", [`COMP-${company}`]);
      await db.query("INSERT INTO brd_farms VALUES ($1,$2,$3,'ACTIVE')", [`FARM-${company}`, `COMP-${company}`, `SITE-${company}`]);
      await db.query("INSERT INTO brd_houses VALUES ($1,$2,'ACTIVE')", [`HOUSE-${company}`, `FARM-${company}`]);
      await db.query("INSERT INTO wms_warehouses VALUES ($1,$2,$3,'ACTIVE','EGG_FARM','OPERATIONAL')", [`WH-${company}`, `COMP-${company}`, `SITE-${company}`]);
      await db.query("INSERT INTO wms_locations VALUES ($1,$2,'ACTIVE')", [`LOC-${company}`, `WH-${company}`]);
    }
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  beforeEach(async () => {
    await db.query('TRUNCATE inv_ledger, inv_batches RESTART IDENTITY');
    scope = { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'] };
    service = new ProductionInboundService(db, cls as never, new EggInventoryService(db, cls as never),
      { resolveMode: async () => 'TEMP_PRODUCTION_INBOUND' } as never, new OrgOwnershipService(db.manager));
  });
  const counts = async () => (await db.query('SELECT (SELECT count(*)::int FROM inv_batches) AS batches, (SELECT count(*)::int FROM inv_ledger) AS events'))[0];

  it('replays original batch identities and quantities for two shifts sharing a grade', async () => {
    const first = await service.recordProductionInbound(payload());
    const retry = await service.recordProductionInbound(payload());
    expect(first.idempotent).toBe(false);
    expect(retry).toMatchObject({ idempotent: true, totalInbound: 33, batches: first.batches });
    expect(new Set(retry.batches.map(row => row.batchNo)).size).toBe(2);
    expect(retry.batches.map(row => row.qty)).toEqual([11, 22]);
    expect(await counts()).toEqual({ batches: 2, events: 2 });
  });

  it('serializes simultaneous duplicate requests without creating extra batches or ledger events', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => service.recordProductionInbound(payload())));
    expect(results.filter(row => !row.idempotent)).toHaveLength(1);
    for (const result of results) expect(result.batches).toEqual(results[0].batches);
    expect(await counts()).toEqual({ batches: 2, events: 2 });
  });

  it('blocks a competing changed payload and leaves the committed stock unchanged', async () => {
    const first = await service.recordProductionInbound(payload());
    const changed = { ...payload(), items: [{ grade: 'GRADE_1', qty: 99 }] };
    const outcomes = await Promise.allSettled([service.recordProductionInbound(payload()), service.recordProductionInbound(changed)]);
    expect(outcomes.map(row => row.status)).toEqual(['fulfilled', 'rejected']);
    expect((await service.recordProductionInbound(payload())).batches).toEqual(first.batches);
    expect(await counts()).toEqual({ batches: 2, events: 2 });
    expect((await db.query('SELECT sum(qty)::int AS qty FROM inv_batches'))[0].qty).toBe(33);
  });

  it('rolls back every batch and event if a later ledger insert fails, then permits a clean retry', async () => {
    await db.query('ALTER TABLE inv_ledger ADD CONSTRAINT fixture_reject_second_item CHECK (qty_change <> 22)');
    try {
      await expect(service.recordProductionInbound(payload())).rejects.toThrow();
      expect(await counts()).toEqual({ batches: 0, events: 0 });
    } finally { await db.query('ALTER TABLE inv_ledger DROP CONSTRAINT fixture_reject_second_item'); }
    expect(await service.recordProductionInbound(payload())).toMatchObject({ idempotent: false, totalInbound: 33 });
    expect(await counts()).toEqual({ batches: 2, events: 2 });
  });

  it('preserves existing stock and grade/SKU/location ownership through normal writes and refused foreign writes', async () => {
    const seed = { ...payload(), eggDate: '2026-10-16', items: [{ grade: 'GRADE_2', qty: 7 }] };
    const old = await service.recordProductionInbound(seed);
    const before = await db.query('SELECT * FROM inv_batches WHERE batch_no=$1', [old.batches[0].batchNo]);
    const nine = { ...payload(), items: grades.map((grade, i) => ({ grade, qty: i + 1 })) };
    expect(await service.recordProductionInbound(nine)).toMatchObject({ totalInbound: 45 });
    expect(await db.query('SELECT * FROM inv_batches WHERE batch_no=$1', [old.batches[0].batchNo])).toEqual(before);
    const rows = await db.query("SELECT grade_code_std, sku_code, warehouse_code, location_code FROM inv_batches WHERE egg_date='2026-10-17' ORDER BY id");
    rows.forEach((row: Record<string, string>, i: number) => expect(row).toMatchObject({ grade_code_std: grades[i], sku_code: `SKU-${grades[i]}`, warehouse_code: 'WH-A', location_code: 'LOC-A' }));
    await expect(service.recordProductionInbound({ ...payload(), houseCode: 'HOUSE-B' })).rejects.toThrow('无权向公司');
    scope.allowedWarehouseCodes = [];
    await expect(service.recordProductionInbound({ ...payload(), eggDate: '2026-10-18' })).rejects.toThrow('无权向仓库');
    expect(await counts()).toEqual({ batches: 10, events: 10 });
  });
});
