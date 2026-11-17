import 'reflect-metadata';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { LabelsService } from '../terminal/labels.service';
import {
  assertTempProductionReferenceAllowed, lockTempProductionReferences, readTempProductionReversalState,
  reversalPlanHash, reversalReference, REVERSAL_BUSINESS_TYPE, REVERSAL_TYPE,
  TEMP_PRODUCTION_REVERSAL_CASE as c,
} from './temp-production-reversal';

const url = process.env.TEMP_REVERSAL_PG_URL;
const suite = url ? describe : describe.skip;
suite('exact correction reference guard on owned PostgreSQL', () => {
  let db: DataSource;
  let reference: QueryRunner;
  let correction: QueryRunner;
  const schema = `temp_reversal_${process.pid}`;
  const snapshot = 'a'.repeat(64), release = 'b'.repeat(40), migrationLedger = 'c'.repeat(64);
  const note = (ledgerId: number) => JSON.stringify({ case_id: c.id, version: 1, original_ledger_id: ledgerId,
    original_date: c.originalDate, original_cost_evidence: c.costEvidence, cost_status: 'UNKNOWN_PRE_SCHEMA',
    original_store_code: c.companyCode, corrected_store_code: null, approval_ref: 'owned-approval',
    execution_run: 'owned-run', technical_actor: 'owned-actor', snapshot_sha256: snapshot, release_sha: release,
    financial_evidence_ref:'owned-finance',financial_evidence_sha256:'d'.repeat(64),backup_receipt_ref:'owned-backup',backup_archive_sha256:'e'.repeat(64),
    migration_ledger_sha256: migrationLedger, plan_sha256: reversalPlanHash(snapshot, release, migrationLedger, '2026-11-18'), execution_date: '2026-11-18' });

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '44889' || parsed.pathname !== '/phoenix_temp_reversal_fixture') {
      throw new Error('Owned loopback reversal fixture required');
    }
    db = await new DataSource({ type: 'postgres', url, entities: [], synchronize: false, migrationsRun: false,
      installExtensions: false, extra: { options: `-c search_path=${schema}` } }).initialize();
    await db.query(`CREATE SCHEMA "${schema}";
      CREATE TABLE inv_batches(id bigint,batch_no text PRIMARY KEY,qty numeric,qty_available numeric,
        company_code text,warehouse_code text,location_code text,source_type text,source_no text,collection_batch_ref text,packaging_batch_ref text,
        egg_date date,product_code text,sku_code text,grade_code_std text,quality_grade text,unit text,spec_code text,
        packaging_spec text,base_quantity_version int,store_code text,material_code text,legacy_source text,status text,unit_cost numeric DEFAULT 0);
      CREATE TABLE inv_ledger(id bigserial PRIMARY KEY,batch_no text,change_type text,qty_change numeric,
        operator text,store_code text,ref_no text,note text,company_code text,warehouse_code text,location_code text,
        sku_code text,quality_grade text,log_date date,unit text,cost_change numeric,business_type text);
      CREATE TABLE lbl_records(id bigserial PRIMARY KEY,code text,label_type text,grade_code text,grade_name text,pack_name text,
        batch_no text,produce_date date,expiry_date date,price numeric,show_price int,show_expiry int,qty_printed int,
        label_w numeric,label_h numeric,desc_text text,operator text,printed_by bigint,created_at timestamptz DEFAULT now());`);
    reference = db.createQueryRunner(); correction = db.createQueryRunner();
    await reference.connect(); await correction.connect();
  });
  afterAll(async () => {
    for (const runner of [reference, correction]) if (runner && !runner.isReleased) {
      if (runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release();
    }
    // Only the schema created by this owned test, never a shared business table.
    if (db?.isInitialized) { await db.query(`DROP SCHEMA "${schema}" CASCADE`); await db.destroy(); }
  });
  beforeEach(async () => {
    await db.query('TRUNCATE inv_batches,inv_ledger,lbl_records RESTART IDENTITY');
    for (const t of c.targets) {
      await db.query(`INSERT INTO inv_batches(id,batch_no,qty,qty_available,company_code,warehouse_code,location_code,
        source_type,source_no,collection_batch_ref,egg_date,product_code,sku_code,grade_code_std,quality_grade,unit,
        spec_code,packaging_spec,base_quantity_version,store_code,material_code,legacy_source,status)
        VALUES($1,$2,30,30,$3,$4,$5,'TEMP_PRODUCTION',$6,$7,$8,$9,$10,$11,$11,'枚','LOOSE','LOOSE',1,NULL,NULL,NULL,'AVAILABLE')`,
      [t.id,t.batchNo,c.companyCode,c.warehouseCode,c.locationCode,c.sourceNo,c.collectionRef,c.originalDate,t.product,t.sku,t.grade]);
      await db.query(`INSERT INTO inv_ledger(id,batch_no,change_type,qty_change,ref_no,company_code,warehouse_code,location_code,
        sku_code,quality_grade,log_date,store_code,unit) VALUES($1,$2,'TEMP_PRODUCTION_INBOUND',30,$3,$4,$5,$6,$7,$8,$9,$4,NULL)`,
      [t.ledgerId,t.batchNo,c.sourceNo,c.companyCode,c.warehouseCode,c.locationCode,t.sku,t.grade,c.originalDate]);
    }
    await db.query("SELECT setval(pg_get_serial_sequence('inv_ledger','id'),1000)");
  });
  afterEach(async () => {
    for (const runner of [reference, correction]) if (runner?.isTransactionActive) await runner.rollbackTransaction();
  });

  // Foundation fixture for the proof/locking protocol; final apply tests must
  // additionally exercise WmsService's approved plan and preflight contract.
  async function fixtureCorrection(manager: EntityManager) {
    await manager.query('SELECT batch_no FROM inv_batches ORDER BY batch_no FOR UPDATE');
    if ((await manager.query('SELECT 1 FROM lbl_records WHERE batch_no=ANY($1::text[])', [c.targets.map(t => t.batchNo)])).length) {
      throw new Error('DOWNSTREAM_REFERENCE_HOLD');
    }
    for (const t of c.targets) {
      await manager.query('UPDATE inv_batches SET qty=0,qty_available=0 WHERE batch_no=$1', [t.batchNo]);
      // Test-only paired fixture. Production dedicated writes now require the
      // validated WmsService capability; actual apply has its own case PG suite.
      await manager.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,operator,store_code,ref_no,note,
        company_code,warehouse_code,location_code,sku_code,quality_grade,log_date,unit,cost_change,business_type)
        VALUES($1,$2,-30,'owned-actor',NULL,$3,$4,$5,$6,$7,$8,$9,'2026-11-18','枚',NULL,$10)`,
      [t.batchNo,REVERSAL_TYPE,reversalReference(t.ledgerId),note(t.ledgerId),c.companyCode,c.warehouseCode,c.locationCode,t.sku,t.grade,REVERSAL_BUSINESS_TYPE]);
    }
    expect(await readTempProductionReversalState(manager)).toBe('REVERSED');
  }

  async function verifyBlocked(waiterPid: number, blockerPid: number): Promise<void> {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const [state] = await db.query('SELECT $2::int=ANY(pg_blocking_pids($1::int)) AS blocked', [waiterPid, blockerPid]);
      if (state.blocked) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Real PostgreSQL lock wait was not observed');
  }

  it('reference first commits: the waiting corrective transaction sees it and rolls back', async () => {
    await reference.startTransaction(); await correction.startTransaction();
    const [{ pid: refPid }] = await reference.query('SELECT pg_backend_pid() AS pid');
    const [{ pid: fixPid }] = await correction.query('SELECT pg_backend_pid() AS pid');
    await lockTempProductionReferences(reference.manager, [c.targets[1].batchNo]);
    await reference.query('INSERT INTO lbl_records(batch_no) VALUES($1)', [c.targets[1].batchNo]);
    const pending = fixtureCorrection(correction.manager).then(() => null, error => error as Error);
    await verifyBlocked(fixPid, refPid);
    await reference.commitTransaction();
    expect((await pending)?.message).toBe('DOWNSTREAM_REFERENCE_HOLD');
    await correction.rollbackTransaction();
    expect((await db.query('SELECT qty FROM inv_batches ORDER BY id')).map((row: { qty: string }) => Number(row.qty))).toEqual([30,30]);
    expect(await db.query('SELECT id FROM inv_ledger')).toHaveLength(2);
  });
  it('correction first commits: the waiting reference observes the pair and inserts nothing', async () => {
    await correction.startTransaction(); await reference.startTransaction();
    const [{ pid: fixPid }] = await correction.query('SELECT pg_backend_pid() AS pid');
    const [{ pid: refPid }] = await reference.query('SELECT pg_backend_pid() AS pid');
    await fixtureCorrection(correction.manager);
    const pending = lockTempProductionReferences(reference.manager, [c.targets[1].batchNo]).then(() => null, error => error as Error);
    await verifyBlocked(refPid, fixPid);
    await correction.commitTransaction();
    expect((await pending)?.message).toContain('已核验冲销');
    await reference.rollbackTransaction();
    expect(await db.query('SELECT id FROM lbl_records')).toHaveLength(0);
    expect(await readTempProductionReversalState(db.manager)).toBe('REVERSED');
  });
  it('actual LabelsService rejects corrected input inside its own transaction; ordinary zero remains printable', async () => {
    await db.transaction(fixtureCorrection);
    const labels = new LabelsService(db.manager);
    expect((await labels.recordPrint({ batch_no: c.targets[0].batchNo }, 7)).code).toBe(500);
    expect(await db.query('SELECT id FROM lbl_records')).toHaveLength(0);
    await db.query("INSERT INTO inv_batches(batch_no,qty,qty_available) VALUES('ORDINARY-SOLD-OUT',0,0)");
    expect((await labels.recordPrint({ batch_no: 'ORDINARY-SOLD-OUT' }, 7)).code).toBe(200);
    expect(await db.query('SELECT id FROM lbl_records')).toHaveLength(1);
  });
  it('damaged corrected amounts or a partial pair hold, including when qty was revived', async () => {
    await db.transaction(fixtureCorrection);
    await db.query('UPDATE inv_batches SET qty=30 WHERE batch_no=$1', [c.targets[0].batchNo]);
    await expect(db.transaction(manager => lockTempProductionReferences(manager, [c.targets[0].batchNo]))).rejects.toThrow();
    await db.query('UPDATE inv_batches SET qty=0,unit_cost=2 WHERE batch_no=$1', [c.targets[0].batchNo]);
    await expect(readTempProductionReversalState(db.manager)).rejects.toThrow('批次成本');
  });
  it('pure proof assertion introduces no quantity-pool or batch lock', async () => {
    const queries: string[] = [];
    const dbView = { query: async (sql: string, args?: unknown[]) => { queries.push(sql); return db.query(sql,args); } };
    await assertTempProductionReferenceAllowed(dbView, [c.targets[0].batchNo]);
    expect(queries).toHaveLength(2);
    expect(queries.join('\n')).not.toMatch(/FOR UPDATE|advisory/i);
  });
});
