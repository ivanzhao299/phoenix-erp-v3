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
import { InventorySourceController } from '../sales-v2/controllers/inventory-source.controller';
import { ProductionInboundService } from '../sales-v2/services/production-inbound.service';
import { EggSourceProfiles1794400001000 } from '../../database/migrations/1794400001000-EggSourceProfiles';
import { SkuAvailabilityService } from '../product-master/services/sku-availability.service';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { InventorySourceModeService } from '../sales-v2/services/inventory-source-mode.service';
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
    ...[40110, 40111, 40112, 40113, 40114].map(id => ({ id, username: `fixture_dept_${id}`, role: 'ROLE_FARM_REPORTER', storeCode: 'ALL' })),
  ];
  let tokenSequence = 0;
  const token = (id: number) => sign({ sub: id, jti: `issue401-${++tokenSequence}` }, secret, { expiresIn: '5m' });
  const read = (id: number, query: Record<string, string | number> = {}) => request(app.getHttpServer())
    .get('/api/crud/brd_daily_logs').query(query).auth(token(id), { type: 'bearer' });

  beforeAll(async () => {
    const url = new URL(pgUrl!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/issue401_fixture' || !process.env.ISSUE401_FIXTURE_OWNER) {
      throw new Error('Only loopback issue401_fixture is permitted');
    }
    db = await new DataSource({ type: 'postgres', url: pgUrl, synchronize: false,
      entities: [SysDataScopeEntity, SysOrganizationEntity, SysUserOrgEntity,
        SysUserProjectScopeEntity, SysUserWarehouseScopeEntity, SysUserFarmScopeEntity],
    }).initialize();
    const owners: Array<{owner_key:string}> = await db.query('SELECT owner_key FROM issue401_fixture_owner');
    if (owners.length !== 1 || owners[0].owner_key !== process.env.ISSUE401_FIXTURE_OWNER) throw new Error('Fixture ownership mismatch');
    // Fixture DDL is explicit: application schema synchronization and migrations remain disabled.
    await db.query(`
      CREATE TABLE IF NOT EXISTS sys_organizations (id bigint PRIMARY KEY, org_code text, org_name text,
        org_type text, level int, status text, company_code text, project_code text, warehouse_code text,
        parent_id bigint, site_code text, sort_order int);
      CREATE TABLE IF NOT EXISTS sys_user_orgs (id bigserial PRIMARY KEY, user_id bigint, org_id bigint,
        is_primary boolean, data_scope_level text, is_manager boolean, UNIQUE(user_id,org_id));
      CREATE TABLE IF NOT EXISTS sys_role (role_code text PRIMARY KEY, status text);
      CREATE TABLE IF NOT EXISTS sys_data_scopes (id bigserial PRIMARY KEY, role_code text,module_code text,
        scope_type text,enabled boolean,created_at timestamptz DEFAULT now(),UNIQUE(role_code,module_code));
      CREATE TABLE IF NOT EXISTS sys_user_project_scopes (id bigserial PRIMARY KEY,user_id bigint,project_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS sys_user_warehouse_scopes (id bigserial PRIMARY KEY,user_id bigint,warehouse_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS sys_user_farm_scopes (id bigserial PRIMARY KEY,user_id bigint,farm_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS wms_warehouses (warehouse_code text PRIMARY KEY, company_code text, status text, domain text, site_code text, type text);
      CREATE TABLE IF NOT EXISTS wms_locations (location_code text PRIMARY KEY, warehouse_code text, status text);
      CREATE TABLE IF NOT EXISTS product_grades (grade_code text PRIMARY KEY, status text, sort_order int, is_saleable boolean DEFAULT true);
      CREATE TABLE IF NOT EXISTS product_skus (sku_code text PRIMARY KEY, product_code text, grade_code text, spec_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_farms (farm_code text PRIMARY KEY, company_code text, mapped_site_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_houses (house_code text PRIMARY KEY, house_name text, farm_code text, status text);
      CREATE TABLE IF NOT EXISTS brd_flocks (flock_no text PRIMARY KEY, house_code text, current_qty int, initial_qty int, current_lay_rate numeric, farm_code text, status text, start_date date, updated_at timestamptz);
      CREATE TABLE IF NOT EXISTS brd_daily_logs (id serial PRIMARY KEY, house_code text, farm_code text,
        site_code text, company_code text, flock_no text, log_date date, business_date date,
        shift text, eggs_produced int, eggs_by_grade jsonb, dirty_eggs int, broken_eggs int, mortality_qty int, elimination_qty int, feed_consumed numeric,
        opening_qty int, closing_qty int, lay_rate numeric, operator text, note text,
        created_at timestamptz DEFAULT now(), UNIQUE(log_date, house_code, shift));
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS temp numeric(5,2), ADD COLUMN IF NOT EXISTS humidity numeric(5,2);
      CREATE TABLE IF NOT EXISTS fixture_users (id int PRIMARY KEY, username text, role text, store_code text);
      CREATE TABLE IF NOT EXISTS fixture_role_permissions (role text, permission text, PRIMARY KEY(role, permission));
      CREATE TABLE IF NOT EXISTS inv_batches (batch_no text UNIQUE, product_code text, company_code text, warehouse_code text, location_code text,
        egg_date date, inbound_date date, expire_date date, quality_grade text, packaging_spec text, source_type text, source_no text,
        qty numeric, qty_available numeric, status text, sku_code text, grade_code_std text, spec_code text,
        packaging_batch_ref text, collection_batch_ref text, created_at timestamptz, updated_at timestamptz);
      CREATE TABLE IF NOT EXISTS inv_ledger (id serial PRIMARY KEY, batch_no text REFERENCES inv_batches(batch_no), change_type text,
        qty_change numeric, operator text, store_code text, ref_no text, note text, batch_expire_date date,
        quality_grade text, company_code text, sku_code text, log_date date, warehouse_code text, location_code text);
      -- SkuAvailabilityService SKU 就绪链所需主数据（g202 末态）
      ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS variety_code text, ADD COLUMN IF NOT EXISTS org_context_required boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS effective_date date, ADD COLUMN IF NOT EXISTS expire_date date;
      CREATE TABLE IF NOT EXISTS mst_products (product_code text PRIMARY KEY, status text, unit text, unit_zh text, variety_code text);
      ALTER TABLE product_grades ADD COLUMN IF NOT EXISTS is_saleable boolean DEFAULT true, ADD COLUMN IF NOT EXISTS is_storable boolean DEFAULT true,
        ADD COLUMN IF NOT EXISTS stock_managed boolean, ADD COLUMN IF NOT EXISTS sale_enabled boolean, ADD COLUMN IF NOT EXISTS default_stock_status varchar(16);
      CREATE TABLE IF NOT EXISTS packaging_specs (spec_code text PRIMARY KEY, status text, base_unit text, display_unit text, qty_per_unit numeric(10,2));
      CREATE TABLE IF NOT EXISTS md_product_varieties (variety_code text PRIMARY KEY, status text);
      CREATE TABLE IF NOT EXISTS md_variety_breeds (id serial PRIMARY KEY, variety_code text, breed_code text);
      CREATE TABLE IF NOT EXISTS md_sku_org_scope (sku_code text, scope_type text, scope_code text, status text DEFAULT 'ACTIVE', sale_enabled boolean DEFAULT true, stock_enabled boolean DEFAULT true, effective_date date, expire_date date, PRIMARY KEY(sku_code, scope_type, scope_code));
      -- inv-opt：跟随迁移末态（variety 维度 + issue532 + 批次 4 InvEggCostingColumns）
      ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS cost_change numeric(18,6);
      ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS unit_cost numeric(18,6) NOT NULL DEFAULT 0;
      ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS variety_code text;
      ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS inventory_class text NOT NULL DEFAULT 'STANDARD', ADD COLUMN IF NOT EXISTS unit text, ADD COLUMN IF NOT EXISTS base_quantity_version integer;
      INSERT INTO product_grades (grade_code,status,sort_order) VALUES ('GRADE_1','ACTIVE',1) ON CONFLICT DO NOTHING;
      INSERT INTO product_skus VALUES ('SKU-1','PRD-EGG-RAW','GRADE_1','LOOSE','ACTIVE') ON CONFLICT DO NOTHING;
      INSERT INTO wms_warehouses VALUES ('WH-A','COMP-A','ACTIVE','OPERATIONAL','SITE-A','EGG_FARM') ON CONFLICT DO NOTHING;
      INSERT INTO wms_locations VALUES ('LOC-A','WH-A','ACTIVE') ON CONFLICT DO NOTHING;
      INSERT INTO brd_farms VALUES ('LPH_FARM_A','COMP-A','SITE-A','ACTIVE'),('LPH_FARM_B','COMP-B','SITE-B','ACTIVE'),('LPH_FARM_A2','COMP-A','SITE-A2','ACTIVE') ON CONFLICT DO NOTHING;
      INSERT INTO brd_houses VALUES ('HOUSE-A','Fixture House A','LPH_FARM_A','ACTIVE'),('HOUSE-B','Fixture House B','LPH_FARM_B','ACTIVE'),('HOUSE-A2','Fixture House A2','LPH_FARM_A2','ACTIVE') ON CONFLICT DO NOTHING;
      INSERT INTO brd_flocks (flock_no,house_code,current_qty,initial_qty,current_lay_rate,farm_code,status,start_date) VALUES ('FLOCK-A','HOUSE-A',100,100,0,'LPH_FARM_A','LAYING','2026-01-01') ON CONFLICT DO NOTHING;
      INSERT INTO fixture_role_permissions VALUES ('ROLE_FARM_REPORTER','MENU_FARM_DATA:V'),('ROLE_FARM_REPORTER','MENU_FARM_DAILY:E'),('ROLE_FARM_REPORTER','MENU_PROD_INBOUND:C'),('ROLE_ADMIN','*') ON CONFLICT DO NOTHING;
    `);
    // SkuAvailabilityService（2026-11-11 起 ProductionInboundService 依赖）需要 source profile 表：
    // 复用 EggSourceProfiles 迁移类建表，与 farm-egg.pg.spec 同一模式。
    {
      const sourceRunner = db.createQueryRunner();
      await sourceRunner.connect();
      try { if (!(await sourceRunner.hasTable('md_egg_source_profiles'))) await new EggSourceProfiles1794400001000().up(sourceRunner); }
      finally { await sourceRunner.release(); }
    }
    await db.query(`INSERT INTO mst_products VALUES ('PRD-EGG-RAW','ACTIVE','枚','枚',NULL) ON CONFLICT DO NOTHING;
      INSERT INTO product_grades VALUES ('GRADE_1','ACTIVE',1,true) ON CONFLICT DO NOTHING;
      INSERT INTO packaging_specs VALUES ('LOOSE','ACTIVE','枚','枚',1) ON CONFLICT DO NOTHING`);
    // SKU 就绪链：GRADE_1/LOOSE 需有适用 COMP-A 的 SKU（与 farm-egg 同构）
    await db.query(`INSERT INTO product_skus (sku_code,product_code,grade_code,spec_code,status,variety_code)
      VALUES ('SKU-GRADE_1','PRD-EGG-RAW','GRADE_1','LOOSE','ACTIVE',NULL) ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO md_sku_org_scope (sku_code,scope_type,scope_code,status,sale_enabled,stock_enabled)
      VALUES ('SKU-GRADE_1','COMPANY','COMP-A','ACTIVE',true,true) ON CONFLICT DO NOTHING`);
    // HOUSE-A 的生产入库需要已批准的 source profile（SkuAvailabilityService.resolveSourceProfile fail-closed）
    await db.query(`INSERT INTO md_egg_source_profiles (profile_code,company_code,farm_code,site_code,house_code,product_mode,variety_code,effective_date)
      VALUES ('SOURCE-HA','COMP-A','LPH_FARM_A','SITE-A','HOUSE-A','STANDARD',NULL,'2026-01-01') ON CONFLICT DO NOTHING`);

    for (const user of users) await db.query('INSERT INTO fixture_users VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [user.id, user.username, user.role, user.storeCode]);
    for (const [i, company] of ['COMP-A', 'COMP-B'].entries()) {
      await db.query(`INSERT INTO sys_organizations (id,org_code,org_name,org_type,level,status,company_code,sort_order)
        VALUES ($1,$2,$2,'COMPANY',2,'ACTIVE',$2,0) ON CONFLICT DO NOTHING`, [40101 + i, company]);
    }
    await db.query(`INSERT INTO sys_organizations(id,org_code,org_name,org_type,level,status,parent_id,sort_order)
      VALUES (40103,'SITE-A','Fixture Site A','SITE',3,'ACTIVE',40101,0) ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO sys_organizations(id,org_code,org_name,org_type,level,status,parent_id,company_code,site_code,sort_order)
      VALUES (40104,'DEPT-EMPTY','Department without snapshots','DEPARTMENT',4,'ACTIVE',40103,NULL,NULL,0),
        (40105,'DEPT-COMP','Department with company snapshot','DEPARTMENT',4,'ACTIVE',40103,'COMP-A',NULL,0),
        (40106,'DEPT-SITE','Department with site snapshot','DEPARTMENT',4,'ACTIVE',40103,NULL,'SITE-A',0)
      ON CONFLICT DO NOTHING`);
    for (const [id, org] of [[40110,40104],[40111,40105],[40112,40106],[40113,40106],[40114,40105],[40114,40103]]) {
      await db.query(`INSERT INTO sys_user_orgs(user_id,org_id,is_primary,data_scope_level,is_manager)
        VALUES ($1,$2,true,'SELF',false) ON CONFLICT DO NOTHING`, [id,org]);
    }
    await db.query(`INSERT INTO sys_user_farm_scopes(user_id,farm_code) SELECT 40113,'LPH_FARM_B'
      WHERE NOT EXISTS(SELECT 1 FROM sys_user_farm_scopes WHERE user_id=40113)`);
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
      controllers: [GenericCrudController, FarmController, InventorySourceController],
      providers: [FixtureJwtStrategy, GenericCrudService, FarmService, OrgOwnershipService, ProductionInboundService, EggInventoryService, SkuAvailabilityService, // 2026-11-11 起 ProductionInboundService 依赖（DI 缺口修复）
        { provide: DataSource, useValue: db },
        { provide: InventorySourceModeService, useValue: { resolveMode: async () => 'TEMP_PRODUCTION_INBOUND' } },
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
    await db.query('TRUNCATE brd_daily_logs, inv_ledger, inv_batches RESTART IDENTITY');
    await db.query("UPDATE fixture_users SET store_code='LPH_FARM_A' WHERE id=40101");
    users.forEach(user => scopes.invalidate(String(user.id)));
  });

  it.each([false, true])('preserves each quantity in a legacy mobile report (saleable defects: %s)', async (saleable) => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
    await db.query(`INSERT INTO product_grades VALUES ('DIRTY','ACTIVE',7,$1),('BROKEN','ACTIVE',8,$1)
      ON CONFLICT (grade_code) DO UPDATE SET is_saleable=EXCLUDED.is_saleable`, [saleable]);
    await db.query('ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS production_input_kind text');
    const payload = { house_code: 'HOUSE-A', log_date: date, shift: '早班',
      eggs_produced: 100, dirty_eggs: 2, broken_eggs: 1, eggs_by_grade: { DIRTY: 2, BROKEN: 1 },
    };
    const submit = () => request(app.getHttpServer()).post('/api/v3/farm/daily-logs')
      .auth(token(40101), { type: 'bearer' }).send(payload);
    await submit().expect(201);
    await submit().expect(201);
    const saved = (await read(40101, { house_code: 'HOUSE-A', log_date: date }).expect(200)).body.data;
    expect(saved).toEqual([expect.objectContaining({ eggs_produced: 100, dirty_eggs: 2, broken_eggs: 1, eggs_by_grade: {} })]);
    expect(await db.query('SELECT * FROM inv_ledger')).toEqual([]);
    expect(await db.query('SELECT production_input_kind FROM brd_daily_logs'))
      .toEqual([{ production_input_kind: 'LEGACY_MOBILE_SUMMARY' }]);
  });

  it.each(['DAILY', 'ALL'])('keeps day reports and shift reports exclusive in either write order (%s)', async shift => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
    await db.query('ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS production_input_kind text');
    const day = { house_code: 'HOUSE-A', log_date: date, shift, eggs_by_grade: { GRADE_1: 100 } };
    const morning = { house_code: 'HOUSE-A', log_date: date, shift: '早班', eggs_produced: 100,
      dirty_eggs: 2, broken_eggs: 1, eggs_by_grade: { DIRTY: 2, BROKEN: 1 } };
    const submit = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v3/farm/daily-logs')
      .auth(token(40101), { type: 'bearer' }).send(body);

    await submit(morning).expect(201);
    await submit({ ...morning, shift: '晚班' }).expect(201);
    await submit(day).expect(400).expect(({ body }) => expect(body.message).toContain('不能同时登记'));
    const savedShifts = await db.query('SELECT shift FROM brd_daily_logs ORDER BY id');
    expect(savedShifts).toEqual([{ shift: '早班' }, { shift: '晚班' }]);

    await db.query('DELETE FROM brd_daily_logs');
    await submit(day).expect(201);
    await submit(morning).expect(400).expect(({ body }) => expect(body.message).toContain('不能同时登记'));
    expect(await db.query('SELECT shift FROM brd_daily_logs')).toEqual([{ shift }]);
  });

  it('rejects stale mobile retries even after another operator restores the original quantities', async () => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
    await db.query('ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS production_input_kind text');
    const query = { house_code: 'HOUSE-A', log_date: date };
    const original = { ...query, shift: '早班', eggs_produced: 85, dirty_eggs: 2, broken_eggs: 1,
      temp: 26.5, humidity: null, eggs_by_grade: { DIRTY: 2, BROKEN: 1 } };
    const submit = (body: Record<string, unknown>, id = 40101) => request(app.getHttpServer()).post('/api/v3/farm/daily-logs')
      .auth(token(id), { type: 'bearer' }).send(body);
    const first = await submit(original).expect(201);
    const [saved] = (await read(40101, query).expect(200)).body.data;
    expect(saved.report_version).toEqual(expect.any(String));
    expect(first.body.reportVersion).toBe(saved.report_version);
    const operatorA = { ...original, eggs_produced: 100, expectedReportVersion: saved.report_version };
    const aWritten = await submit(operatorA).expect(201);
    expect(aWritten.body.reportVersion).not.toBe(first.body.reportVersion);
    const newer = await submit({ ...original, eggs_produced: 120, expectedReportVersion: aWritten.body.reportVersion }, 40105).expect(201);
    await submit(operatorA).expect(409);
    const restored = await submit({ ...original, expectedReportVersion: newer.body.reportVersion }, 40105).expect(201);
    expect(restored.body.reportVersion).not.toBe(first.body.reportVersion);
    await submit(operatorA).expect(409);
    await submit({ ...original, eggs_produced: 90 }).expect(409);
    const sameValueRetry = await submit(original).expect(201);
    expect(sameValueRetry.body.reportVersion).toBe(restored.body.reportVersion);
    expect((await read(40101, query).expect(200)).body.data).toEqual([expect.objectContaining({
      report_version: restored.body.reportVersion, eggs_produced: 85, dirty_eggs: 2, broken_eggs: 1,
    })]);
    expect(await db.query('SELECT * FROM inv_ledger')).toEqual([]);
  });

  it('marks a defects-only legacy report as missing grades for warehouse handover', async () => {
    const date = '2026-10-17';
    await db.query(`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS production_input_kind text;
      INSERT INTO brd_daily_logs
        (house_code, farm_code, company_code, log_date, shift, eggs_produced, dirty_eggs, eggs_by_grade, production_input_kind)
      VALUES ('HOUSE-A', 'LPH_FARM_A', 'COMP-A', '2026-10-17', '早班', 0, 3, '{}', 'LEGACY_MOBILE_SUMMARY')`);
    const breakdown = await request(app.getHttpServer()).get('/api/v3/farm/daily-logs/eggs-breakdown')
      .query({ date, houseCode: 'HOUSE-A' }).auth(token(40105), { type: 'bearer' }).expect(200);
    expect(breakdown.body).toMatchObject({ logs: 1, reportedEggs: 0, missingBreakdownLogs: 1, total: 0 });
  });

  it('production archives count and find records beyond the old 100-row cutoff within the role scope', async () => {
    await db.query(`CREATE TABLE IF NOT EXISTS sys_dict (
        dict_type text,dict_code text,status text,dict_label_zh text,dict_label_en text,dict_label_lo text);
      INSERT INTO sys_dict(dict_type,dict_code,status,dict_label_zh,dict_label_en,dict_label_lo)
        VALUES('BRD_BREED','ARCHIVE-BREED','ACTIVE','复核品种','Archive breed English','ສາຍພັນເອກະສານ');
      ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_name text, ADD COLUMN IF NOT EXISTS farm_name_en text;
      UPDATE brd_farms SET farm_name_en='Field farm English' WHERE farm_code='LPH_FARM_A';
      ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS capacity int, ADD COLUMN IF NOT EXISTS max_capacity int;
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS placement_date date, ADD COLUMN IF NOT EXISTS breed_code text;
      INSERT INTO brd_flocks(flock_no,house_code,current_qty,initial_qty,farm_code,status,start_date,breed_code)
      SELECT 'ARCHIVE-' || lpad(n::text,3,'0'),'HOUSE-A',0,10,'LPH_FARM_A','RETIRED','2026-01-01','ARCHIVE-BREED'
        FROM generate_series(1,101) n`);
    try {
      const get = (id: number, name: string, query = {}) => request(app.getHttpServer())
        .get('/api/v3/farm/archive/' + name).query(query).auth(token(id), { type: 'bearer' });
      const page = await get(40101, 'flocks', { search: 'ARCHIVE-', page: 5 }).expect(200);
      expect(page.body.total).toBe(101);
      expect(page.body.items).toEqual([expect.objectContaining({
        flock_no: 'ARCHIVE-101', company_code: 'COMP-A', site_code: 'SITE-A',
      })]);
      const byFarm = await get(40101, 'flocks', { search: 'Field farm English', status: 'RETIRED', page: 5 }).expect(200);
      expect(byFarm.body.total).toBe(101);
      const byBreed = await get(40101, 'flocks', { search: 'ສາຍພັນເອກະສານ', page: 5 }).expect(200);
      expect(byBreed.body.total).toBe(101);
      expect(byBreed.body.items).toEqual([expect.objectContaining({ flock_no: 'ARCHIVE-101' })]);
      const other = await get(40103, 'flocks', { search: 'ARCHIVE-' }).expect(200);
      expect(other.body.items).toEqual([]);
      const houses = await get(40105, 'houses', { search: 'HOUSE-A', farmCode: 'LPH_FARM_A' }).expect(200);
      expect(houses.body.items).toEqual([expect.objectContaining({ house_code: 'HOUSE-A', archive_birds: 100 })]);
      await db.query("UPDATE brd_flocks SET current_qty=1 WHERE flock_no='ARCHIVE-101'");
      const conflict = await get(40105, 'houses', { search: 'HOUSE-A', farmCode: 'LPH_FARM_A' }).expect(200);
      expect(conflict.body.items).toEqual([expect.objectContaining({ house_code: 'HOUSE-A', archive_birds: null, archive_normal: false })]);
      await db.query("UPDATE brd_flocks SET farm_code=NULL WHERE flock_no='ARCHIVE-101'");
      const orphan = await get(40105, 'flocks', { search: 'ARCHIVE-101' }).expect(200);
      expect(orphan.body.items).toEqual([expect.objectContaining({ flock_no: 'ARCHIVE-101', company_code: null })]);
      const scoped = await get(40101, 'flocks', { search: 'ARCHIVE-101' }).expect(200);
      expect(scoped.body.items).toEqual([]);
      const unresolved = await get(40105, 'houses', { search: 'HOUSE-A', farmCode: 'LPH_FARM_A' }).expect(200);
      expect(unresolved.body.items).toEqual([expect.objectContaining({ house_code: 'HOUSE-A', archive_birds: null, archive_normal: false })]);
    } finally {
      await db.query(`DELETE FROM brd_flocks WHERE flock_no LIKE 'ARCHIVE-%';
        DELETE FROM sys_dict WHERE dict_type='BRD_BREED' AND dict_code='ARCHIVE-BREED';
        UPDATE brd_farms SET farm_name_en=NULL WHERE farm_code='LPH_FARM_A'`);
    }
  });

  it('shows a saved report to its reporter immediately, on refresh, and after a new login token', async () => {
    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
    await request(app.getHttpServer()).post('/api/v3/farm/daily-logs').auth(token(40101), { type: 'bearer' })
      .send({ house_code: 'HOUSE-A', log_date: businessDate, shift: '早班', eggs_produced: 0, feed_consumed: 7, operator: 'fixture_reporter' })
      .expect(response => { expect(response.status).toBe(201); expect(response.body.code).toBe(200); });
    // The reported asymmetry is explicit: admin reads the persisted row first.
    expect((await read(40105).expect(200)).body.data).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      scopes.invalidate('40101'); // Fresh resolution simulates session/login renewal.
      const response = await read(40101).expect(200);
      expect(response.body.data).toEqual([expect.objectContaining({ house_code: 'HOUSE-A', farm_code: 'LPH_FARM_A', company_code: 'COMP-A', feed_consumed: '7', log_date: businessDate })]);
    }
    expect((await read(40102).expect(200)).body.data).toHaveLength(1);
    expect((await read(40105).expect(200)).body.data).toHaveLength(1);
    expect((await read(40103).expect(200)).body.data).toEqual([]);
  });

  it('combines a saved report, scoped query, inventory inbound and idempotent retry over real HTTP/PG', async () => {
    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
    await request(app.getHttpServer()).post('/api/v3/farm/daily-logs').auth(token(40101),{type:'bearer'})
      .send({house_code:'HOUSE-A',log_date:businessDate,shift:'早班',eggs_produced:33,eggs_by_grade:{GRADE_1:33}})
      .expect(201).expect(response=>expect(response.body.code).toBe(200));
    const query = {house_code:'HOUSE-A',log_date:businessDate};
    const saved = (await read(40101,query).expect(200)).body.data;
    expect(saved).toEqual([expect.objectContaining({log_date:businessDate,eggs_by_grade:{GRADE_1:33},eggs_produced:33})]);
    const payload = {houseCode:'HOUSE-A',eggDate:businessDate,items:[{grade:'GRADE_1',qty:11},{grade:'GRADE_1',qty:22}]};
    const inbound = () => request(app.getHttpServer()).post('/api/v2/inventory/production-inbound').auth(token(40101),{type:'bearer'}).send(payload);
    const first = (await inbound().expect(201)).body;
    const retry = (await inbound().expect(201)).body;
    expect(first).toMatchObject({idempotent:false,totalInbound:33});
    expect(retry).toMatchObject({idempotent:true,totalInbound:33,batches:first.batches});
    // source identity 唯一 + upsert 累加（1792000000000-EnforceTempProductionSourceIdentity）：
    // 同日同等级同规格的两条目合并为一批 33（一行台账）
    expect(new Set(retry.batches.map((row:{batchNo:string})=>row.batchNo)).size).toBe(1);
    expect((await db.query('SELECT count(*)::int AS count FROM inv_batches'))[0].count).toBe(1);
    expect((await db.query('SELECT count(*)::int AS count FROM inv_ledger'))[0].count).toBe(1);
    expect((await read(40101,query).expect(200)).body.data).toEqual(saved);
    expect((await read(40103,query).expect(200)).body.data).toEqual([]);
    await request(app.getHttpServer()).post('/api/v2/inventory/production-inbound').auth(token(40101),{type:'bearer'})
      .send({...payload,houseCode:'HOUSE-B'}).expect(403);
    expect((await read(40105,query).expect(200)).body.data).toEqual(saved);
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
      .send({ house_code: 'HOUSE-B', log_date: '2026-10-17', shift: '晚班', feed_consumed: 7 }).expect(403);
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

  it('does not turn department snapshots or ancestor projections into daily report grants', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift)
      VALUES ('HOUSE-A','2026-10-17','早班'),('HOUSE-A2','2026-10-17','早班'),('HOUSE-B','2026-10-17','早班')`);
    for (const id of [40110,40111,40112]) {
      expect((await read(id).expect(200)).body.data).toEqual([]);
      expect((await read(id,{house_code:'HOUSE-A'}).expect(200)).body.data).toEqual([]);
    }
    expect((await read(40113).expect(200)).body.data.map((row:{house_code:string})=>row.house_code)).toEqual(['HOUSE-B']);
    expect((await read(40114).expect(200)).body.data.map((row:{house_code:string})=>row.house_code)).toEqual(['HOUSE-A']);
  });

  it('does not grant daily reads through inactive COMPANY or SITE bindings', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES ('HOUSE-A','2026-10-17','早班')`);
    for (const [orgId,userId] of [[40101,40101],[40103,40106]]) {
      await db.query("UPDATE sys_organizations SET status='INACTIVE' WHERE id=$1",[orgId]);
      scopes.invalidate(String(userId));
      try { expect((await read(userId).expect(200)).body.data).toEqual([]); }
      finally { await db.query("UPDATE sys_organizations SET status='ACTIVE' WHERE id=$1",[orgId]); scopes.invalidate(String(userId)); }
    }
  });

  it('revokes a warm GROUP binding immediately when its organization becomes inactive', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift)
      VALUES ('HOUSE-A','2026-10-17','早班'),('HOUSE-B','2026-10-17','早班')`);
    await db.query(`INSERT INTO sys_organizations(id,org_code,org_type,status) VALUES (40107,'GROUP-FIXTURE','GROUP','ACTIVE') ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) VALUES (40104,40107,'GROUP') ON CONFLICT DO NOTHING`);
    const sameToken = token(40104);
    const load = () => request(app.getHttpServer()).get('/api/crud/brd_daily_logs').auth(sameToken,{type:'bearer'});
    try {
      expect((await load().expect(200)).body.data).toHaveLength(2);
      expect((await request(app.getHttpServer()).get('/api/crud/brd_flocks').auth(sameToken,{type:'bearer'}).expect(200)).body.data).toHaveLength(1);
      await db.query("UPDATE sys_organizations SET status='INACTIVE' WHERE id=40107");
      // Do not invalidate scope or renew the token: revocation must not wait for cache expiry.
      expect((await load().expect(200)).body.data).toEqual([]);
      expect((await request(app.getHttpServer()).get('/api/crud/brd_flocks').auth(sameToken,{type:'bearer'}).expect(200)).body.data).toEqual([]);
      expect(await scopes.eligibleWarehouseRecipients([{code:'40104',roles:['ROLE_FARM_REPORTER']}],'MENU_FARM_DATA','COMP-A','WH-A')).toEqual(new Set());
    } finally {
      await db.query('DELETE FROM sys_user_orgs WHERE user_id=40104 AND org_id=40107');
      await db.query("UPDATE sys_organizations SET status='ACTIVE' WHERE id=40107");
      scopes.invalidate('40104');
    }
  });

  it('retains independent roles and active company grants without inheriting an inactive GROUP', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift)
      VALUES ('HOUSE-A','2026-10-17','早班'),('HOUSE-B','2026-10-17','早班')`);
    await db.query(`INSERT INTO sys_organizations(id,org_code,org_type,status) VALUES (40107,'GROUP-FIXTURE','GROUP','INACTIVE') ON CONFLICT(id) DO UPDATE SET status='INACTIVE'`);
    await db.query(`INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) VALUES (40101,40107,'GROUP'),(40104,40107,'GROUP') ON CONFLICT DO NOTHING`);
    await db.query(`INSERT INTO sys_role VALUES('ROLE_GROUP_REPORTER','ACTIVE') ON CONFLICT(role_code) DO UPDATE SET status='ACTIVE';
      INSERT INTO fixture_users VALUES(40115,'fixture_role_global','ROLE_GROUP_REPORTER','ALL') ON CONFLICT DO NOTHING;
      INSERT INTO fixture_role_permissions VALUES('ROLE_GROUP_REPORTER','MENU_FARM_DATA:V') ON CONFLICT DO NOTHING;
      INSERT INTO sys_data_scopes(role_code,module_code,scope_type,enabled) VALUES('ROLE_GROUP_REPORTER','MENU_FARM_DATA','GROUP',true) ON CONFLICT(role_code,module_code) DO UPDATE SET enabled=true`);
    try {
      expect((await read(40104).expect(200)).body.data).toEqual([]);
      expect((await read(40101).expect(200)).body.data.map((r:{house_code:string})=>r.house_code)).toEqual(['HOUSE-A']);
      expect((await read(40101,{house_code:'HOUSE-B'}).expect(200)).body.data).toEqual([]);
      expect((await read(40115).expect(200)).body.data).toHaveLength(2);
      expect((await read(40105).expect(200)).body.data).toHaveLength(2);
      await db.query("UPDATE sys_data_scopes SET enabled=false WHERE role_code='ROLE_GROUP_REPORTER'");
      // Even the independent role cache is unusable after its live rule is revoked.
      expect((await read(40115).expect(200)).body.data).toEqual([]);
    } finally {
      await db.query('DELETE FROM sys_user_orgs WHERE org_id=40107');
      await db.query("UPDATE sys_organizations SET status='ACTIVE' WHERE id=40107");
      await db.query("DELETE FROM sys_data_scopes WHERE role_code='ROLE_GROUP_REPORTER'");
      scopes.invalidate('40115');
    }
  });

  it('denies an active SITE and child GROUP grant below an inactive ancestor', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES ('HOUSE-A','2026-10-17','早班')`);
    await db.query(`INSERT INTO sys_organizations(id,org_code,org_type,status) VALUES (40107,'GROUP-FIXTURE','GROUP','ACTIVE') ON CONFLICT(id) DO UPDATE SET status='ACTIVE'`);
    await db.query('UPDATE sys_organizations SET parent_id=40107 WHERE id=40101');
    await db.query("UPDATE sys_user_orgs SET data_scope_level='GROUP' WHERE user_id=40106 AND org_id=40103");
    try {
      expect((await read(40106).expect(200)).body.data).toHaveLength(1);
      await db.query("UPDATE sys_organizations SET status='INACTIVE' WHERE id=40107");
      expect((await read(40106).expect(200)).body.data).toEqual([]);
      expect((await read(40101).expect(200)).body.data).toEqual([]);
      expect(await scopes.eligibleWarehouseRecipients([{code:'40106',roles:['ROLE_FARM_REPORTER']}],'MENU_FARM_DATA','COMP-A','WH-A')).toEqual(new Set());
      await db.query("UPDATE sys_organizations SET status='ACTIVE' WHERE id=40107");
      expect((await read(40106).expect(200)).body.data).toHaveLength(1);
    } finally {
      await db.query('UPDATE sys_organizations SET parent_id=NULL WHERE id=40101');
      await db.query("UPDATE sys_organizations SET status='ACTIVE' WHERE id=40107");
      await db.query("UPDATE sys_user_orgs SET data_scope_level='COMPANY' WHERE user_id=40106 AND org_id=40103");
    }
  });

  it('fails closed for orphan and cyclic organization paths, then accepts a valid ACTIVE root', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift) VALUES ('HOUSE-B','2026-10-17','早班')`);
    await db.query(`INSERT INTO sys_organizations(id,org_code,org_type,status,parent_id) VALUES(40120,'GROUP-BROKEN','GROUP','ACTIVE',49999)`);
    await db.query("INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) VALUES(40104,40120,'GROUP')");
    const candidates=()=>scopes.eligibleWarehouseRecipients([{code:'40104',roles:['ROLE_FARM_REPORTER']}],'MENU_FARM_DATA','COMP-A','WH-A');
    try {
      expect((await read(40104).expect(200)).body.data).toEqual([]);
      expect(await candidates()).toEqual(new Set());
      await db.query('UPDATE sys_organizations SET parent_id=id WHERE id=40120');
      expect((await read(40104).expect(200)).body.data).toEqual([]);
      expect(await candidates()).toEqual(new Set());
      await db.query('UPDATE sys_organizations SET parent_id=NULL WHERE id=40120');
      expect((await read(40104).expect(200)).body.data).toHaveLength(1);
      expect(await candidates()).toEqual(new Set(['40104']));
    } finally {
      await db.query('DELETE FROM sys_user_orgs WHERE org_id=40120');
      await db.query('DELETE FROM sys_organizations WHERE id=40120');
    }
  });

  it('retains an explicit GROUP grant on a department binding', async () => {
    await db.query(`INSERT INTO brd_daily_logs(house_code,log_date,shift)
      VALUES ('HOUSE-A','2026-10-17','早班'),('HOUSE-B','2026-10-17','早班')`);
    await db.query("UPDATE sys_user_orgs SET data_scope_level='GROUP' WHERE user_id=40110");
    scopes.invalidate('40110');
    try { expect((await read(40110).expect(200)).body.data).toHaveLength(2); }
    finally { await db.query("UPDATE sys_user_orgs SET data_scope_level='SELF' WHERE user_id=40110"); scopes.invalidate('40110'); }
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
