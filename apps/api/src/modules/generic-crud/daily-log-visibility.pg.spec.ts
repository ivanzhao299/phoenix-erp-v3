import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { sign } from 'jsonwebtoken';
import { ClsModule, ClsService } from 'nestjs-cls';
import { DataSource, EntityManager } from 'typeorm';
import request = require('supertest');
import { GenericCrudController } from './generic-crud.controller';
import { GenericCrudService } from './generic-crud.service';
import { FarmController } from '../farm/farm.controller';
import { FarmService } from '../farm/farm.service';
import { WmsService } from '../wms/wms.service';
import { DataScopeService } from '../org/services/data-scope.service';
import { OrgOwnershipService } from '../org/services/org-ownership.service';
import { SysDataScopeEntity } from '../org/entities/sys-data-scope.entity';
import { SysOrganizationEntity } from '../org/entities/sys-organization.entity';
import { SysUserOrgEntity } from '../org/entities/sys-user-org.entity';
import { SysUserProjectScopeEntity } from '../org/entities/sys-user-project-scope.entity';
import { SysUserWarehouseScopeEntity } from '../org/entities/sys-user-warehouse-scope.entity';
import { SysUserFarmScopeEntity } from '../org/entities/sys-user-farm-scope.entity';

// Explicit opt-in. This fixture never loads dotenv or connects to application databases.
const pgUrl = process.env.ISSUE401_PG_URL;
const pgDescribe = pgUrl ? describe : describe.skip;
const secret = 'issue401-isolated-test-jwt-only';

