import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request = require('supertest');
import { ClsService } from 'nestjs-cls';
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';
import { DataScopeService } from '../org/services/data-scope.service';
import { WmsService } from '../wms/wms.service';
import { AuthSubcodeGuard } from '../../common/guards/auth-subcode.guard';

const fixtureUrl = process.env.ISSUE403_FIXTURE_URL;
const integration = fixtureUrl ? describe : describe.skip;
integration('Issue 403 daily export HTTP + PostgreSQL (isolated fixture)', () => {
  let app: INestApplication;
  let db: DataSource;
  const grades = { GRADE_1: 11, GRADE_2: 22, GRADE_3: 33, GRADE_4: 44, GRADE_5: 55, DIRTY: 6, CRACKED: 7, BROKEN: 8, DAMAGED: 9 };
  beforeAll(async () => {
    const parsed = new URL(fixtureUrl!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/issue403_fixture') throw Error('ISOLATED_ISSUE403_FIXTURE_REQUIRED');
    db = new DataSource({ type: 'postgres', url: fixtureUrl, synchronize: false, migrationsRun: false, installExtensions: false });
    await db.initialize();
    await db.query('CREATE TABLE IF NOT EXISTS brd_daily_logs(id integer PRIMARY KEY, log_date date, created_at timestamptz, farm_code text, site_code text, house_code text, eggs_produced integer, eggs_by_grade jsonb, mortality_qty integer, elimination_qty integer, note text)');
    await db.query('TRUNCATE brd_daily_logs');
    // Canonical ownership fixtures also exercise the #401 integrated scoped-read contract.
    await db.query('CREATE TABLE IF NOT EXISTS brd_farms(farm_code text PRIMARY KEY, company_code text, mapped_site_code text, status text)');
    await db.query('CREATE TABLE IF NOT EXISTS brd_houses(house_code text PRIMARY KEY, farm_code text)');
    await db.query("INSERT INTO brd_farms VALUES ('FARM-A','COMP-A','SITE-A','ACTIVE'),('FARM-B','COMP-B','SITE-B','ACTIVE') ON CONFLICT(farm_code) DO UPDATE SET company_code=EXCLUDED.company_code,mapped_site_code=EXCLUDED.mapped_site_code,status=EXCLUDED.status");
    await db.query("INSERT INTO brd_houses VALUES ('H-A1','FARM-A'),('H-A2','FARM-A'),('H-B','FARM-B') ON CONFLICT(house_code) DO UPDATE SET farm_code=EXCLUDED.farm_code");
    await db.query(`INSERT INTO brd_daily_logs SELECT n, '2026-10-16'::date, '2026-10-16T23:59:59+08'::timestamptz, 'FARM-A', 'SITE-A', CASE WHEN n % 2 = 0 THEN 'H-A1' ELSE 'H-A2' END, 195, $1::jsonb, 2, 3, 'saved report' FROM generate_series(1,1005) n`, [JSON.stringify(grades)]);
    await db.query(`INSERT INTO brd_daily_logs VALUES (2001,'2026-10-16','2026-10-16T00:00:00+08','FARM-B','SITE-B','H-B',195,$1,2,3,'private B'),(2002,'2026-10-15','2026-10-15T23:59:59+08','FARM-A','SITE-A','H-A1',195,$1,2,3,'previous date'),(2003,'2026-10-17','2026-10-17T00:00:00+08','FARM-A','SITE-A','H-A1',195,$1,2,3,'next date')`, [JSON.stringify(grades)]);
    const module = await Test.createTestingModule({
      controllers: [GenericCrudController],
      providers: [
        { provide: GenericCrudService, useValue: new GenericCrudService(db.manager) },
        { provide: DataScopeService, useValue: { resolve: async (userId: string) => ({ isGlobal: userId === 'admin', allowedCompanyCodes: [userId === 'b' ? 'COMP-B' : 'COMP-A'], allowedSiteCodes: [userId === 'b' ? 'SITE-B' : 'SITE-A'], allowedFarmCodes: [userId === 'b' ? 'FARM-B' : 'FARM-A'] }) } },
        { provide: WmsService, useValue: {} }, { provide: ClsService, useValue: { set: () => {} } },
      ],
    }).overrideGuard(AuthSubcodeGuard).useValue({ canActivate(context: { switchToHttp: () => { getRequest: () => { headers: Record<string, string>; user?: unknown } } }) {
      // Fixture identities replace JWT verification only. Actual controller RBAC/scope/SQL run below.
      const req = context.switchToHttp().getRequest(); const user = req.headers['x-fixture-user'] || 'a';
      req.user = { userId: user, username: user, roles: [user === 'admin' ? 'ROLE_ADMIN' : 'ROLE_FARM'], storeCode: user === 'b' ? 'SITE-B' : 'SITE-A', permissions: user === 'admin' ? ['*'] : user === 'no-export' ? ['MENU_FARM_DATA:V'] : user === 'no-view' ? ['MENU_FARM_DAILY:X'] : ['MENU_FARM_DATA:V', 'MENU_FARM_DAILY:X'] }; return true;
    } }).compile();
    app = module.createNestApplication(); await app.init();
  }, 30000);
  afterAll(async () => { if (app) await app.close(); if (db?.isInitialized) await db.destroy(); });
  const get = (date = '2026-10-16', user = 'a', extra = '') => request(app.getHttpServer()).get(`/api/crud/brd_daily_logs/export?log_date=${date}${extra}`).set('x-fixture-user', user);
  it('reads beyond the list cap in a single SQL snapshot, preserving all grades and date boundaries', async () => {
    const response = await get('2026-10-16', 'a', '&limit=1&offset=999999').expect(200);
    const rows = response.body.data;
    expect(rows).toHaveLength(1005);
    expect(new Set(rows.map((row: { id: number }) => row.id)).size).toBe(1005);
    expect(rows.every((row: { log_date: string; site_code: string }) => row.log_date === '2026-10-16' && row.site_code === 'SITE-A')).toBe(true);
    expect(rows[0]).toMatchObject({ eggs_by_grade: grades, mortality_qty: 2, elimination_qty: 3, eggs_produced: 195 });
    const list = await request(app.getHttpServer()).get('/api/crud/brd_daily_logs?limit=20001').set('x-fixture-user', 'a').expect(200);
    expect(list.body.data).toHaveLength(1000);
  });
  it('rejects overflow instead of returning a partial file', async () => {
    await db.query(`INSERT INTO brd_daily_logs SELECT n, '2026-10-14'::date, now(), 'FARM-A', 'SITE-A', 'H-A1', 0, '{}'::jsonb, 0, 0, '' FROM generate_series(10000,30000) n`);
    try { const response = await get('2026-10-14').expect(400); expect(response.body.message).toBe('EXPORT_TOO_LARGE'); }
    finally { await db.query('DELETE FROM brd_daily_logs WHERE id BETWEEN 10000 AND 30000'); }
  });
  it('keeps admin visibility and rejects cross-company house filters', async () => {
    const admin = await get('2026-10-16', 'admin').expect(200); expect(admin.body.data).toHaveLength(1006);
    const restricted = await get('2026-10-16', 'a', '&house_code=H-B&site_code=SITE-B').expect(200); expect(restricted.body.data).toEqual([]);
    const b = await get('2026-10-16', 'b').expect(200); expect(b.body.data.map((row: { id: number }) => row.id)).toEqual([2001]);
  });
  it('requires both daily export permission and original read permission', async () => {
    await get('2026-10-16', 'no-export').expect(403); await get('2026-10-16', 'no-view').expect(403);
  });
  it('handles empty dates and validates real calendar dates and house selectors', async () => {
    expect((await get('2026-10-01').expect(200)).body.data).toEqual([]);
    for (const date of ['2026-02-30', '2026-13-01', '2026-10-16T00:00:00Z', '']) await get(date).expect(400);
    for (const extra of ['&house_code[x]=y']) await get('2026-10-16', 'a', extra).expect(400);
  });
});
