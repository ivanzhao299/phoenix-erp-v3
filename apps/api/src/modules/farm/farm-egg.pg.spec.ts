import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import request = require('supertest');
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { AddressInfo } from 'node:net';
import { FarmEggService, EggLedgerEntry } from './farm-egg.service';
import { FarmEggController } from './farm-egg.controller';
import { MenuGuard } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { ProductionInboundService } from '../sales-v2/services/production-inbound.service';
import { InventorySourceController } from '../sales-v2/controllers/inventory-source.controller';
import { InventorySourceModeService } from '../sales-v2/services/inventory-source-mode.service';

// Opt-in isolated fixture only: never read .env, DATABASE_URL or application DB_*.
// docker run --name issue400-pg18 -e POSTGRES_USER=issue400 -e POSTGRES_PASSWORD=issue400-local-fixture -e POSTGRES_DB=issue400 -p 127.0.0.1:15450:5432 postgres:18-alpine
const describePg = process.env.ISSUE400_PG_PORT ? describe : describe.skip;
const grades = ['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'];
type ApiLedgerRow = Omit<EggLedgerEntry, 'qty_change'> & { qty_change: string };
const names = ['1号蛋', '2号蛋', '3号蛋', '4号蛋', '5号蛋', '脏蛋', '裂缝蛋', '破损蛋', '损坏蛋'];

