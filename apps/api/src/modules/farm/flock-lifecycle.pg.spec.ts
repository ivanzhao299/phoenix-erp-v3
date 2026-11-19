import {freezeOwnedFlockClock} from '../../test-fixtures/flock-business-clock';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { FarmService, OrgScope } from './farm.service';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { ProductionAnalyticsService } from '../analytics/services/production-analytics.service';

// Explicit owned loopback DB only; never load project .env or application data source.
const url = process.env.FLOCK_REVIEW_PG_URL;
const suite = url ? describe : describe.skip;
const global: OrgScope = { isGlobal: true, farmCode: null, siteCode: null };
const scopeA: OrgScope = { isGlobal: false, farmCode: null, siteCode: null, companyCodes: ['CA'] };
suite('flock daily correction on PostgreSQL', () => {
 let releaseBusinessClock:(()=>void)|undefined;
  let db: DataSource;
  let service: FarmService;
  const report = (extra: Record<string, any> = {}) => ({ house_code: 'HA', flock_no: 'FA', log_date: '2026-11-10',
    mortality_qty: 0, elimination_qty: 0, eggs_by_grade: { GRADE_1: 100 }, ...extra });
  const post = (body: Record<string, any>) => service.submitBreedingDailyLog(body, scopeA);
  const stock = async () => Number((await db.query("SELECT current_qty FROM brd_flocks WHERE flock_no='FA'"))[0].current_qty);
  const logs = () => db.query('SELECT *, log_date::text AS log_date FROM brd_daily_logs ORDER BY brd_daily_logs.log_date,shift');

  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/phoenix_flock_review') throw new Error('Owned local flock fixture required');
    db = await new DataSource({ type: 'postgres', url, synchronize: false, migrationsRun: false, installExtensions: false }).initialize();
  releaseBusinessClock=freezeOwnedFlockClock(url!);
    await db.query(`
      CREATE TABLE IF NOT EXISTS brd_farms(farm_code text PRIMARY KEY,company_code text,mapped_site_code text,status text);
      CREATE TABLE IF NOT EXISTS brd_houses(house_code text PRIMARY KEY,farm_code text,house_name text,status text);
      CREATE TABLE IF NOT EXISTS brd_flocks(flock_no text PRIMARY KEY,house_code text,farm_code text,status text,start_date date,
        initial_qty integer,current_qty integer,current_lay_rate numeric,updated_at timestamp);
      CREATE TABLE IF NOT EXISTS brd_daily_logs(id serial PRIMARY KEY,flock_no text,house_code text,farm_code text,site_code text,
        company_code text,log_date date,business_date date,shift text,mortality_qty integer,elimination_qty integer,
        eggs_produced integer,dirty_eggs integer,broken_eggs integer,eggs_by_grade jsonb,note text,
        opening_qty integer,closing_qty integer,lay_rate numeric, UNIQUE(log_date,house_code,shift));
      CREATE TABLE IF NOT EXISTS product_grades(grade_code text PRIMARY KEY,is_saleable boolean,status text);
      CREATE TABLE IF NOT EXISTS inv_batches(batch_no text PRIMARY KEY,product_code text,company_code text,egg_date date,
        status text,qty_available numeric,qty numeric,source_type text,collection_batch_ref text,
        grade_code_std text,quality_grade text,created_at timestamp DEFAULT now());
      CREATE TABLE IF NOT EXISTS inv_ledger(id serial PRIMARY KEY,batch_no text,change_type text,qty_change numeric,
        operator text,store_code text,ref_no text,note text,log_date date,company_code text);
      CREATE TABLE IF NOT EXISTS sys_organizations(org_code text PRIMARY KEY,org_name text);
      CREATE TABLE IF NOT EXISTS sys_user(user_id text PRIMARY KEY,username text,status integer);
      CREATE TABLE IF NOT EXISTS sys_notifications(id serial PRIMARY KEY,user_id text,notification_type text,title text,
        content text,company_code text,biz_type text,biz_no text,status text,created_at timestamp);
      CREATE UNIQUE INDEX IF NOT EXISTS flock_test_notice ON sys_notifications(user_id,biz_type,biz_no)
        WHERE biz_type='FARM_LEDGER_PENDING' AND biz_no IS NOT NULL;
    `);
    await db.query('ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS placement_date date;ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS feed_consumed numeric,ADD COLUMN IF NOT EXISTS water_consumed numeric');
    service = new FarmService(db.manager, new OrgOwnershipService(db.manager), { resolve: async () => ['7'] });
  });
  afterAll(async () => { if (db?.isInitialized) await db.destroy();releaseBusinessClock?.(); });
  beforeEach(async () => {
    await db.query(`TRUNCATE brd_farms,brd_houses,brd_flocks,brd_daily_logs,product_grades,inv_batches,inv_ledger,
      sys_organizations,sys_user,sys_notifications RESTART IDENTITY;
      INSERT INTO brd_farms VALUES('A','CA','SA','ACTIVE'),('B','CB','SB','ACTIVE');
      INSERT INTO brd_houses VALUES('HA','A','house A','ACTIVE'),('HB','B','house B','ACTIVE');
      INSERT INTO brd_flocks(flock_no,house_code,farm_code,status,start_date,initial_qty,current_qty,current_lay_rate,updated_at) VALUES('FA','HA','A','LAYING','2026-01-01',10000,10000,0,now()),('FB','HB','B','LAYING','2026-01-01',5000,5000,0,now());
      INSERT INTO product_grades VALUES('GRADE_1',true,'ACTIVE'),('DIRTY',false,'ACTIVE'),('BROKEN',false,'ACTIVE');
      INSERT INTO sys_user VALUES('7','keeper',1);
    `);
  });
  it('accumulates deaths and culls across days and replays duplicate submits once', async () => {
    await post(report({ mortality_qty: 30, elimination_qty: 20 }));
    await post(report({ log_date: '2026-11-11', mortality_qty: 10, elimination_qty: 5 }));
    await post(report({ log_date: '2026-11-11', mortality_qty: 10, elimination_qty: 5 }));
    expect(await stock()).toBe(9935);
    expect((await logs()).map((r: any) => [r.opening_qty,r.closing_qty])).toEqual([[10000,9950],[9950,9935]]);
  });
  it('deducts culling without eggs or mortality and permits correction to zero', async () => {
    await post(report({ eggs_by_grade: {}, elimination_qty: 20 }));
    expect(await stock()).toBe(9980);
    await service.updateBreedingDailyLog((await logs())[0].id, { elimination_qty: 0 }, scopeA);
    expect(await stock()).toBe(10000);
  });
  it('corrects an earlier day without restoring later deaths, preserving omitted fields', async () => {
    await post(report({ mortality_qty: 30, elimination_qty: 20 }));
    await post(report({ log_date: '2026-11-11', mortality_qty: 10 }));
    await service.updateBreedingDailyLog((await logs())[0].id, { mortality_qty: 10, note: 'correction' }, scopeA);
    expect(await stock()).toBe(9960);
    expect((await logs()).map((r: any) => [r.eggs_produced,r.elimination_qty,r.closing_qty])).toEqual([[100,20,9970],[100,0,9960]]);
  });
  it('preserves an existing manual balance instead of resetting from initial quantity', async () => {
    await db.query("UPDATE brd_flocks SET current_qty=9000 WHERE flock_no='FA'");
    await post(report({ mortality_qty: 30 }));
    expect(await stock()).toBe(8970);
  });
  it('serializes concurrent duplicate reports and independent dates', async () => {
    await Promise.all([post(report({ mortality_qty: 30 })),post(report({ mortality_qty: 30 })),
      post(report({ log_date: '2026-11-11', elimination_qty: 20 }))]);
    expect(await stock()).toBe(9950);
    expect(await logs()).toHaveLength(2);
  });
  it('rejects mismatched/multiple/closed flocks and excessive/noninteger losses atomically', async () => {
    for (const body of [report({ flock_no: 'FB' }),report({ mortality_qty: 10001 }),report({ elimination_qty: -2 }),report({ mortality_qty: 1.5 })]) {
      await expect(post(body)).rejects.toThrow();
    }
    expect(await logs()).toHaveLength(0); expect(await stock()).toBe(10000);
    await db.query("INSERT INTO brd_flocks VALUES('FA2','HA','A','LAYING','2026-01-01',10,10,0,now())");
    await expect(post(report())).rejects.toThrow('唯一在栏');
    await db.query("UPDATE brd_flocks SET status='RETIRED' WHERE house_code='HA'");
    await expect(post(report())).rejects.toThrow('唯一在栏');
  });
  it('rejects uncertain snapshots and explicit null counts without changing stock', async () => {
    await post(report({mortality_qty:10}));
    const row=(await logs())[0];
    await db.query('UPDATE brd_daily_logs SET opening_qty=NULL WHERE id=$1',[row.id]);
    await expect(service.updateBreedingDailyLog(row.id,{mortality_qty:20},scopeA)).rejects.toThrow('历史');
    await expect(service.updateBreedingDailyLog(row.id,{mortality_qty:null},scopeA)).rejects.toThrow('非负整数');
    expect(await stock()).toBe(9990);
    expect((await logs())[0].mortality_qty).toBe(10);
    await service.updateBreedingDailyLog(row.id,{note:'no invented baseline'},scopeA);
    expect((await logs())[0].opening_qty).toBeNull();
  });
  it('does not ignore another flock with unknown dates or status', async () => {
    await db.query("INSERT INTO brd_flocks VALUES('FA2','HA','A','UNKNOWN',NULL,10,10,0,now())");
    await expect(post(report())).rejects.toThrow('唯一在栏');
    expect(await logs()).toHaveLength(0);
  });
  it('requires resolved scope, rejects cross-company PUT and identity edits', async () => {
    await post(report()); const row = (await logs())[0];
    await expect(service.updateBreedingDailyLog(row.id,{ mortality_qty: 5 })).rejects.toThrow('无权');
    await expect(service.updateBreedingDailyLog(row.id,{ mortality_qty: 5 },{ ...scopeA, companyCodes: ['CB'] })).rejects.toThrow('无权');
    await expect(service.updateBreedingDailyLog(row.id,{ house_code: 'HB' },scopeA)).rejects.toThrow('归属');
    await expect(service.updateBreedingDailyLog(row.id,{ log_date: '2026-11-11' },scopeA)).rejects.toThrow('归属');
    await expect(post(report({ house_code: 'HB',flock_no: 'FB' }))).rejects.toThrow('无权');
    expect(await stock()).toBe(10000);
  });
  it('writes authoritative ownership even for a global caller', async () => {
    await service.submitBreedingDailyLog(report({ company_code:'CB',farm_code:'B' }),global);
    expect((await logs())[0]).toMatchObject({company_code:'CA',farm_code:'A',site_code:'SA'});
  });
  it('does not write FARM_IN for grades; rejects totals edited without grade details', async () => {
    await post(report());
    expect(await db.query('SELECT * FROM inv_ledger')).toHaveLength(0);
    await expect(service.updateBreedingDailyLog((await logs())[0].id,{ eggs_produced: 50 },scopeA)).rejects.toThrow('分级明细');
  });
  it('rejects grade reduction below posted stock and removing posted grades', async () => {
    await post(report());
    await db.query("INSERT INTO inv_batches(batch_no,company_code,egg_date,source_type,collection_batch_ref,grade_code_std,qty) VALUES('BA','CA','2026-11-10','TEMP_PRODUCTION','HOUSE-HA','GRADE_1',80)");
    for (const eggs_by_grade of [{GRADE_1:50},{}]) {
      await expect(service.updateBreedingDailyLog((await logs())[0].id,{ eggs_by_grade },scopeA)).rejects.toThrow();
    }
    expect((await logs())[0].eggs_produced).toBe(100);
  });
  it('posts no-grade retries once, corrects only the delta and reverses when graded', async () => {
    await db.query("INSERT INTO inv_batches(batch_no,product_code,company_code,egg_date,status,qty_available) VALUES('OLD','PRD-EGG-OLD','CA','2026-11-01','AVAILABLE',1000)");
    const body=report({eggs_by_grade:undefined,eggs_produced:100});
    await post(body); await post(body);
    expect(await db.query('SELECT * FROM inv_ledger')).toHaveLength(1);
    await service.updateBreedingDailyLog((await logs())[0].id,{note:'same'},scopeA);
    expect(await db.query('SELECT * FROM inv_ledger')).toHaveLength(1);
    await service.updateBreedingDailyLog((await logs())[0].id,{eggs_produced:120},scopeA);
    expect((await db.query('SELECT qty_change FROM inv_ledger ORDER BY id')).map((r: any)=>Number(r.qty_change))).toEqual([100,20]);
    await service.updateBreedingDailyLog((await logs())[0].id,{eggs_by_grade:{GRADE_1:120}},scopeA);
    expect((await db.query('SELECT change_type,qty_change FROM inv_ledger ORDER BY id'))[2]).toMatchObject({change_type:'FARM_REVERSED',qty_change:'120'});
  });
  it('reverses separate shifts once each and keeps retries idempotent', async () => {
    await db.query("INSERT INTO inv_batches(batch_no,product_code,company_code,egg_date,status,qty_available) VALUES('OLD','PRD-EGG-OLD','CA','2026-11-01','AVAILABLE',1000)");
    for(const shift of ['AM','PM']) await post(report({shift,eggs_by_grade:undefined,eggs_produced:100}));
    for(const row of await logs()) {
      await service.updateBreedingDailyLog(row.id,{eggs_by_grade:{GRADE_1:100}},scopeA);
      await service.updateBreedingDailyLog(row.id,{eggs_by_grade:{GRADE_1:100}},scopeA);
    }
    const reversed=await db.query("SELECT qty_change FROM inv_ledger WHERE change_type='FARM_REVERSED'");
    expect(reversed).toHaveLength(2);
    expect(reversed.map((r:any)=>Number(r.qty_change))).toEqual([100,100]);
  });
  it('rejects grade backfill with missing, consumed or other-day legacy net postings', async () => {
    await post(report({eggs_by_grade:undefined,eggs_produced:100}));
    const row=(await logs())[0];
    await db.query("INSERT INTO inv_batches(batch_no,product_code,company_code,egg_date,status,qty_available) VALUES('OLD','PRD-EGG-OLD','CA','2026-11-01','AVAILABLE',1000)");
    const backfill=()=>service.updateBreedingDailyLog(row.id,{eggs_by_grade:{GRADE_1:100}},scopeA);
    await expect(backfill()).rejects.toThrow('净额');
    await db.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no,note,log_date,company_code) VALUES('OLD','FARM_IN',100,'FA','日报产蛋入账','2026-11-09','CA')");
    await expect(backfill()).rejects.toThrow('净额');
    await db.query("UPDATE inv_ledger SET log_date='2026-11-10',qty_change=90");
    await expect(backfill()).rejects.toThrow('净额');
    expect((await logs())[0].eggs_by_grade).toBeNull();
    expect(await db.query("SELECT * FROM inv_ledger WHERE change_type='FARM_REVERSED'")).toHaveLength(0);
  });
  it('persists a pending-ledger notice with no usable batch', async () => {
    const result=await post(report({eggs_by_grade:undefined,eggs_produced:100}));
    expect(result.ledgerSkipped).toBe(true);
    expect(await db.query('SELECT * FROM sys_notifications')).toHaveLength(1);
  });
  it('analytics count one closing balance per house day across shifts', async () => {
    await post(report({shift:'AM'})); await post(report({shift:'PM'}));
    const result=await new ProductionAnalyticsService(db.manager).compute({dateFrom:'2026-11-10',dateTo:'2026-11-10'},scopeA);
    expect(Number(result.byHouse[0].avgLayRate)).toBe(2);
  });
  it('analytics use canonical columns and isolate companies, and count each flock once', async () => {
    await post(report({mortality_qty:10,elimination_qty:20}));
    await post(report({log_date:'2026-11-11',elimination_qty:10}));
    await service.submitBreedingDailyLog(report({house_code:'HB',flock_no:'FB'}),global);
    const analytics=new ProductionAnalyticsService(db.manager);
    const q={dateFrom:'2026-11-01',dateTo:'2026-11-30'};
    const result=await analytics.compute(q,scopeA);
    expect(result.totalEggs30Day).toBe(200); expect(result.cullRate).toBe(0.3);
    expect(result.byHouse.map((r:any)=>r.house_code)).toEqual(['HA']);
    expect((await analytics.compute(q)).totalEggs30Day).toBe(0);
  });
});
