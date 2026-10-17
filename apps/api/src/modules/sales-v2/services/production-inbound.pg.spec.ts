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
  const payload = () => ({ houseCode: 'HOUSE-A', warehouseCode: 'WH-A', locationCode: 'LOC-A', eggDate: '2026-10-17', items: [
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
      CREATE TABLE IF NOT EXISTS inv_batches (id serial PRIMARY KEY, batch_no varchar(64) UNIQUE, product_code text, company_code text,
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
    await db.query("INSERT INTO brd_houses VALUES ('HOUSE-A2','FARM-A','ACTIVE')");
    await db.query("INSERT INTO wms_warehouses VALUES ('WH-A2','COMP-A','SITE-A','ACTIVE','EGG_FARM','OPERATIONAL')");
    await db.query("INSERT INTO wms_locations VALUES ('LOC-A2','WH-A2','ACTIVE'), ('LOC-A-OTHER','WH-A','ACTIVE')");
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  beforeEach(async () => {
    await db.query('ALTER TABLE inv_ledger DROP CONSTRAINT IF EXISTS fixture_reject_second_item');
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
    await expect(service.recordProductionInbound({ ...payload(), houseCode: 'HOUSE-B', warehouseCode: 'WH-B', locationCode: 'LOC-B' })).rejects.toThrow('无权向公司');
    scope.allowedWarehouseCodes = [];
    await expect(service.recordProductionInbound({ ...payload(), eggDate: '2026-10-18' })).rejects.toThrow('无权向仓库');
    expect(await counts()).toEqual({ batches: 10, events: 10 });
  });

  it.each([
    { name: 'date', changed: { eggDate: '2026-10-18' } },
    { name: 'house', changed: { houseCode: 'HOUSE-A2' } },
    { name: 'warehouse', changed: { warehouseCode: 'WH-A2', locationCode: 'LOC-A2' } },
    { name: 'location', changed: { locationCode: 'LOC-A-OTHER' } },
  ])('rejects same-key replay across $name without leaking old batch identities', async ({ changed }) => {
    const request = { ...payload(), idempotencyKey: 'CUSTOM-REPLAY' };
    const original = await service.recordProductionInbound(request);
    // Revoke the original warehouse, while the new requested warehouse is authorized.
    scope.allowedWarehouseCodes = ['WH-A', 'WH-A2'];
    if (changed.warehouseCode) scope.allowedWarehouseCodes = ['WH-A2'];
    const error = await service.recordProductionInbound({ ...request, ...changed }).catch(e => e);
    expect(error.getStatus()).toBe(400);
    expect(error.message).toContain('来源或库存归属不一致');
    original.batches.forEach(batch => expect(error.message).not.toContain(batch.batchNo));
    expect(await counts()).toEqual({ batches: 2, events: 2 });
  });

  it('fails closed for historic replay rows without provenance, and preserves exact-context retries', async () => {
    const request = { ...payload(), idempotencyKey: 'HISTORY' };
    const first = await service.recordProductionInbound(request);
    expect((await service.recordProductionInbound(request)).batches).toEqual(first.batches);
    await db.query('UPDATE inv_batches SET collection_batch_ref=NULL');
    await expect(service.recordProductionInbound(request)).rejects.toThrow('来源或库存归属不一致');
    expect(await counts()).toEqual({ batches: 2, events: 2 });
  });

  it('rejects oversized keys and invalid dates without writing inventory', async () => {
    await expect(service.recordProductionInbound({ ...payload(), idempotencyKey: 'a'.repeat(65) })).rejects.toThrow('64');
    for (const eggDate of ['2026-02-30', '20261017', '0000-01-01']) {
      await expect(service.recordProductionInbound({ ...payload(), eggDate })).rejects.toThrow('YYYY-MM-DD');
    }
    expect(await counts()).toEqual({ batches: 0, events: 0 });
  });

  it('serializes different keys on the same day without batch-number collisions', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => service.recordProductionInbound({
      ...payload(), idempotencyKey: `INDEPENDENT-${i}`,
    })));
    expect(results.every(result => !result.idempotent)).toBe(true);
    expect(new Set(results.flatMap(result => result.batches.map(batch => batch.batchNo))).size).toBe(10);
    expect(await counts()).toEqual({ batches: 10, events: 10 });
  });

  it('shares numbering across companies, direct callers and callers supplying a transaction', async () => {
    scope.isGlobal = true;
    const core = new EggInventoryService(db, cls as never);
    const direct = { companyCode: 'COMP-A', warehouseCode: 'WH-A', locationCode: 'LOC-A',
      eggDate: '2026-10-17', productCode: 'PRD-EGG-RAW', qualityGrade: 'GRADE_1', qty: 3 };
    const results = await Promise.all([
      service.recordProductionInbound({ ...payload(), idempotencyKey: 'SHARED' }),
      service.recordProductionInbound({ ...payload(), houseCode: 'HOUSE-B', warehouseCode: 'WH-B', locationCode: 'LOC-B', idempotencyKey: 'SHARED' }),
      core.createProductionBatch(direct),
      db.transaction(manager => core.createProductionBatch({ ...direct, sourceType: 'PACKAGING',
        ledgerChangeType: 'PACKAGING_INBOUND', packagingBatchRef: 'FIXTURE-PKG' }, manager)),
    ]);
    expect(results).toHaveLength(4);
    expect(await counts()).toEqual({ batches: 6, events: 6 });
    expect((await db.query('SELECT count(DISTINCT batch_no)::int AS n FROM inv_batches'))[0].n).toBe(6);
  });

  it('rolls back a direct caller batch when its ledger write fails', async () => {
    await db.query('ALTER TABLE inv_ledger ADD CONSTRAINT fixture_reject_second_item CHECK (qty_change <> 22)');
    const core = new EggInventoryService(db, cls as never);
    await expect(core.createProductionBatch({ companyCode: 'COMP-A', eggDate: '2026-10-17',
      productCode: 'PRD-EGG-RAW', qualityGrade: 'GRADE_1', qty: 22 })).rejects.toThrow();
    expect(await counts()).toEqual({ batches: 0, events: 0 });
  });

  it('allocates beyond numeric suffix gaps while excluding terminal custom batch formats', async () => {
    await db.query(`INSERT INTO inv_batches(batch_no) VALUES
      ('EGG-20261017-00001'), ('EGG-20261017-00003'), ('EGG-20261017-HOUSE-A-99999')`);
    const result = await service.recordProductionInbound({ ...payload(), items: [{ grade: 'GRADE_1', qty: 1 }] });
    expect(result.batches[0].batchNo).toBe('EGG-20261017-00004');
    expect(await counts()).toEqual({ batches: 4, events: 1 });
  });

  it('rejects exhausted numeric suffix capacity without inserting a batch or event', async () => {
    await db.query('INSERT INTO inv_batches(batch_no) VALUES ($1)', [`EGG-20261017-${'9'.repeat(51)}`]);
    await expect(service.recordProductionInbound(payload())).rejects.toThrow('批号已超出允许范围');
    expect(await counts()).toEqual({ batches: 1, events: 0 });
  });

});