describePg('Issue 400 isolated PostgreSQL HTTP inventory chain', () => {
  let ds: DataSource;
  let app: INestApplication;
  let scope: { isGlobal: boolean; allowedCompanyCodes: string[]; allowedWarehouseCodes: string[] };
  const cls = { get: (key: string) => key === 'dataScope' ? scope : { username: 'issue400-fixture' } };

  beforeAll(async () => {
    const port = Number(process.env.ISSUE400_PG_PORT);
    if (port !== 15450) throw new Error('Issue 400 fixture accepts only its dedicated localhost port 15450');
    ds = new DataSource({ type: 'postgres', host: '127.0.0.1', port, username: 'issue400',
      password: 'issue400-local-fixture', database: 'issue400', entities: [], synchronize: false,
      extra: { options: '-c search_path=issue400' } });
    await ds.initialize();
    await ds.query('CREATE SCHEMA IF NOT EXISTS issue400');
    await ds.query(`
      CREATE TABLE IF NOT EXISTS product_grades (grade_code text PRIMARY KEY, grade_name text, grade_name_en text, grade_name_lo text, status text, sort_order int);
      CREATE TABLE IF NOT EXISTS product_skus (sku_code text PRIMARY KEY, product_code text, grade_code text, spec_code text, status text);
      CREATE TABLE IF NOT EXISTS sys_organizations (org_code text PRIMARY KEY, company_code text, org_type text, status text);
      CREATE TABLE IF NOT EXISTS brd_farms (farm_code text PRIMARY KEY, company_code text, mapped_site_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_houses (house_code text PRIMARY KEY, house_name text, farm_code text, status text);
      CREATE TABLE IF NOT EXISTS wms_warehouses (warehouse_code text PRIMARY KEY, company_code text, site_code text, status text, type text, domain text);
      CREATE TABLE IF NOT EXISTS wms_locations (location_code text PRIMARY KEY, warehouse_code text, status text);
      CREATE TABLE IF NOT EXISTS inv_batches (id serial PRIMARY KEY, batch_no text UNIQUE, product_code text, company_code text, warehouse_code text, location_code text,
        egg_date date, inbound_date date, expire_date date, quality_grade text, packaging_spec text, source_type text, source_no text,
        qty numeric, qty_available numeric, status text, sku_code text, grade_code_std text, spec_code text, packaging_batch_ref text, collection_batch_ref text,
        created_at timestamptz, updated_at timestamptz);
      CREATE TABLE IF NOT EXISTS inv_ledger (id serial PRIMARY KEY, batch_no text, change_type text, qty_change numeric, operator text, store_code text,
        ref_no text, note text, batch_expire_date date, quality_grade text, company_code text, sku_code text, log_date date, warehouse_code text, location_code text,
        house_code text, customer_no text, created_at timestamptz DEFAULT now());
      TRUNCATE inv_ledger, inv_batches, product_skus, product_grades, sys_organizations, brd_farms, brd_houses, wms_warehouses, wms_locations RESTART IDENTITY;
    `);
    for (const [i, grade] of grades.entries()) {
      await ds.query('INSERT INTO product_grades VALUES ($1,$2,$3,$4,$5,$6)', [grade, names[i], `Grade ${grade}`, `ໄຂ່ ${grade}`, 'ACTIVE', i]);
      await ds.query('INSERT INTO product_skus VALUES ($1,$2,$3,$4,$5)', [`SKU-${grade}`, 'PRD-EGG-RAW', grade, 'LOOSE', 'ACTIVE']);
    }
    for (const company of ['A', 'B']) {
      await ds.query("INSERT INTO sys_organizations VALUES ($1,$1,'COMPANY','ACTIVE')", [`COMP-${company}`]);
      await ds.query("INSERT INTO brd_farms VALUES ($1,$2,$3,'ACTIVE')", [`FARM-${company}`, `COMP-${company}`, `SITE-${company}`]);
      await ds.query("INSERT INTO brd_houses VALUES ($1,$2,$3,'ACTIVE')", [`HOUSE-${company}`, `House ${company}`, `FARM-${company}`]);
      await ds.query("INSERT INTO wms_warehouses VALUES ($1,$2,$3,'ACTIVE','EGG_FARM','OPERATIONAL')", [`WH-${company}`, `COMP-${company}`, `SITE-${company}`]);
      await ds.query("INSERT INTO wms_locations VALUES ($1,$2,'ACTIVE')", [`LOC-${company}`, `WH-${company}`]);
    }
    await ds.query("INSERT INTO brd_houses VALUES ('HOUSE-A2','House A2','FARM-A','ACTIVE')");
    const eggInv = new EggInventoryService(ds, cls as never);
    const modeSvc = { resolveMode: async () => 'TEMP_PRODUCTION_INBOUND' };
    const inbound = new ProductionInboundService(ds, cls as never, eggInv, modeSvc as never, new OrgOwnershipService(ds.manager));
    const module = await Test.createTestingModule({ controllers: [FarmEggController, InventorySourceController], providers: [
      { provide: FarmEggService, useValue: new FarmEggService(ds, cls as never) },
      { provide: ProductionInboundService, useValue: inbound },
      { provide: InventorySourceModeService, useValue: modeSvc },
    ] }).overrideGuard(AuthGuard('jwt')).useValue({ canActivate: () => true })
      .overrideGuard(MenuGuard).useValue({ canActivate: () => true })
      .overrideGuard(DataScopeGuard).useValue({ canActivate: () => true }).compile();
    // HTTP routes/controllers/services/SQL are real; identity and mode are fixture adapters.
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => { scope = { isGlobal: true, allowedCompanyCodes: [], allowedWarehouseCodes: [] }; });
  afterAll(async () => { await app?.close(); if (ds?.isInitialized) await ds.destroy(); });

  const inbound = (date: string, house = 'HOUSE-A') => request(app.getHttpServer()).post('/api/v2/inventory/production-inbound')
    .send({ eggDate: date, houseCode: house, items: grades.map((grade, i) => ({ grade, qty: (i + 1) * 11 })) });
  const ledger = (date: string) => request(app.getHttpServer()).get('/api/farm/egg/ledger').query({ start: date, end: date });

  it('writes all nine grades and quantities to real batches and event rows and reads their names', async () => {
    const saved = await inbound('2026-10-10').expect(201);
    expect(saved.body.totalInbound).toBe(495);
    const rows = await ds.query<Array<{ grade_code_std: string; quality_grade: string; qty: string; event_grade: string; qty_change: string }>>('SELECT b.grade_code_std, b.quality_grade, b.qty, l.quality_grade AS event_grade, l.qty_change FROM inv_batches b JOIN inv_ledger l USING(batch_no) ORDER BY b.id');
    expect(rows).toHaveLength(9);
    rows.forEach((row, i) => expect(row).toMatchObject({ grade_code_std: grades[i], quality_grade: grades[i], qty: String((i + 1) * 11), event_grade: grades[i], qty_change: String((i + 1) * 11) }));
    const result = await ledger('2026-10-10').expect(200);
    expect(result.body.data).toHaveLength(9);
    for (const [i, grade] of grades.entries()) expect(result.body.data.find((r: ApiLedgerRow) => r.grade === grade)).toMatchObject({ grade_name: names[i], grade_name_en: `Grade ${grade}`, grade_name_lo: `ໄຂ່ ${grade}`, qty_change: String((i + 1) * 11) });
  });

  it('never replaces nine historical event grades with the current batch grade', async () => {
    await inbound('2026-10-11').expect(201);
    // Model the disputed boundary explicitly; this is fixture data, not a production repair.
    await ds.query("UPDATE inv_batches SET grade_code_std = 'BROKEN', quality_grade = 'BROKEN' WHERE egg_date = '2026-10-11'");
    const result = await ledger('2026-10-11').expect(200);
    expect(result.body.data.map((r: ApiLedgerRow) => r.grade).sort()).toEqual([...grades].sort());
    expect(result.body.data.reduce((sum: number, r: ApiLedgerRow) => sum + Number(r.qty_change), 0)).toBe(495);
  });

  it('keeps dates, houses, sources and company boundaries without widening the product-family filter', async () => {
    await inbound('2026-10-12', 'HOUSE-A2').expect(201);
    await inbound('2026-10-12', 'HOUSE-B').expect(201);
    const eggInv = new EggInventoryService(ds, cls as never);
    await eggInv.createProductionBatch({ companyCode: 'COMP-A', eggDate: '2026-10-12', productCode: 'PRD-EGG-RAW', qualityGrade: 'GRADE_1', qty: 7, sourceType: 'PACKAGING', ledgerChangeType: 'PACKAGING_INBOUND' });
    scope = { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedWarehouseCodes: ['WH-A'] };
    const result = await ledger('2026-10-12').expect(200);
    expect(result.body.data).toHaveLength(10);
    const daily = result.body.data.filter((r: ApiLedgerRow) => r.change_type === 'TEMP_PRODUCTION_INBOUND');
    expect(daily.every((r: ApiLedgerRow) => r.house_code === 'HOUSE-A2' && r.house_name === 'House A2' && r.log_date === '2026-10-12')).toBe(true);
    expect(result.body.data.find((r: ApiLedgerRow) => r.change_type === 'PACKAGING_INBOUND')).toMatchObject({ grade: 'GRADE_1', qty_change: '7' });
    await request(app.getHttpServer()).post('/api/v2/inventory/production-inbound').send({ eggDate: '2026-10-13', houseCode: 'HOUSE-B', items: [{ grade: 'GRADE_1', qty: 1 }] }).expect(403);
    scope = { isGlobal: false, allowedCompanyCodes: [], allowedWarehouseCodes: [] };
    expect((await ledger('2026-10-12').expect(200)).body.data).toEqual([]);
    scope = { isGlobal: true, allowedCompanyCodes: [], allowedWarehouseCodes: [] };
    expect((await ledger('2026-10-12').expect(200)).body.data).toHaveLength(19);
    expect((await ledger('2026-10-13').expect(200)).body.data).toEqual([]);
  });

  it('falls back for null, blank, unknown and retired event aliases without leaking a house name', async () => {
    await inbound('2026-10-14').expect(201);
    await ds.query("INSERT INTO product_grades VALUES ('L','旧一号蛋',NULL,NULL,'DEPRECATED',100)");
    const events = await ds.query("SELECT id FROM inv_ledger WHERE log_date='2026-10-14' ORDER BY id");
    for (const [i, value] of [null, '', 'legacy-one', 'L'].entries()) {
      await ds.query('UPDATE inv_ledger SET quality_grade=$1 WHERE id=$2', [value, events[i].id]);
    }
    await ds.query("UPDATE inv_batches SET collection_batch_ref='HOUSE-HOUSE-B' WHERE egg_date='2026-10-14'");
    await ds.query("UPDATE inv_ledger SET log_date=NULL, change_type='RESERVED', created_at='2026-10-16 12:00:00+00' WHERE id=$1", [events[0].id]);
    const eggInv = new EggInventoryService(ds, cls as never);
    await eggInv.createProductionBatch({ companyCode: 'COMP-A', eggDate: '2026-10-14', productCode: 'PRD-FEED-1', qualityGrade: 'GRADE_1', qty: 8 });
    const result = await ledger('2026-10-14').expect(200);
    expect(result.body.data).toHaveLength(9);
    expect(result.body.data.map((r: ApiLedgerRow) => r.grade).sort()).toEqual([...grades].sort());
    expect(result.body.data.every((r: ApiLedgerRow) => r.house_name === null)).toBe(true);
    // Preserve the existing event-date display for later non-inbound movements.
    expect(result.body.data.find((r: ApiLedgerRow) => r.id === events[0].id)).toMatchObject({ change_type: 'RESERVED', log_date: '2026-10-16' });
    expect(result.body.data.filter((r: ApiLedgerRow) => r.id !== events[0].id).every((r: ApiLedgerRow) => r.log_date === '2026-10-14')).toBe(true);
    // Lookup joins may read historical inactive grades; only retired aliases yield to a standard batch code.
    await ds.query("UPDATE product_grades SET status='INACTIVE' WHERE grade_code='CRACKED'");
    expect((await ledger('2026-10-11').expect(200)).body.data.find((r: ApiLedgerRow) => r.grade === 'CRACKED')).toBeDefined();
  });

  it('renders the actual ledger page from real HTTP/PG responses in all three languages', async () => {
    const address = app.getHttpServer().address() as AddressInfo;
    const web = resolve(process.cwd(), '../web');
    const result = await promisify(execFile)(process.execPath, [resolve(web, 'node_modules/vitest/vitest.mjs'), 'run', 'src/__tests__/daily-inbound-ledger.live.dom.test.tsx', '--maxWorkers=1'], {
      cwd: web, env: { ...process.env, ISSUE400_API_URL: `http://127.0.0.1:${address.port}` }, timeout: 60000,
    });
    expect(result.stdout).toContain('4 passed');
  }, 70000);
});