pgDescribe('MANUAL-122 real PostgreSQL, HTTP, roles and organization scope', () => {
  let db: DataSource;
  let app: INestApplication;
  let scopes: DataScopeService;
  const users = [
    { id: 40101, username: 'fixture_reporter', role: 'ROLE_FARM_REPORTER', storeCode: 'LPH_FARM_A' },
    { id: 40102, username: 'fixture_peer', role: 'ROLE_FARM_REPORTER', storeCode: 'SITE-A' },
    { id: 40103, username: 'fixture_foreign', role: 'ROLE_FARM_REPORTER', storeCode: 'SITE-B' },
    { id: 40104, username: 'fixture_unbound', role: 'ROLE_FARM_REPORTER', storeCode: 'ALL' },
    { id: 40105, username: 'admin', role: 'ROLE_ADMIN', storeCode: 'ALL' },
    { id: 40106, username: 'fixture_site_reporter', role: 'ROLE_FARM_REPORTER', storeCode: 'SITE-A' },
    { id: 40107, username: 'fixture_site_and_foreign_company', role: 'ROLE_FARM_REPORTER', storeCode: 'SITE-A' },
    { id: 40108, username: 'fixture_site_and_own_company', role: 'ROLE_FARM_REPORTER', storeCode: 'SITE-A' },
    { id: 40109, username: 'fixture_extra_farm', role: 'ROLE_FARM_REPORTER', storeCode: '' },
  ];
  const token = (id: number) => sign({ sub: id }, secret, { expiresIn: '5m' });
  const read = (id: number, query: Record<string, string | number> = {}) => request(app.getHttpServer())
    .get('/api/crud/brd_daily_logs').query(query).auth(token(id), { type: 'bearer' });

  beforeAll(async () => {
    const url = new URL(pgUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/issue401_fixture') {
      throw new Error('Only loopback issue401_fixture is permitted');
    }
    db = await new DataSource({ type: 'postgres', url: pgUrl, synchronize: false,
      entities: [SysDataScopeEntity, SysOrganizationEntity, SysUserOrgEntity,
        SysUserProjectScopeEntity, SysUserWarehouseScopeEntity, SysUserFarmScopeEntity],
    }).initialize();
    // Fixture DDL is explicit: application schema synchronization and migrations remain disabled.
    await db.query(`
      CREATE TABLE IF NOT EXISTS sys_organizations (id bigint PRIMARY KEY, org_code text, org_name text,
        org_type text, level int, status text, company_code text, project_code text, warehouse_code text,
        parent_id bigint, site_code text, sort_order int);
      CREATE TABLE IF NOT EXISTS sys_user_orgs (id bigserial PRIMARY KEY, user_id bigint, org_id bigint,
        is_primary boolean, data_scope_level text, is_manager boolean, UNIQUE(user_id,org_id));
      CREATE TABLE IF NOT EXISTS sys_data_scopes (id bigserial PRIMARY KEY, role_code text,module_code text,
        scope_type text,enabled boolean,created_at timestamptz DEFAULT now(),UNIQUE(role_code,module_code));
      CREATE TABLE IF NOT EXISTS sys_user_project_scopes (id bigserial PRIMARY KEY,user_id bigint,project_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS sys_user_warehouse_scopes (id bigserial PRIMARY KEY,user_id bigint,warehouse_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS sys_user_farm_scopes (id bigserial PRIMARY KEY,user_id bigint,farm_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS wms_warehouses (warehouse_code text, company_code text, status text, domain text);
      CREATE TABLE IF NOT EXISTS brd_farms (farm_code text PRIMARY KEY, company_code text, mapped_site_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_houses (house_code text PRIMARY KEY, house_name text, farm_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_flocks (flock_no text PRIMARY KEY, house_code text, current_qty int, initial_qty int, current_lay_rate numeric);
      CREATE TABLE IF NOT EXISTS brd_daily_logs (id serial PRIMARY KEY, house_code text, farm_code text,
        site_code text, company_code text, flock_no text, log_date date, business_date date,
        shift text, eggs_produced int, mortality_qty int, elimination_qty int, feed_consumed numeric,
        opening_qty int, closing_qty int, lay_rate numeric, operator text, note text,
        created_at timestamptz DEFAULT now(), UNIQUE(log_date, house_code, shift));
      CREATE TABLE IF NOT EXISTS fixture_users (id int PRIMARY KEY, username text, role text, store_code text);
      CREATE TABLE IF NOT EXISTS fixture_role_permissions (role text, permission text, PRIMARY KEY(role, permission));
      CREATE TABLE IF NOT EXISTS inv_batches (batch_no text, product_code text, created_at timestamptz);
      INSERT INTO brd_farms VALUES ('LPH_FARM_A','COMP-A','SITE-A','ACTIVE'),('LPH_FARM_B','COMP-B','SITE-B','ACTIVE'),('LPH_FARM_A2','COMP-A','SITE-A2','ACTIVE') ON CONFLICT DO NOTHING;
      INSERT INTO brd_houses VALUES ('HOUSE-A','Fixture House A','LPH_FARM_A','ACTIVE'),('HOUSE-B','Fixture House B','LPH_FARM_B','ACTIVE'),('HOUSE-A2','Fixture House A2','LPH_FARM_A2','ACTIVE') ON CONFLICT DO NOTHING;
      INSERT INTO brd_flocks VALUES ('FLOCK-A','HOUSE-A',100,100,0) ON CONFLICT DO NOTHING;
      INSERT INTO fixture_role_permissions VALUES ('ROLE_FARM_REPORTER','MENU_FARM_DATA:V'),('ROLE_FARM_REPORTER','MENU_FARM_DAILY:E'),('ROLE_ADMIN','*') ON CONFLICT DO NOTHING;
    `);
    for (const user of users) await db.query('INSERT INTO fixture_users VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [user.id, user.username, user.role, user.storeCode]);
    for (const [i, company] of ['COMP-A', 'COMP-B'].entries()) {
      await db.query(`INSERT INTO sys_organizations (id,org_code,org_name,org_type,level,status,company_code,sort_order)
        VALUES ($1,$2,$2,'COMPANY',2,'ACTIVE',$2,0) ON CONFLICT DO NOTHING`, [40101 + i, company]);
    }
    await db.query(`INSERT INTO sys_organizations(id,org_code,org_name,org_type,level,status,parent_id,sort_order)
      VALUES (40103,'SITE-A','Fixture Site A','SITE',3,'ACTIVE',40101,0) ON CONFLICT DO NOTHING`);
    for (const [id, org] of [[40107,40103],[40107,40102],[40108,40103],[40108,40101],[40106,40103],[40101,40101],[40102,40101],[40103,40102]]) {
      await db.query(`INSERT INTO sys_user_orgs (user_id,org_id,is_primary,data_scope_level,is_manager)
        VALUES ($1,$2,true,'COMPANY',false) ON CONFLICT DO NOTHING`, [id, org]);
    }
    await db.query(`INSERT INTO sys_user_farm_scopes(user_id,farm_code) SELECT 40109,'LPH_FARM_B'
      WHERE NOT EXISTS(SELECT 1 FROM sys_user_farm_scopes WHERE user_id=40109)`);
    await db.query(`INSERT INTO sys_data_scopes(role_code,module_code,scope_type,enabled)
      VALUES ('ROLE_FARM_REPORTER','MENU_FARM_DATA','COMPANY',true),('ROLE_FARM_REPORTER','MENU_FARM_DAILY','COMPANY',true) ON CONFLICT DO NOTHING`);

    class FixtureJwtStrategy extends PassportStrategy(Strategy) {
      constructor() { super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: secret }); }
      async validate(payload: { sub: number }) {
        const [user] = await db.query('SELECT * FROM fixture_users WHERE id=$1', [payload.sub]);
        if (!user) return null;
        const permissions = (await db.query('SELECT permission FROM fixture_role_permissions WHERE role=$1', [user.role])).map((row: { permission: string }) => row.permission);
        return { userId: String(user.id), username: user.username, role: user.role, roles: [user.role], storeCode: user.store_code, permissions };
      }
    }
    const module = await Test.createTestingModule({
      imports: [PassportModule, ClsModule.forRoot({ global: true, middleware: { mount: true } })],
      controllers: [GenericCrudController, FarmController],
      providers: [FixtureJwtStrategy, GenericCrudService, FarmService, OrgOwnershipService,
        { provide: EntityManager, useValue: db.manager }, { provide: WmsService, useValue: {} },
        { provide: DataScopeService, inject: [ClsService, OrgOwnershipService], useFactory: (cls: ClsService, ownership: OrgOwnershipService) =>
          new DataScopeService(db.getRepository(SysDataScopeEntity), db.getRepository(SysUserOrgEntity),
            db.getRepository(SysUserProjectScopeEntity), db.getRepository(SysUserWarehouseScopeEntity),
            db.getRepository(SysUserFarmScopeEntity), db.getRepository(SysOrganizationEntity), cls, ownership) },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    scopes = app.get(DataScopeService);
  }, 30000);

  afterAll(async () => { await app?.close(); await db?.destroy(); });
  beforeEach(async () => {
    await db.query('TRUNCATE brd_daily_logs RESTART IDENTITY');
    await db.query("UPDATE fixture_users SET store_code='LPH_FARM_A' WHERE id=40101");
    users.forEach(user => scopes.invalidate(String(user.id)));
  });

  it('shows a saved report to its reporter immediately, on refresh, and after a new login token', async () => {
    await request(app.getHttpServer()).post('/api/v3/farm/daily-logs').auth(token(40101), { type: 'bearer' })
      .send({ house_code: 'HOUSE-A', log_date: '2026-10-17', shift: '早班', eggs_produced: 0, feed_consumed: 7, operator: 'fixture_reporter' })
      .expect(response => { expect(response.status).toBe(201); expect(response.body.code).toBe(200); });
    // The reported asymmetry is explicit: admin reads the persisted row first.
    expect((await read(40105).expect(200)).body.data).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      scopes.invalidate('40101'); // Fresh resolution simulates session/login renewal.
      const response = await read(40101).expect(200);
      expect(response.body.data).toEqual([expect.objectContaining({ house_code: 'HOUSE-A', farm_code: 'LPH_FARM_A', company_code: 'COMP-A', feed_consumed: '7' })]);
    }
    expect((await read(40102).expect(200)).body.data).toHaveLength(1);
    expect((await read(40105).expect(200)).body.data).toHaveLength(1);
    expect((await read(40103).expect(200)).body.data).toEqual([]);
  });

  it('keeps the exact canonical authorized set with stale/missing storeCode, crafted filters, and unbound users', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,farm_code,site_code,company_code,log_date,shift)
      VALUES ('HOUSE-A','LPH_FARM_A','SITE-A','COMP-A','2026-10-17','早班'),('HOUSE-B','LPH_FARM_B','SITE-B','COMP-B','2026-10-17','早班')`);
    for (const storeCode of ['SITE-STALE', '', 'LPH_FARM_A']) {
      await db.query('UPDATE fixture_users SET store_code=$1 WHERE id=40101', [storeCode]);
      const response = await read(40101).expect(200);
      expect(response.body.data.map((row: { house_code: string }) => row.house_code)).toEqual(['HOUSE-A']);
      expect((await read(40101, { house_code: 'HOUSE-B' }).expect(200)).body.data).toEqual([]);
      expect((await read(40101, { site_code: 'SITE-B', company_code: 'COMP-B' }).expect(200)).body.data).toEqual([]);
    }
    expect((await read(40103).expect(200)).body.data.map((row: { house_code: string }) => row.house_code)).toEqual(['HOUSE-B']);
    expect((await read(40104).expect(200)).body.data).toEqual([]);
    expect((await read(40105).expect(200)).body.data).toHaveLength(2);
    await request(app.getHttpServer()).post('/api/v3/farm/daily-logs').auth(token(40101), { type: 'bearer' })
      .send({ house_code: 'HOUSE-B', log_date: '2026-10-17', shift: '晚班', feed_consumed: 7 }).expect(400);
  });

  it('does not expand a SITE user to other farms in its parent company', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,farm_code,site_code,company_code,log_date,shift)
      VALUES ('HOUSE-A','LPH_FARM_A','SITE-A','COMP-A','2026-10-17','早班'),
      ('HOUSE-A2','LPH_FARM_A2','SITE-A2','COMP-A','2026-10-17','早班')`);
    const rows = (await read(40106).expect(200)).body.data;
    expect(rows.map((row: {house_code: string}) => row.house_code)).toEqual(['HOUSE-A']);
    expect((await read(40106, {house_code: 'HOUSE-A2'}).expect(200)).body.data).toEqual([]);
    expect((await read(40101).expect(200)).body.data).toHaveLength(2);
  });

  it('retains mixed explicit company grants and extra farm grants without parent-company escalation', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift)
      VALUES ('HOUSE-A','2026-10-17','早班'),('HOUSE-A2','2026-10-17','早班'),('HOUSE-B','2026-10-17','早班')`);
    const site = await scopes.resolve('40106',['ROLE_FARM_REPORTER'],'MENU_FARM_DATA');
    expect(site.allowedCompanyCodes).toEqual(['COMP-A']);
    expect(Reflect.get(site, 'allowedBreedingCompanyCodes')).toEqual([]);
    const mixedForeign = await scopes.resolve('40107',['ROLE_FARM_REPORTER'],'MENU_FARM_DATA');
    expect(Reflect.get(mixedForeign, 'allowedBreedingCompanyCodes')).toEqual(['COMP-B']);
    expect((await read(40107).expect(200)).body.data.map((row:{house_code:string})=>row.house_code).sort()).toEqual(['HOUSE-A','HOUSE-B']);
    const mixedOwn = await scopes.resolve('40108',['ROLE_FARM_REPORTER'],'MENU_FARM_DATA');
    expect(Reflect.get(mixedOwn, 'allowedBreedingCompanyCodes')).toEqual(['COMP-A']);
    expect((await read(40108).expect(200)).body.data.map((row:{house_code:string})=>row.house_code).sort()).toEqual(['HOUSE-A','HOUSE-A2']);
    const farm = await scopes.resolve('40109',['ROLE_FARM_REPORTER'],'MENU_FARM_DATA');
    expect(farm.allowedFarmCodes).toEqual(['LPH_FARM_B']);
    expect(farm.allowedCompanyCodes).toEqual([]);
    expect((await read(40109).expect(200)).body.data.map((row:{house_code:string})=>row.house_code)).toEqual(['HOUSE-B']);
  });

  it('reads sparse historical rows by house ownership and rejects forged ownership snapshots', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES ('HOUSE-A','2026-10-16','早班');
      INSERT INTO brd_daily_logs(house_code,farm_code,site_code,company_code,log_date,shift)
      VALUES ('HOUSE-B','LPH_FARM_A','SITE-A','COMP-A','2026-10-17','早班')`);
    expect((await read(40106).expect(200)).body.data.map((row:{house_code:string}) => row.house_code)).toEqual(['HOUSE-A']);
    expect((await read(40101).expect(200)).body.data.map((row:{house_code:string}) => row.house_code)).toEqual(['HOUSE-A']);
    expect((await read(40103).expect(200)).body.data.map((row:{house_code:string}) => row.house_code)).toEqual(['HOUSE-B']);
  });

  it('filters house/date before pagination, so other authorized rows cannot hide the selected report', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,farm_code,site_code,log_date,shift)
      SELECT 'HOUSE-A2','LPH_FARM_A2','SITE-A2','2026-10-17',n::text FROM generate_series(1,130) n;
      INSERT INTO brd_daily_logs(house_code,farm_code,site_code,log_date,shift)
      VALUES ('HOUSE-A','LPH_FARM_A','SITE-A','2026-10-01','早班')`);
    const response = await read(40101, { house_code: 'HOUSE-A', log_date: '2026-10-01', limit: 30 }).expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].house_code).toBe('HOUSE-A');
  });

  it('still requires authentication and the existing read permission', async () => {
    await request(app.getHttpServer()).get('/api/crud/brd_daily_logs').expect(401);
    await db.query("DELETE FROM fixture_role_permissions WHERE role='ROLE_FARM_REPORTER' AND permission='MENU_FARM_DATA:V'");
    try { await read(40101).expect(403); }
    finally { await db.query("INSERT INTO fixture_role_permissions VALUES ('ROLE_FARM_REPORTER','MENU_FARM_DATA:V')"); }
  });
});
