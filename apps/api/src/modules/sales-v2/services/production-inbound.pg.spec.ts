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
      CREATE TABLE IF NOT EXISTS mst_products (product_code text PRIMARY KEY, status text);
      CREATE TABLE IF NOT EXISTS packaging_specs (spec_code text PRIMARY KEY, status text);
      CREATE TABLE IF NOT EXISTS product_grades (grade_code text PRIMARY KEY, status text, sort_order int, is_saleable boolean DEFAULT true, is_storable boolean DEFAULT true);
      CREATE TABLE IF NOT EXISTS product_skus (sku_code text PRIMARY KEY, product_code text, grade_code text, spec_code text, status text, effective_date date, expire_date date);
      CREATE TABLE IF NOT EXISTS sys_organizations (org_code text PRIMARY KEY, company_code text, org_type text, status text);
      CREATE TABLE IF NOT EXISTS brd_farms (farm_code text PRIMARY KEY, company_code text, mapped_site_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_houses (house_code text PRIMARY KEY, farm_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_daily_logs (id serial PRIMARY KEY, log_date date, house_code text, eggs_by_grade jsonb);
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
      CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_batches_temp_production_source_identity
        ON inv_batches (company_code, source_type, source_no,
          COALESCE(sku_code, ''), COALESCE(grade_code_std, quality_grade, ''), COALESCE(spec_code, packaging_spec, ''))
        WHERE source_type = 'TEMP_PRODUCTION' AND source_no IS NOT NULL;
      TRUNCATE inv_ledger, inv_batches, product_skus, product_grades, mst_products, packaging_specs, sys_organizations,
        brd_farms, brd_houses, brd_daily_logs, wms_warehouses, wms_locations RESTART IDENTITY;
    `);
    await db.query("INSERT INTO mst_products VALUES ('PRD-EGG-RAW','ACTIVE')");
    await db.query("INSERT INTO packaging_specs VALUES ('LOOSE','ACTIVE')");
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
    await db.query('TRUNCATE inv_ledger, inv_batches, brd_daily_logs RESTART IDENTITY');
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
    expect(new Set(retry.batches.map(row => row.batchNo)).size).toBe(1);
    expect(retry.batches.map(row => row.qty)).toEqual([33]);
    expect(await counts()).toEqual({ batches: 1, events: 1 });
  });

  it('serializes simultaneous duplicate requests without creating extra batches or ledger events', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => service.recordProductionInbound(payload())));
    expect(results.filter(row => !row.idempotent)).toHaveLength(1);
    for (const result of results) expect(result.batches).toEqual(results[0].batches);
    expect(await counts()).toEqual({ batches: 1, events: 1 });
  });

  it('blocks a competing changed payload and leaves the committed stock unchanged', async () => {
    const first = await service.recordProductionInbound(payload());
    const changed = { ...payload(), items: [{ grade: 'GRADE_1', qty: 99 }] };
    const outcomes = await Promise.allSettled([service.recordProductionInbound(payload()), service.recordProductionInbound(changed)]);
    expect(outcomes.map(row => row.status)).toEqual(['fulfilled', 'rejected']);
    expect((await service.recordProductionInbound(payload())).batches).toEqual(first.batches);
    expect(await counts()).toEqual({ batches: 1, events: 1 });
    expect((await db.query('SELECT sum(qty)::int AS qty FROM inv_batches'))[0].qty).toBe(33);
  });

  it('never allows inbound quantities to exceed the daily report grade allowance', async () => {
    await db.query(
      `INSERT INTO brd_daily_logs (log_date, house_code, eggs_by_grade)
       VALUES ('2026-10-17', 'HOUSE-A', $1::jsonb)`,
      [JSON.stringify({ GRADE_1: 100, GRADE_2: 20 })],
    );

    await expect(service.recordProductionInbound({
      ...payload(), items: [{ grade: 'GRADE_1', qty: 101 }],
    })).rejects.toThrow('超过日报剩余额度');
    expect(await counts()).toEqual({ batches: 0, events: 0 });

    await expect(service.recordProductionInbound({
      ...payload(), items: [{ grade: 'GRADE_1', qty: 100 }],
    })).resolves.toMatchObject({ totalInbound: 100 });
    // A different key on the SAME daily document is not a second document:
    // the daily dimension already holds committed stock, so a changed
    // repost is refused as a document conflict, not as an allowance loan.
    await expect(service.recordProductionInbound({
      ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-zzz', items: [{ grade: 'GRADE_1', qty: 1 }],
    })).rejects.toThrow('已存在但数量或档位不同');
    // The exact same posting under yet another key replays idempotently.
    await expect(service.recordProductionInbound({
      ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-yyy', items: [{ grade: 'GRADE_1', qty: 100 }],
    })).resolves.toMatchObject({ idempotent: true, totalInbound: 100 });
    await expect(service.recordProductionInbound({
      ...payload(), idempotencyKey: 'DAILY-2026-10-18-HOUSE-A-xxx', items: [{ grade: 'GRADE_1', qty: 1 }],
    })).rejects.toThrow('idempotencyKey 必须形如');
  });

  it('cannot double-consume one daily allowance from two concurrent different-key posts', async () => {
    await db.query(
      `INSERT INTO brd_daily_logs (log_date, house_code, eggs_by_grade)
       VALUES ('2026-10-17', 'HOUSE-A', $1::jsonb)`,
      [JSON.stringify({ GRADE_1: 100 })],
    );
    // Two DIFFERENT keys, two DIFFERENT quantities, one allowance: only one
    // posting may win; the loser must fail without writing anything.
    const outcomes = await Promise.allSettled([
      service.recordProductionInbound({ ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-fast', items: [{ grade: 'GRADE_1', qty: 60 }] }),
      service.recordProductionInbound({ ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-slow', items: [{ grade: 'GRADE_1', qty: 70 }] }),
    ]);
    expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const winner = outcomes.find(row => row.status === 'fulfilled') as PromiseFulfilledResult<any>;
    expect(winner.value.totalInbound).toBeLessThanOrEqual(100);
    const batchQty = (await db.query('SELECT COALESCE(SUM(qty),0)::int AS qty FROM inv_batches'))[0].qty;
    expect(batchQty).toBe(winner.value.totalInbound);
    // After a win, ANY further different-quantity post under another key is
    // a document conflict — the daily dimension holds exactly one truth.
    const losers = await Promise.allSettled([
      service.recordProductionInbound({ ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-t1', items: [{ grade: 'GRADE_1', qty: 30 }] }),
      service.recordProductionInbound({ ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-t2', items: [{ grade: 'GRADE_1', qty: 30 }] }),
    ]);
    expect(losers.map(row => row.status)).toEqual(['rejected', 'rejected']);
    for (const loser of losers) expect((loser as PromiseRejectedResult).reason.message).toContain('已存在但数量或档位不同');
    expect((await db.query('SELECT COALESCE(SUM(qty),0)::int AS qty FROM inv_batches'))[0].qty).toBe(batchQty);
  });

  it('rolls back every batch and event if a later ledger insert fails, then permits a clean retry', async () => {
    await db.query('ALTER TABLE inv_ledger ADD CONSTRAINT fixture_reject_second_item CHECK (qty_change <> 22)');
    try {
      await expect(service.recordProductionInbound({
        ...payload(), items: [{ grade: 'GRADE_1', qty: 11 }, { grade: 'GRADE_2', qty: 22 }],
      })).rejects.toThrow();
      expect(await counts()).toEqual({ batches: 0, events: 0 });
    } finally { await db.query('ALTER TABLE inv_ledger DROP CONSTRAINT fixture_reject_second_item'); }
    expect(await service.recordProductionInbound(payload())).toMatchObject({ idempotent: false, totalInbound: 33 });
    expect(await counts()).toEqual({ batches: 1, events: 1 });
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
    // A key bound to another date is rejected by key discipline before any stock work.
    { name: 'date', changed: { eggDate: '2026-10-18' }, message: 'idempotencyKey 必须形如', status: 400 },
    // Another house is another document AND another company: scope refuses it.
    { name: 'house', changed: { houseCode: 'HOUSE-B', warehouseCode: 'WH-B', locationCode: 'LOC-B' }, message: '无权向公司', status: 403 },
    // Same house, different stock destination: the daily document's
    // provenance must match exactly, or the repost is refused.
    { name: 'warehouse', changed: { warehouseCode: 'WH-A2', locationCode: 'LOC-A2' }, message: '来源或库存归属不一致', status: 400 },
    { name: 'location', changed: { locationCode: 'LOC-A-OTHER' }, message: '来源或库存归属不一致', status: 400 },
  ])('rejects a repost that diverges from the committed daily document across $name', async ({ changed, message, status }) => {
    const request = { ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-CUSTOM' };
    const original = await service.recordProductionInbound(request);
    // Revoke the original warehouse, while the new requested warehouse is authorized.
    scope.allowedWarehouseCodes = ['WH-A', 'WH-A2', 'WH-B'];
    const error = await service.recordProductionInbound({ ...request, ...changed }).catch(e => e);
    expect(error.getStatus()).toBe(status);
    expect(error.message).toContain(message);
    original.batches.forEach(batch => expect(error.message).not.toContain(batch.batchNo));
    expect(await counts()).toEqual({ batches: 1, events: 1 });
  });

  it('fails closed for provenance-stripped rows through the DB source identity, and preserves exact-context retries', async () => {
    const request = { ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-HISTORY' };
    const first = await service.recordProductionInbound(request);
    expect((await service.recordProductionInbound(request)).batches).toEqual(first.batches);
    await db.query('UPDATE inv_batches SET collection_batch_ref=NULL');
    // The daily dimension no longer sees the row, but its source identity is
    // still owned: the production source-identity index refuses the duplicate.
    await expect(service.recordProductionInbound(request)).rejects.toThrow();
    expect(await counts()).toEqual({ batches: 1, events: 1 });
  });

  it('rejects oversized keys and invalid dates without writing inventory', async () => {
    await expect(service.recordProductionInbound({ ...payload(), idempotencyKey: 'a'.repeat(65) })).rejects.toThrow('64');
    for (const eggDate of ['2026-02-30', '20261017', '0000-01-01']) {
      await expect(service.recordProductionInbound({ ...payload(), eggDate })).rejects.toThrow('YYYY-MM-DD');
    }
    expect(await counts()).toEqual({ batches: 0, events: 0 });
  });

  it('serializes different keys on the same day into ONE daily document', async () => {
    // One house/day is ONE production-inbound document regardless of caller
    // keys: five concurrent different-key posts of the same payload must
    // collapse to a single committed batch set, not five documents.
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => service.recordProductionInbound({
      ...payload(), idempotencyKey: `DAILY-2026-10-17-HOUSE-A-${i}`,
    })));
    expect(results.filter(result => !result.idempotent)).toHaveLength(1);
    for (const result of results) expect(result.batches).toEqual(results[0].batches);
    expect(await counts()).toEqual({ batches: 1, events: 1 });
  });

  it('shares numbering across companies, direct callers and callers supplying a transaction', async () => {
    scope.isGlobal = true;
    const core = new EggInventoryService(db, cls as never);
    const direct = { companyCode: 'COMP-A', warehouseCode: 'WH-A', locationCode: 'LOC-A',
      eggDate: '2026-10-17', productCode: 'PRD-EGG-RAW', qualityGrade: 'GRADE_1', qty: 3 };
    const results = await Promise.all([
      service.recordProductionInbound({ ...payload(), idempotencyKey: 'DAILY-2026-10-17-HOUSE-A-SHARED' }),
      service.recordProductionInbound({ ...payload(), houseCode: 'HOUSE-B', warehouseCode: 'WH-B', locationCode: 'LOC-B', idempotencyKey: 'DAILY-2026-10-17-HOUSE-B-SHARED' }),
      core.createProductionBatch(direct),
      db.transaction(manager => core.createProductionBatch({ ...direct, sourceType: 'PACKAGING',
        ledgerChangeType: 'PACKAGING_INBOUND', packagingBatchRef: 'FIXTURE-PKG' }, manager)),
    ]);
    expect(results).toHaveLength(4);
    expect(await counts()).toEqual({ batches: 4, events: 4 });
    expect((await db.query('SELECT count(DISTINCT batch_no)::int AS n FROM inv_batches'))[0].n).toBe(4);
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
