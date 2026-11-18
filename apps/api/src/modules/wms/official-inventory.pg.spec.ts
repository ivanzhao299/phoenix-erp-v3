import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { sharedBatches, QuantitySnapshot } from '../product-master/services/quantity-contract';
import { OfficialInventoryCutover1794971000000 } from '../../database/migrations/1794971000000-OfficialInventoryCutover';
import { assertOfficialInventoryBatches, officialInventoryPredicate, officialLedgerPredicate } from './official-inventory';

const url = process.env.OFFICIAL_INVENTORY_PG_URL;
const fixture = url ? describe : describe.skip;

fixture('official inventory cutover — owned PostgreSQL 18', () => {
  let db: DataSource;
  const schema = `official_inventory_${process.pid}`;
  const snapshot: QuantitySnapshot = { version: 1, basis: 'BASE', productCode: 'PRD-EGG-TEST',
    gradeCode: 'GRADE_1', skuCode: 'SKU-EGG-TEST', specCode: 'LOOSE', baseUnit: '枚',
    tradeUnit: '枚', factor: 1, baseQty: 10 };

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1'
      || !['/phoenix_temp_reversal_fixture','/installments_fixture'].includes(parsed.pathname)) {
      throw new Error('Owned loopback fixture required');
    }
    db = await new DataSource({ type: 'postgres', url, entities: [], synchronize: false,
      migrationsRun: false, installExtensions: false,
      extra: { options: `-c search_path=${schema}`, max: 6 } }).initialize();
    const [{ server_version: actual }] = await db.query('SHOW server_version');
    if (!actual?.startsWith('18.')) throw new Error('PostgreSQL 18 required');
    await db.query(`CREATE SCHEMA "${schema}";
      CREATE TABLE inv_batches(batch_no text PRIMARY KEY, company_code text, warehouse_code text,
        product_code text, sku_code text, grade_code_std text, unit text, material_code text,
        legacy_source text, base_quantity_version int, status text, qty numeric, qty_available numeric,
        expire_date date, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        source_type text, source_no text, egg_date date, collection_batch_ref text);
      CREATE TABLE product_skus(sku_code text PRIMARY KEY, product_code text);
      INSERT INTO product_skus VALUES('SKU-EGG-TEST','PRD-EGG-TEST');
      CREATE TABLE inv_ledger(id serial PRIMARY KEY,batch_no text,qty_change numeric)`);
    const runner = db.createQueryRunner();
    try { await runner.connect(); await new OfficialInventoryCutover1794971000000().up(runner); }
    finally { await runner.release(); }
  });
  beforeEach(async () => {
    await db.query(`TRUNCATE production_batch_roots,production_batch_qualifications,
      production_inventory_domains,production_cutover_scopes,inv_batches,inv_ledger;
      INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,grade_code_std,
        unit,base_quantity_version,status,qty,qty_available,source_type,source_no,egg_date,collection_batch_ref)
      VALUES ('OLD-TEST','CO-A','WH-SHARED','PRD-EGG-TEST','SKU-EGG-TEST','GRADE_1',
        '枚',1,'AVAILABLE',30,30,'TEMP_PRODUCTION','DAILY-2026-11-17-HOUSE-A','2026-11-17','HOUSE-HOUSE-A');
      INSERT INTO inv_batches SELECT 'OLD-CHILD',company_code,'WH-OTHER',product_code,sku_code,grade_code_std,
        unit,material_code,legacy_source,base_quantity_version,status,qty,qty_available,expire_date,created_at,
        updated_at,'TRANSFER','OLD-TRANSFER',egg_date,collection_batch_ref FROM inv_batches WHERE batch_no='OLD-TEST';
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,
        state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by,activated_at)
      VALUES('10000000-0000-0000-0000-000000000001','CO-A','HOUSE-A',1,'2026-11-18','DRAFT',
        'WH-SHARED','SYNTHETIC-FLOCK','SYNTHETIC-PROFILE',repeat('a',64),'{"fixture":true}','fixture',now());
      INSERT INTO production_inventory_domains VALUES
        ('10000000-0000-0000-0000-000000000001','CO-A','WH-SHARED','PRD-EGG-TEST');
      INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,
        disposition,origin_kind,origin_ref,evidence_sha256,created_by)
      VALUES('OLD-TEST','10000000-0000-0000-0000-000000000001','CO-A','PRD-EGG-TEST','SKU-EGG-TEST',
        'ARCHIVED_TEST','PRODUCTION','SYNTHETIC-ARCHIVE',repeat('a',64),'fixture'),
        ('OLD-CHILD','10000000-0000-0000-0000-000000000001','CO-A','PRD-EGG-TEST','SKU-EGG-TEST',
        'QUALIFIED','DERIVED','SYNTHETIC-TRANSFER',repeat('a',64),'fixture');
      INSERT INTO production_batch_roots VALUES('OLD-CHILD','OLD-TEST');
      INSERT INTO inv_ledger(batch_no,qty_change) VALUES(NULL,1),('MISSING-HISTORICAL',2),('OLD-TEST',30);
      UPDATE production_cutover_scopes SET state='FENCED';
      UPDATE production_cutover_scopes SET state='ACTIVE'`);
  });
  afterAll(async () => {
    if (db?.isInitialized) { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy(); }
  });

  it('rejects stale-snapshot inventory and ledger mutations instead of treating an unseen scope as OFF',async()=>{
    for(const sql of ["UPDATE inv_batches SET qty=qty-1 WHERE batch_no='OLD-TEST'",
      "INSERT INTO inv_ledger(batch_no,qty_change) VALUES('OLD-TEST',-1)"]){
      await expect(db.transaction('REPEATABLE READ',async m=>{await m.query('SELECT count(*) FROM inv_batches');await m.query(sql);})).rejects.toThrow('ISOLATION_HOLD');
    }
  });
  it('never puts the archived same-company / warehouse / SKU test batch in the shared FIFO pool', async () => {
    const rows = await db.transaction(manager => sharedBatches(manager, 'CO-A', ['WH-SHARED'], snapshot));
    expect(rows.map((row: { batch_no: string }) => row.batch_no)).not.toContain('OLD-TEST');
  });

  it('rejects direct batch use, archive mutation/deletion and a child outside the original warehouse', async () => {
    await expect(assertOfficialInventoryBatches(db, ['OLD-TEST'])).rejects.toThrow();
    await expect(assertOfficialInventoryBatches(db, ['OLD-CHILD'])).rejects.toThrow();
    for (const sql of ["UPDATE inv_batches SET status='AVAILABLE',qty_available=30 WHERE batch_no='OLD-TEST'",
      "UPDATE inv_batches SET product_code='MEDICINE',company_code='CO-B' WHERE batch_no='OLD-TEST'",
      "DELETE FROM inv_batches WHERE batch_no='OLD-TEST'"]) {
      await expect(db.query(sql)).rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    }
    expect((await db.query("SELECT qty FROM inv_batches WHERE batch_no='OLD-TEST'"))[0].qty).toBe('30');
  });

  async function insertBatch(batch: string, company = 'CO-A', product = 'PRD-EGG-TEST') {
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,
      grade_code_std,unit,base_quantity_version,status,qty,qty_available,source_type,source_no)
      VALUES($1,$2,'WH-SHARED',$3,CASE WHEN $3='MEDICINE' THEN 'SKU-MEDICINE' ELSE 'SKU-EGG-TEST' END,'GRADE_1','枚',1,'AVAILABLE',10,10,'PURCHASE','SYNTHETIC-EVIDENCE')`,
    [batch, company, product]);
  }
  async function qualify(batch: string, kind: string) {
    await db.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,
      sku_code,disposition,origin_kind,origin_ref,evidence_sha256,created_by,source_type,source_no)
      VALUES($1,'10000000-0000-0000-0000-000000000001','CO-A','PRD-EGG-TEST','SKU-EGG-TEST',
        'QUALIFIED',$2,'SYNTHETIC-EVIDENCE',repeat('b',64),'fixture','PURCHASE','SYNTHETIC-EVIDENCE')`, [batch, kind]);
  }

  it('rejects an unknown source even when labelled PURCHASE; preserves other companies and medicines', async () => {
    await expect(insertBatch('LAUNDERED')).rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    await insertBatch('OTHER-COMPANY', 'CO-B');
    await insertBatch('MEDICINE', 'CO-A', 'MEDICINE');
    await expect(assertOfficialInventoryBatches(db, ['OTHER-COMPANY','MEDICINE'])).resolves.toBeUndefined();
  });

  it('includes verified purchase and opening roots, while derived stock needs all qualified roots', async () => {
    await qualify('VERIFIED-PURCHASE', 'PURCHASE');
    await qualify('VERIFIED-OPENING', 'OPENING');
    await insertBatch('VERIFIED-PURCHASE'); await insertBatch('VERIFIED-OPENING');
    await qualify('NEW-CHILD', 'DERIVED');
    await expect(insertBatch('NEW-CHILD')).rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    await db.query("INSERT INTO production_batch_roots VALUES('NEW-CHILD','VERIFIED-PURCHASE')");
    await insertBatch('NEW-CHILD');
    const rows = await db.transaction(manager => sharedBatches(manager, 'CO-A', ['WH-SHARED'], snapshot));
    expect(rows.map((r: { batch_no: string }) => r.batch_no).sort())
      .toEqual(['NEW-CHILD','VERIFIED-OPENING','VERIFIED-PURCHASE']);
    await expect(db.query("INSERT INTO production_batch_roots VALUES('NEW-CHILD','OLD-TEST')"))
      .rejects.toThrow('CUTOVER_LINEAGE_IMMUTABLE');
    await qualify('MIXED-CHILD', 'DERIVED');
    await db.query("INSERT INTO production_batch_roots VALUES('MIXED-CHILD','VERIFIED-PURCHASE'),('MIXED-CHILD','OLD-TEST')");
    await expect(insertBatch('MIXED-CHILD')).rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    await expect(db.query("DELETE FROM production_batch_roots WHERE batch_no='MIXED-CHILD' AND root_batch_no='OLD-TEST'"))
      .rejects.toThrow('CUTOVER_LINEAGE_IMMUTABLE');
    const [{ total }] = await db.query(`SELECT sum(b.qty)::int AS total FROM inv_batches b WHERE ${officialInventoryPredicate()}`);
    expect(total).toBe(30);
  });

  it('keeps the feature inactive until fenced; suspension preserves reads and prevents operations', async () => {
    const [draft] = await db.query("SELECT to_jsonb(s)||'{\"state\":\"DRAFT\"}'::jsonb AS value FROM production_cutover_scopes s");
    await db.query('TRUNCATE production_batch_roots,production_batch_qualifications,production_inventory_domains,production_cutover_scopes');
    await db.query('INSERT INTO production_cutover_scopes SELECT (jsonb_populate_record(NULL::production_cutover_scopes,$1)).*',[draft.value]);
    await db.query("INSERT INTO production_inventory_domains VALUES('10000000-0000-0000-0000-000000000001','CO-A','WH-SHARED','PRD-EGG-TEST')");
    await insertBatch('OLD-API-COMPATIBLE');
    await db.query("UPDATE production_cutover_scopes SET state='FENCED'");
    await expect(insertBatch('LATE-OFFLINE')).rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    await db.query("UPDATE production_cutover_scopes SET state='ACTIVE'");
    await qualify('FORMAL', 'PRODUCTION'); await insertBatch('FORMAL');
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");
    await expect(assertOfficialInventoryBatches(db, ['FORMAL'], false)).resolves.toBeUndefined();
    await expect(assertOfficialInventoryBatches(db, ['FORMAL'])).rejects.toThrow();
    await expect(db.query("UPDATE inv_batches SET qty_available=9 WHERE batch_no='FORMAL'"))
      .rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
  });

  it('freezes scope/domain/qualification/identity and uses authoritative SKU identity', async () => {
    await expect(db.query("UPDATE production_cutover_scopes SET state='DRAFT'"))
      .rejects.toThrow('CUTOVER_MANIFEST_FROZEN');
    await expect(db.query('DELETE FROM production_inventory_domains')).rejects.toThrow('CUTOVER_DOMAIN_FROZEN');
    await expect(db.query("UPDATE production_batch_qualifications SET disposition='QUALIFIED' WHERE batch_no='OLD-TEST'"))
      .rejects.toThrow('CUTOVER_QUALIFICATION_IMMUTABLE');
    await expect(db.query("INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code) VALUES('SKU-LAUNDERED','CO-A','WH-SHARED',NULL,'SKU-EGG-TEST')"))
      .rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
    await qualify('FORMAL', 'PRODUCTION'); await insertBatch('FORMAL');
    await expect(db.query("UPDATE inv_batches SET batch_no='NEW-NAME',product_code='MEDICINE',sku_code=NULL WHERE batch_no='FORMAL'"))
      .rejects.toThrow('OFFICIAL_INVENTORY_IDENTITY_IMMUTABLE');
    await expect(db.query("DELETE FROM inv_batches WHERE batch_no='FORMAL'"))
      .rejects.toThrow('OFFICIAL_INVENTORY_IDENTITY_IMMUTABLE');
  });

  it('keeps missing-batch/null historical ledger facts while excluding rejected batches', async () => {
    const rows = await db.query(`SELECT qty_change::int AS qty FROM inv_ledger WHERE ${officialLedgerPredicate()} ORDER BY qty_change`);
    expect(rows.map((r: { qty: number }) => r.qty)).toEqual([1,2]);
    await expect(db.query("INSERT INTO inv_ledger(batch_no,qty_change) VALUES('OLD-TEST',30)"))
      .rejects.toThrow('OFFICIAL_INVENTORY_SOURCE_REJECTED');
  });

  it('is idempotent and refuses down after scope evidence exists', async () => {
    const runner = db.createQueryRunner();
    try {
      await runner.connect(); const migration = new OfficialInventoryCutover1794971000000();
      await migration.up(runner);
      await expect(migration.down(runner)).rejects.toThrow('OFFICIAL_INVENTORY_ROLLBACK_BLOCKED');
    } finally { await runner.release(); }
  });

  async function prepareDraft() {
    const [draft] = await db.query(`SELECT to_jsonb(s)||'{"state":"DRAFT"}'::jsonb AS value FROM production_cutover_scopes s`);
    await db.query('TRUNCATE production_batch_roots,production_batch_qualifications,production_inventory_domains,production_cutover_scopes');
    await db.query('INSERT INTO production_cutover_scopes SELECT (jsonb_populate_record(NULL::production_cutover_scopes,$1)).*', [draft.value]);
    await db.query("INSERT INTO production_inventory_domains VALUES('10000000-0000-0000-0000-000000000001','CO-A','WH-SHARED','PRD-EGG-TEST')");
  }

  async function expectBlocked(waiter: number, blocker: number) {
    for (let n = 0; n < 100; n++) {
      const [{ blocked }] = await db.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked', [waiter, blocker]);
      if (blocked) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('No real PostgreSQL scope-lock wait observed');
  }

  it('does not move a domain away from its original scope while another scope is still DRAFT',async()=>{
    await prepareDraft();await db.query(`INSERT INTO production_cutover_scopes
      SELECT (jsonb_populate_record(NULL::production_cutover_scopes,to_jsonb(s)||'{"id":"10000000-0000-0000-0000-000000000002","house_code":"HOUSE-SECOND"}'::jsonb)).*
      FROM production_cutover_scopes s`);
    await expect(db.query("UPDATE production_inventory_domains SET scope_id='10000000-0000-0000-0000-000000000002'"))
      .rejects.toThrow('CUTOVER_DOMAIN_SCOPE_IMMUTABLE');
    await db.query("UPDATE production_cutover_scopes SET state='FENCED' WHERE id='10000000-0000-0000-0000-000000000001'");
    expect((await db.query('SELECT scope_id FROM production_inventory_domains'))[0].scope_id).toBe('10000000-0000-0000-0000-000000000001');
  });
  it('waits for an already-writing old client before fencing; its stock cannot become formal', async () => {
    await prepareDraft(); const writer = db.createQueryRunner(); const fence = db.createQueryRunner();
    try {
      await writer.connect(); await fence.connect(); await writer.startTransaction(); await fence.startTransaction();
      const [{ pid: writerPid }] = await writer.query('SELECT pg_backend_pid() AS pid');
      const [{ pid: fencePid }] = await fence.query('SELECT pg_backend_pid() AS pid');
      await writer.query("UPDATE inv_batches SET qty=31 WHERE batch_no='OLD-TEST'");
      const pending = fence.query("UPDATE production_cutover_scopes SET state='FENCED'");
      await expectBlocked(fencePid, writerPid);
      await writer.commitTransaction(); await pending; await fence.commitTransaction();
      await expect(assertOfficialInventoryBatches(db, ['OLD-TEST'])).rejects.toThrow();
    } finally {
      for (const r of [writer,fence]) { if (r.isTransactionActive) await r.rollbackTransaction(); await r.release(); }
    }
  });

  it('a client waiting behind FENCE rechecks the committed boundary and rolls back', async () => {
    await prepareDraft(); const writer = db.createQueryRunner(); const fence = db.createQueryRunner();
    try {
      await writer.connect(); await fence.connect(); await writer.startTransaction(); await fence.startTransaction();
      const [{ pid: writerPid }] = await writer.query('SELECT pg_backend_pid() AS pid');
      const [{ pid: fencePid }] = await fence.query('SELECT pg_backend_pid() AS pid');
      await fence.query("UPDATE production_cutover_scopes SET state='FENCED'");
      const pending = writer.query("UPDATE inv_batches SET qty=31 WHERE batch_no='OLD-TEST'").then(() => null, error => error as Error);
      await expectBlocked(writerPid, fencePid); await fence.commitTransaction();
      expect((await pending)?.message).toContain('OFFICIAL_INVENTORY_SOURCE_REJECTED');
      await writer.rollbackTransaction();
      expect((await db.query("SELECT qty FROM inv_batches WHERE batch_no='OLD-TEST'"))[0].qty).toBe('30');
    } finally {
      for (const r of [writer,fence]) { if (r.isTransactionActive) await r.rollbackTransaction(); await r.release(); }
    }
  });

  it('permits empty expand rollback and re-install without changing existing inventory', async () => {
    await db.query('TRUNCATE production_batch_roots,production_batch_qualifications,production_inventory_domains,production_cutover_scopes');
    const runner = db.createQueryRunner();
    try {
      await runner.connect(); const migration = new OfficialInventoryCutover1794971000000();
      await migration.down(runner); await migration.up(runner);
      expect((await db.query('SELECT count(*)::int AS n FROM inv_batches'))[0].n).toBe(2);
    } finally { await runner.release(); }
  });
});
