import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { JwtStrategy } from '../../../auth/jwt.strategy';
import { DataScopeService } from './data-scope.service';
import { OrgOwnershipService } from './org-ownership.service';
import { SysDataScopeEntity } from '../entities/sys-data-scope.entity';
import { SysOrganizationEntity } from '../entities/sys-organization.entity';
import { SysUserOrgEntity } from '../entities/sys-user-org.entity';
import { SysUserProjectScopeEntity } from '../entities/sys-user-project-scope.entity';
import { SysUserWarehouseScopeEntity } from '../entities/sys-user-warehouse-scope.entity';
import { SysUserFarmScopeEntity } from '../entities/sys-user-farm-scope.entity';

const url = process.env.ISSUE411_ROLE_PG_URL;
(url ? describe : describe.skip)('Independent role GROUP lifecycle over owned PostgreSQL', () => {
  let db: DataSource;
  let scopes: DataScopeService;
  let jwt: JwtStrategy;
  const role = 'ROLE_ADMISSION_GROUP';
  const menu = 'MENU_FARM_DATA';
  const payload = { sub: 54111, username: 'admission_role_fixture', role, roles: [role], permissions: [menu + ':V'], perms_version: 1 };
  const resolve = async (roles = [role]) => {
    const user = await jwt.validate({ ...payload, roles });
    return scopes.resolve(String(user.userId), user.roles, menu, user.perms_version);
  };
  const candidates = (roles = [role]) => scopes.eligibleWarehouseRecipients([{ code: '54111', roles }], menu, 'COMP-B', 'WH-B');
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/issue411_role_fixture' || !process.env.ISSUE411_ROLE_FIXTURE_OWNER) throw new Error('Owned role fixture required');
    db = await new DataSource({ type: 'postgres', url, synchronize: false, migrationsRun: false, installExtensions: false,
      entities: [SysDataScopeEntity, SysOrganizationEntity, SysUserOrgEntity, SysUserProjectScopeEntity, SysUserWarehouseScopeEntity, SysUserFarmScopeEntity] }).initialize();
    const owners = await db.query('SELECT owner_key FROM issue411_role_fixture_owner');
    if (owners.length !== 1 || owners[0].owner_key !== process.env.ISSUE411_ROLE_FIXTURE_OWNER) throw new Error('Fixture ownership mismatch');
    await db.query(`CREATE TABLE IF NOT EXISTS sys_user(user_id bigint PRIMARY KEY,status int,perms_version int);
      CREATE TABLE IF NOT EXISTS sys_role(role_code text PRIMARY KEY,status text);
      CREATE TABLE IF NOT EXISTS sys_data_scopes(id bigserial PRIMARY KEY,role_code text,module_code text,scope_type text,enabled boolean,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS sys_organizations(id bigint PRIMARY KEY,org_code text,org_name text,org_type text,level int,status text,company_code text,project_code text,warehouse_code text,parent_id bigint,site_code text,sort_order int);
      CREATE TABLE IF NOT EXISTS sys_user_orgs(id bigserial PRIMARY KEY,user_id bigint,org_id bigint,is_primary boolean,data_scope_level text,is_manager boolean);
      CREATE TABLE IF NOT EXISTS sys_user_project_scopes(id bigserial PRIMARY KEY,user_id bigint,project_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS sys_user_warehouse_scopes(id bigserial PRIMARY KEY,user_id bigint,warehouse_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS sys_user_farm_scopes(id bigserial PRIMARY KEY,user_id bigint,farm_code text,created_at timestamptz DEFAULT now());
      CREATE TABLE IF NOT EXISTS wms_warehouses(warehouse_code text PRIMARY KEY,company_code text,status text,domain text,site_code text);
      CREATE TABLE IF NOT EXISTS brd_farms(farm_code text PRIMARY KEY,company_code text,mapped_site_code text,status text);
      TRUNCATE sys_user,sys_role,sys_data_scopes,sys_organizations,sys_user_orgs,sys_user_project_scopes,sys_user_warehouse_scopes,sys_user_farm_scopes,wms_warehouses,brd_farms RESTART IDENTITY;
      INSERT INTO sys_user VALUES (54111,1,1);
      INSERT INTO sys_data_scopes(role_code,module_code,scope_type,enabled) VALUES ('ROLE_ADMISSION_GROUP','MENU_FARM_DATA','GROUP',true),('ROLE_OTHER_GROUP','MENU_FARM_DATA','GROUP',true);
      INSERT INTO sys_organizations(id,org_code,org_type,status,company_code) VALUES(1,'COMP-A','COMPANY','ACTIVE','COMP-A'),(2,'COMP-B','COMPANY','ACTIVE','COMP-B');
      INSERT INTO wms_warehouses VALUES('WH-A','COMP-A','ACTIVE','OPERATIONAL',NULL),('WH-B','COMP-B','ACTIVE','OPERATIONAL',NULL);
      INSERT INTO brd_farms VALUES('FARM-B','COMP-B',NULL,'ACTIVE');`);
    jwt = new JwtStrategy(new ConfigService({ JWT_SECRET: 'isolated-role-fixture-only-not-a-production-secret' }), db.manager);
    scopes = new DataScopeService(db.getRepository(SysDataScopeEntity), db.getRepository(SysUserOrgEntity),
      db.getRepository(SysUserProjectScopeEntity), db.getRepository(SysUserWarehouseScopeEntity), db.getRepository(SysUserFarmScopeEntity),
      db.getRepository(SysOrganizationEntity), { get: () => undefined } as never, new OrgOwnershipService(db.manager));
  });
  afterAll(async () => { await db?.destroy(); });
  beforeEach(async () => {
    scopes.invalidate('54111');
    await db.query('TRUNCATE sys_user_orgs,sys_user_project_scopes,sys_user_warehouse_scopes,sys_user_farm_scopes');
    await db.query("INSERT INTO sys_role VALUES('ROLE_ADMISSION_GROUP','ACTIVE'),('ROLE_OTHER_GROUP','ACTIVE') ON CONFLICT(role_code) DO UPDATE SET status='ACTIVE'");
  });

  it('preserves the original ACTIVE role positive control', async () => {
    expect((await resolve()).isGlobal).toBe(true);
    expect(await candidates()).toEqual(new Set(['54111']));
  });
  it.each(['DEPRECATED','INACTIVE',null])('revokes warm role global scope for status %s with unchanged JWT claims and permission version', async status => {
    expect((await resolve()).isGlobal).toBe(true);
    await db.query('UPDATE sys_role SET status=$1 WHERE role_code=$2',[status,role]);
    const scope = await resolve();
    expect(scope.isGlobal).toBe(false);
    expect(scope.allowedCompanyCodes).toEqual([]);
    expect(await candidates()).toEqual(new Set());
  });
  it('fails closed for a deleted role even with a warm GROUP cache', async () => {
    await resolve();
    await db.query('DELETE FROM sys_role WHERE role_code=$1',[role]);
    expect((await resolve()).isGlobal).toBe(false);
    expect(await candidates()).toEqual(new Set());
  });
  it('restores legal role GROUP access when the role is ACTIVE again', async () => {
    await resolve();
    await db.query("UPDATE sys_role SET status='DEPRECATED' WHERE role_code=$1",[role]);
    expect((await resolve()).isGlobal).toBe(false);
    await db.query("UPDATE sys_role SET status='ACTIVE' WHERE role_code=$1",[role]);
    expect((await resolve()).isGlobal).toBe(true);
  });
  it('retains a second ACTIVE GROUP role when the other one is deprecated', async () => {
    await db.query("UPDATE sys_role SET status='DEPRECATED' WHERE role_code=$1",[role]);
    const roles=[role,'ROLE_OTHER_GROUP'];
    expect((await resolve(roles)).isGlobal).toBe(true);
    expect(await candidates(roles)).toEqual(new Set(['54111']));
    await db.query("UPDATE sys_role SET status='DEPRECATED'");
    expect((await resolve(roles)).isGlobal).toBe(false);
    expect(await candidates(roles)).toEqual(new Set());
  });
  it('keeps an independent ACTIVE organization GROUP grant and revokes it separately', async () => {
    await db.query("UPDATE sys_role SET status='DEPRECATED' WHERE role_code=$1",[role]);
    await db.query("INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) VALUES(54111,1,'GROUP')");
    expect((await resolve()).isGlobal).toBe(true);
    expect(await candidates()).toEqual(new Set(['54111']));
    await db.query('DELETE FROM sys_user_orgs');
    expect((await resolve()).isGlobal).toBe(false);
  });
  it('retains explicit company, farm and warehouse grants without granting unrelated companies', async () => {
    await db.query("UPDATE sys_role SET status='DEPRECATED' WHERE role_code=$1",[role]);
    await db.query("INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) VALUES(54111,1,'COMPANY'); INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES(54111,'FARM-B'); INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES(54111,'WH-A')");
    const scope=await resolve();
    expect(scope.isGlobal).toBe(false);
    expect(scope.allowedCompanyCodes).toEqual(['COMP-A']);
    expect(scope.allowedFarmCodes).toContain('FARM-B');
    expect(scope.allowedWarehouseCodes).toContain('WH-A');
    expect(await candidates()).toEqual(new Set());
  });
  it('denies role lookup failures before reading a warm cache, while preserving ROLE_ADMIN', async () => {
    await resolve();
    await db.query('ALTER TABLE sys_role RENAME TO fixture_unavailable_role');
    try {
      await expect(resolve()).rejects.toThrow();
      await expect(candidates()).rejects.toThrow();
      expect((await scopes.resolve('54111',['ROLE_ADMIN'],menu,1)).isGlobal).toBe(true);
    } finally { await db.query('ALTER TABLE fixture_unavailable_role RENAME TO sys_role'); }
  });
});
