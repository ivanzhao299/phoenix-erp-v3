import { installProductionInboundFixture } from './production-inbound.pg-fixture';
import {FlockLifecycleLedger1794900000000} from '../../../database/migrations/1794900000000-FlockLifecycleLedger';
import {FlockProductionProvenance1794901000000} from '../../../database/migrations/1794901000000-FlockProductionProvenance';
import {FlockActivitySources1794902000000} from '../../../database/migrations/1794902000000-FlockActivitySources';
import {FlockLifecycleService} from '../../farm/flock-lifecycle.service';
import {PackagingInventoryIntegrationService} from './packaging-inventory-integration.service';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ProductionInboundService } from './production-inbound.service';
import { LookupController } from '../../product-master/controllers/lookup.controller';
import { EggInventoryService } from './egg-inventory.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import { EggSourceProfiles1794400001000 } from '../../../database/migrations/1794400001000-EggSourceProfiles';

// Explicit disposable fixture only; never load application environment or migrations.
const fixtureUrl = process.env.ISSUE381_PG_URL;
const fixture = fixtureUrl ? describe : describe.skip;

fixture('Issue 381 real PostgreSQL inbound transactions and retries', () => {
  let db: DataSource;
  let service: ProductionInboundService;
  let scope: { isGlobal: boolean; allowedCompanyCodes: string[]; allowedWarehouseCodes: string[] };
  const grades = ['GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'BROKEN'];
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
    await installProductionInboundFixture(db, grades);
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy(); });
  beforeEach(async () => {
    await db.query('ALTER TABLE inv_ledger DROP CONSTRAINT IF EXISTS fixture_reject_second_item');
    await db.query(`TRUNCATE inv_ledger,inv_batches,brd_daily_logs,inv_flock_source_links,brd_egg_source_receipts,brd_egg_day_routes,
      brd_flock_events,brd_flock_document_audits,brd_flock_daily_balances,brd_flock_balances,brd_flock_occupancies,brd_flock_held_balances,
      brd_flock_house_states,brd_flock_documents,pkg_source_batches,pkg_grading_records,pkg_grading_source_links,pkg_packing_records RESTART IDENTITY CASCADE;
      UPDATE brd_flocks SET current_qty=1000;`);
    scope = { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'] };
    service = new ProductionInboundService(db, cls as never, new EggInventoryService(db, cls as never),
      { resolveMode: async () => 'TEMP_PRODUCTION_INBOUND' } as never, new OrgOwnershipService(db.manager),
      new SkuAvailabilityService(db));
  });
  const counts = async () => (await db.query('SELECT (SELECT count(*)::int FROM inv_batches) AS batches, (SELECT count(*)::int FROM inv_ledger) AS events'))[0];

  it('refuses company-denied stock even when a site row attempts to grant it', async () => {
    await db.query("UPDATE md_sku_org_scope SET stock_enabled=false WHERE sku_code='SKU-GRADE_1' AND scope_type='COMPANY' AND scope_code='COMP-A'");
    await db.query("INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code) VALUES ('SKU-GRADE_1','SITE','SITE-A')");
    try {
      await expect(service.recordProductionInbound(payload())).rejects.toThrow('不适用于公司');
      expect(await counts()).toEqual({ batches: 0, events: 0 });
    } finally {
      await db.query("DELETE FROM md_sku_org_scope WHERE sku_code='SKU-GRADE_1' AND scope_type='SITE'");
      await db.query("UPDATE md_sku_org_scope SET stock_enabled=true WHERE sku_code='SKU-GRADE_1' AND scope_type='COMPANY' AND scope_code='COMP-A'");
    }
  });

  it('requires an approved house source profile and does not fall back to biological breed mappings', async () => {
    await db.query("UPDATE md_egg_source_profiles SET status='INACTIVE' WHERE profile_code='PROFILE-A'");
    try {
      await expect(service.recordProductionInbound(payload())).rejects.toThrow('缺少有效来源档案');
      expect(await counts()).toEqual({ batches: 0, events: 0 });
    } finally { await db.query("UPDATE md_egg_source_profiles SET status='ACTIVE' WHERE profile_code='PROFILE-A'"); }
  });

  it('does not apply a newly effective commercial house profile to an earlier egg date', async () => {
    await db.query("UPDATE md_egg_source_profiles SET effective_date='2026-10-18' WHERE profile_code='PROFILE-A'");
    try {
      await expect(service.recordProductionInbound(payload())).rejects.toThrow('缺少有效来源档案');
      expect(await counts()).toEqual({ batches: 0, events: 0 });
    } finally { await db.query("UPDATE md_egg_source_profiles SET effective_date='2026-01-01' WHERE profile_code='PROFILE-A'"); }
  });

  it('uses the explicit commercial source without inventing a genetic breed for unknown metadata', async () => {
    await db.query("UPDATE brd_flocks SET breed_code=NULL WHERE flock_no='FLOCK-A'");
    try {
      const result = await service.recordProductionInbound(payload());
      expect(result.batches).toEqual([expect.objectContaining({ varietyCode: 'EGG_RED', qty: 33 })]);
      const [batch] = await db.query('SELECT source_profile_code,source_profile_snapshot FROM inv_batches');
      expect(batch.source_profile_code).toBe('PROFILE-A');
      expect(batch.source_profile_snapshot).toEqual([expect.objectContaining({ profileCode: 'PROFILE-A', houseCode: 'HOUSE-A', productMode: 'VARIANT', varietyCode: 'EGG_RED' })]);
      expect((await db.query("SELECT breed_code FROM brd_flocks WHERE flock_no='FLOCK-A'"))[0].breed_code).toBeNull();
    } finally { await db.query("UPDATE brd_flocks SET breed_code='TEST_RED' WHERE flock_no='FLOCK-A'"); }
  });

  it('preserves ordinary STANDARD egg identity without inventing a shell-color variety', async () => {
    const request = { ...payload(), houseCode: 'HOUSE-A2' };
    const first = await service.recordProductionInbound(request);
    expect(first.batches).toEqual([expect.objectContaining({ productCode: 'PRD-STD', varietyCode: null, qty: 33 })]);
    const [batch] = await db.query('SELECT sku_code,variety_code,source_profile_code,source_profile_snapshot FROM inv_batches');
    expect(batch).toMatchObject({ sku_code: 'SKU-STD', variety_code: null, source_profile_code: 'PROFILE-A2',
      source_profile_snapshot: [expect.objectContaining({ productMode: 'STANDARD', varietyCode: null, houseCode: 'HOUSE-A2' })] });
    expect((await service.recordProductionInbound(request)).batches).toEqual(first.batches);
  });

  it('replays original batch identities and quantities for two shifts sharing a grade', async () => {
    const first = await service.recordProductionInbound(payload());
    const retry = await service.recordProductionInbound(payload());
    expect(first.idempotent).toBe(false);
    expect((await db.query('SELECT unit,base_quantity_version FROM inv_batches'))[0]).toEqual({ unit: '枚', base_quantity_version: 1 });
    expect(retry).toMatchObject({ idempotent: true, totalInbound: 33, batches: first.batches });
    expect(new Set(retry.batches.map(row => row.batchNo)).size).toBe(1);
    expect(retry.batches.map(row => row.qty)).toEqual([33]);
    expect(await counts()).toEqual({ batches: 1, events: 1 });
  });

  it('replays the original inbound amount after current stock falls', async () => {
    const first = await service.recordProductionInbound(payload());
    await db.query('UPDATE inv_batches SET qty=3,qty_available=3 WHERE batch_no=$1', [first.batches[0].batchNo]);
    const replay = await service.recordProductionInbound(payload());
    expect(replay).toMatchObject({ totalInbound: 33, idempotent: true, batches: first.batches });
    expect(await counts()).toEqual({ batches: 1, events: 1 });
    expect((await db.query('SELECT qty::int AS qty FROM inv_batches'))[0].qty).toBe(3);
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

  it('previews and posts the dated pink product by actual grade while preserving earlier red stock', async () => {
    const lookup = new LookupController(undefined as never,db.manager,
      {get:()=>({userId:'fixture'})} as never,
      {resolve:async()=>({isGlobal:false,allowedFarmCodes:['FARM-A']})} as never,undefined as never);
    const preview = (date:string, house='HOUSE-A', company='COMP-A') => lookup.eggSourceProfile(house,date,company);
    const original = await service.recordProductionInbound(payload());
    try {
      await db.query(`UPDATE md_egg_source_profiles SET expire_date='2026-10-17' WHERE profile_code='PROFILE-A';
        UPDATE md_product_varieties SET variety_name='Red',shell_color='RED' WHERE variety_code='EGG_RED';
        INSERT INTO md_product_varieties(variety_code,variety_name,shell_color,status) VALUES('TEST-PINK','Pink','PINK','ACTIVE');
        INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,product_mode,variety_code,effective_date)
          VALUES('TEST-PINK-PROFILE','COMP-A','FARM-A','SITE-A','HOUSE-A','VARIANT','TEST-PINK','2026-10-18');
        INSERT INTO mst_products(product_code,status,unit,unit_zh,variety_code) VALUES('TEST-PINK-P','ACTIVE','枚','枚','TEST-PINK');
        INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,status,variety_code)
          SELECT 'TEST-PINK-'||grade,'TEST-PINK-P',grade,'LOOSE','ACTIVE','TEST-PINK' FROM unnest(ARRAY['GRADE_1','GRADE_2']) grade;
        INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code) VALUES('TEST-PINK-GRADE_1','COMPANY','COMP-A'),('TEST-PINK-GRADE_2','COMPANY','COMP-A');
        INSERT INTO brd_daily_logs(log_date,house_code,eggs_by_grade) VALUES('2026-10-18','HOUSE-A','{"GRADE_1":3,"GRADE_2":5}')`);
      expect((await preview('2026-10-17')).data).toMatchObject({shellColor:'RED'});
      expect((await preview('2026-10-18')).data).toMatchObject({shellColor:'PINK',varietyCode:'TEST-PINK'});
      expect((await preview('2026-10-18','HOUSE-A2')).data).toMatchObject({productMode:'STANDARD',varietyCode:null,shellColor:null});
      expect((await preview('2026-10-18','HOUSE-A','COMP-B')).data).toBeNull();
      expect((await preview('2026-10-18','HOUSE-B','COMP-B')).data).toBeNull();
      expect((await preview('2025-01-01')).data).toBeNull();
      const pink=await service.recordProductionInbound({...payload(),eggDate:'2026-10-18',items:[
        {grade:'GRADE_1',qty:3},{grade:'GRADE_2',qty:5},
      ]});
      expect(pink.batches.map(b=>[b.grade,b.qty,b.varietyCode])).toEqual([['GRADE_1',3,'TEST-PINK'],['GRADE_2',5,'TEST-PINK']]);
      expect((await service.recordProductionInbound(payload())).batches).toEqual(original.batches);
      await db.query("UPDATE md_egg_source_profiles SET expire_date=NULL WHERE profile_code='PROFILE-A'");
      await expect(preview('2026-10-18')).rejects.toThrow('重叠');
      await expect(service.recordProductionInbound({...payload(),eggDate:'2026-10-19'})).rejects.toThrow('重叠');
      expect(await counts()).toEqual({batches:3,events:3});
    } finally {
      await db.query(`DELETE FROM md_egg_source_profiles WHERE profile_code='TEST-PINK-PROFILE';
        UPDATE md_egg_source_profiles SET expire_date=NULL WHERE profile_code='PROFILE-A';
        DELETE FROM md_sku_org_scope WHERE sku_code LIKE 'TEST-PINK-%';
        DELETE FROM product_skus WHERE sku_code LIKE 'TEST-PINK-%';
        DELETE FROM mst_products WHERE product_code='TEST-PINK-P';
        DELETE FROM md_product_varieties WHERE variety_code='TEST-PINK'`);
    }
  });

  it('respects an explicitly zero grade allowance and rejects malformed historical quantities', async () => {
    for (const grades of [{ GRADE_1: 0 }, { GRADE_1: 0.9 }, { GRADE_1: true }]) {
      await db.query("INSERT INTO brd_daily_logs(log_date,house_code,eggs_by_grade) VALUES($1,$2,$3)", [
        payload().eggDate, payload().houseCode, JSON.stringify(grades),
      ]);
      await expect(service.recordProductionInbound({ ...payload(), items: [{ grade: 'GRADE_1', qty: 1 }] })).rejects.toThrow();
      expect(await counts()).toEqual({ batches: 0, events: 0 });
      await db.query('DELETE FROM brd_daily_logs');
    }
  });

  it('requires unambiguous shifts and graded quantities for all producing reports', async () => {
    await db.query(`INSERT INTO brd_daily_logs(log_date,house_code,shift,eggs_produced,eggs_by_grade) VALUES
      ('2026-10-17','HOUSE-A','AM',10,'{"GRADE_1":0}'),('2026-10-17','HOUSE-A','PM',5,'{"GRADE_1":5}')`);
    const request={...payload(),items:[{grade:'GRADE_1',qty:5}]};
    await expect(service.recordProductionInbound(request)).rejects.toThrow('未核实');
    await db.query("UPDATE brd_daily_logs SET shift='DAILY',eggs_by_grade=jsonb_build_object('GRADE_1',10) WHERE shift='AM'");
    await expect(service.recordProductionInbound(request)).rejects.toThrow('重复覆盖');
    expect(await counts()).toEqual({batches:0,events:0});
  });

  it('holds an older house-day batch with only its original source number for reconciliation', async () => {
    await service.recordProductionInbound(payload());
    await db.query("UPDATE inv_batches SET collection_batch_ref=NULL, source_no='TEMP-2026-10-17-HOUSE-A'");
    await expect(service.recordProductionInbound(payload())).rejects.toThrow();
    expect(await counts()).toEqual({ batches: 1, events: 1 });
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
    const allGrades = { ...payload(), items: grades.map((grade, i) => ({ grade, qty: i + 1 })) };
    expect(await service.recordProductionInbound(allGrades)).toMatchObject({ totalInbound: 36 });
    expect(await db.query('SELECT * FROM inv_batches WHERE batch_no=$1', [old.batches[0].batchNo])).toEqual(before);
    const rows = await db.query("SELECT grade_code_std, sku_code, warehouse_code, location_code FROM inv_batches WHERE egg_date='2026-10-17' ORDER BY id");
    rows.forEach((row: Record<string, string>, i: number) => expect(row).toMatchObject({ grade_code_std: grades[i], sku_code: `SKU-${grades[i]}`, warehouse_code: 'WH-A', location_code: 'LOC-A' }));
    await expect(service.recordProductionInbound({ ...payload(), houseCode: 'HOUSE-B', warehouseCode: 'WH-B', locationCode: 'LOC-B' })).rejects.toThrow('无权向公司');
    scope.allowedWarehouseCodes = [];
    await expect(service.recordProductionInbound({ ...payload(), eggDate: '2026-10-18' })).rejects.toThrow('无权向仓库');
    expect(await counts()).toEqual({ batches: 9, events: 9 });
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
      eggDate: '2026-10-17', productCode: 'PRD-EGG-RAW', skuCode: 'SKU-GRADE_1', varietyCode: 'EGG_RED',
      sourceProfileCode: 'PROFILE-A', houseCode: 'HOUSE-A', farmCode: 'FARM-A', siteCode: 'SITE-A', qualityGrade: 'GRADE_1', qty: 3 };
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
    await expect(core.createProductionBatch({ companyCode: 'COMP-A', eggDate: '2026-10-17', warehouseCode: 'WH-A', locationCode: 'LOC-A',
      productCode: 'PRD-EGG-RAW', skuCode: 'SKU-GRADE_1', varietyCode: 'EGG_RED',
      sourceProfileCode: 'PROFILE-A', houseCode: 'HOUSE-A', farmCode: 'FARM-A', siteCode: 'SITE-A',
      qualityGrade: 'GRADE_1', qty: 22 })).rejects.toThrow('fixture_reject_second_item');
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

  async function activateSource(){
    const lifecycle=new FlockLifecycleService(db.manager);const system={id:'fixture-system',admin:true},reviewer={id:'fixture-reviewer',admin:true};
    const global={isGlobal:true,farmCode:null,siteCode:null};
    let d=await lifecycle.create({kind:'BASELINE',sourceKey:'approved-count',houseCode:'HOUSE-A',flockNo:'FLOCK-A',businessDate:'2026-11-10',quantity:1000,expectedLegacyQty:1000,expectedVersion:0,
      evidence:['FILE-count'],responsible:'fixture-system',reason:'owned physical-count fixture',differenceReceipt:'COUNT-RECEIPT'},global,system);
    d=await lifecycle.transition(d.id,'submit',0,global,system);d=await lifecycle.transition(d.id,'approve',d.version,global,reviewer);await lifecycle.transition(d.id,'post',d.version,global,system);
    await db.query(`INSERT INTO brd_daily_logs(log_date,house_code,flock_no,shift,eggs_by_grade,eggs_produced,occupancy_id)
      SELECT '2026-11-11','HOUSE-A','FLOCK-A','DAILY','{"GRADE_1":100}',100,id FROM brd_flock_occupancies WHERE flock_no='FLOCK-A';
      INSERT INTO pkg_source_batches VALUES(1,'HOUSE-A','FLOCK-A',50,'2026-11-11','2026-11-11',false);
      INSERT INTO pkg_grading_records VALUES(1,'FIXTURE-GRADING',false);INSERT INTO pkg_grading_source_links VALUES(1,1,50);
      INSERT INTO pkg_packing_records VALUES('FIXTURE-PACKING','FIXTURE-GRADING','["FIXTURE-GRADING"]',false);`);
  }
  it('serializes the actual production orchestrator and packaging batch writer without deadlock, rejecting the second source route atomically',async()=>{
    await activateSource();const core=new EggInventoryService(db,cls as never);
    const packing=new PackagingInventoryIntegrationService(db,cls as never,core,{resolveMode:async()=> 'PACKAGING_INBOUND'} as never);
    const production=service.recordProductionInbound({...payload(),eggDate:'2026-11-11',items:[{grade:'GRADE_1',qty:50}]});
    const packaged=db.transaction(async manager=>{
      await manager.query("SET LOCAL statement_timeout='8s'");
      return (packing as any).createSaleableBatch('COMP-A','2026-11-11','GRADE_1',50,'FIXTURE-PACKING',null,'LOOSE','SKU-GRADE_1','PRD-EGG-RAW','EGG_RED',
        [{profileCode:'PROFILE-A',houseCode:'HOUSE-A'}],'AVAILABLE',{manager,warehouseCode:'WH-A',locationCode:'LOC-A'});
    });
    const results=await Promise.allSettled([production,packaged]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const failure=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(String(failure.reason.message)).toContain('两路重复入账');
    expect(await counts()).toEqual({batches:1,events:1});
    expect(Number((await db.query('SELECT COUNT(*) AS n FROM inv_flock_source_links'))[0].n)).toBe(1);
    expect((await db.query('SELECT quantity FROM brd_egg_source_receipts'))).toHaveLength(1);
  });
  it('binds actual production stock to the exact report and occupancy and refuses another farm grant',async()=>{
    await activateSource();
    Object.assign(scope,{allowedBreedingCompanyCodes:[],allowedBreedingSiteCodes:[],allowedBreedingFarmCodes:['FARM-B']});
    await expect(service.recordProductionInbound({...payload(),eggDate:'2026-11-11',items:[{grade:'GRADE_1',qty:50}]})).rejects.toThrow('无权认领');expect(await counts()).toEqual({batches:0,events:0});
    Object.assign(scope,{allowedBreedingFarmCodes:['FARM-A']});
    await service.recordProductionInbound({...payload(),eggDate:'2026-11-11',items:[{grade:'GRADE_1',qty:50}]});
    const [link]=await db.query('SELECT * FROM inv_flock_source_links');expect(link).toMatchObject({flock_no:'FLOCK-A',house_code:'HOUSE-A',precision:'EXACT'});
    expect(link.allocated_output_qty).toBe('50');expect(link.occupancy_id).toBe((await db.query("SELECT id FROM brd_flock_occupancies WHERE flock_no='FLOCK-A'"))[0].id);
    expect((await db.query('SELECT breed_code FROM brd_flocks WHERE flock_no=$1',['FLOCK-A']))[0].breed_code).toBe('TEST_RED');
  });

});
