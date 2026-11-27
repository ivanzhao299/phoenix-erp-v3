import { UsersBffController } from '../../bff/bff.controller';
import { SystemUsersController } from '../../master/system-users.controller';
import { createRequire } from 'node:module';
import { resolve as resolvePath } from 'node:path';
import * as bcrypt from 'bcrypt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from '../../../auth/auth.controller';
import { AuthService } from '../../../auth/auth.service';
import { activateOwnedConversionDomain } from '../../sales-v2/services/production-conversion.pg-fixture';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { ClsModule, ClsServiceManager } from 'nestjs-cls';
import { sign } from 'jsonwebtoken';
import { JwtStrategy } from '../../../auth/jwt.strategy';
import { loadPermissionSources } from '../../../auth/permission-sources';
import { addEggSourceHouseSessionPermissions,loadEggSourceOrganizationGrants } from '../../../auth/egg-source-organization-grants';
import { resolvePermissions } from '../../../auth/permissions-resolver';
import { hydrateMenuRegistry } from '../../../common/guards/menu-registry.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { PermissionSetsService } from '../../permission-sets/permission-sets.service';
import { SysRoleConflictEntity } from '../../permissions/entities/sys-role-conflict.entity';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { SysDataScopeEntity } from '../../org/entities/sys-data-scope.entity';
import { SysUserOrgEntity } from '../../org/entities/sys-user-org.entity';
import { SysUserProjectScopeEntity } from '../../org/entities/sys-user-project-scope.entity';
import { SysUserWarehouseScopeEntity } from '../../org/entities/sys-user-warehouse-scope.entity';
import { SysUserFarmScopeEntity } from '../../org/entities/sys-user-farm-scope.entity';
import { SysOrganizationEntity } from '../../org/entities/sys-organization.entity';
import { EggSourceIndependentPermissions1795651200000 } from '../../../database/migrations/1795651200000-EggSourceIndependentPermissions';
import { EggSourceStandardGrants1795658800000 } from '../../../database/migrations/1795658800000-EggSourceStandardGrants';
import { EggSourceLegacyCreationGate1795658400000 } from '../../../database/migrations/1795658400000-EggSourceLegacyCreationGate';
import { EggSourceHouseContract1795654800000 } from '../../../database/migrations/1795654800000-EggSourceHouseContract';
import { EggSourceAccessService } from './egg-source-access.service';
import { EggSourceChanges1795564800000 } from '../../../database/migrations/1795564800000-EggSourceChanges';
import { OfficialRawCollectionReceipts1795005390930 } from '../../../database/migrations/1795005390930-OfficialRawCollectionReceipts';
import { setTimeout as delay } from 'node:timers/promises';
import { legacyEggGrantDigest } from '../../permissions/save-menu-grants';
import { MenuGuard } from '../../../common/guards/menu.guard';
import { DataScopeService } from '../../org/services/data-scope.service';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { installProductionInboundFixture } from '../../sales-v2/services/production-inbound.pg-fixture';
import { MenuAdminController } from '../controllers/menu-admin.controller';
import { EggSourceChangeController } from '../controllers/egg-source-change.controller';
import { EggHistoryReviewService } from './egg-history-review.service';
import { EggSourceChangeService, type ChangeScope } from './egg-source-change.service';
import { SkuAvailabilityService } from './sku-availability.service';

const connection=process.env.OFFICIAL_INVENTORY_PG_URL;
const suite=connection ? describe : describe.skip;
const site='SITE-MENGSAI-LAYER';
const scope:ChangeScope={isGlobal:false,companyCodes:['COMP-A'],farmCodes:[],siteCodes:[],farmCode:null,siteCode:null,allowedWarehouses:['WH-SHARED']};
const globalScope:ChangeScope={...scope,isGlobal:true};

suite('egg source change workspace on PostgreSQL',()=>{
  const schema='egg_ux_'+randomUUID().replaceAll('-','');
  const base='/api/product-master/egg-sources';
  let db:DataSource;
  let app:INestApplication;
  let changes:EggSourceChangeService;
  let future:string;
  const input=()=>({ houseCode:'HOUSE-A2',targetClass:'RED',effectiveDate:future,reason:'Future profile',
    warehouseCode:'WH-SHARED',requirements:[{gradeCode:'GRADE_1',specCode:'LOOSE'}] });

  beforeAll(async()=>{
    const url=new URL(connection!);
    if (!['127.0.0.1','localhost'].includes(url.hostname) || !/fixture/.test(url.pathname)) {
      throw new Error('An isolated loopback fixture database is required');
    }
    db=new DataSource({type:'postgres',url:connection,extra:{options:`-c search_path=${schema},public`},
      entities:[SysRoleConflictEntity,SysDataScopeEntity,SysUserOrgEntity,SysUserProjectScopeEntity,
        SysUserWarehouseScopeEntity,SysUserFarmScopeEntity,SysOrganizationEntity]});
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await installProductionInboundFixture(db,['GRADE_1','GRADE_2','GRADE_3','GRADE_4']);
    const runner=db.createQueryRunner();
    try {
      await new OfficialRawCollectionReceipts1795005390930().up(runner);
      await new EggSourceChanges1795564800000().up(runner);
    } finally { await runner.release(); }
    await db.query(`ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS house_name text, ADD COLUMN IF NOT EXISTS house_type text;
      ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_name text;
      ALTER TABLE sys_organizations ADD COLUMN IF NOT EXISTS org_name text;
      ALTER TABLE sys_organizations ADD COLUMN id bigserial UNIQUE, ADD COLUMN parent_id bigint,
        ADD COLUMN project_code text,ADD COLUMN warehouse_code text,ADD COLUMN site_code text;
      CREATE TABLE sys_user(user_id bigint PRIMARY KEY,real_name text,username text,status int NOT NULL DEFAULT 1,
        perms_version bigint NOT NULL DEFAULT 1,updated_at timestamptz);
      INSERT INTO sys_user(user_id,real_name,username) VALUES(1,'Synthetic count maker','maker'),(2,'Synthetic count reviewer','reviewer');
      CREATE TABLE sys_menu(menu_id bigserial PRIMARY KEY,menu_code text UNIQUE NOT NULL,menu_name_zh text NOT NULL,
        menu_name_lo text,domain text,parent_code text,sort_order int,icon text,route text);
      INSERT INTO sys_menu(menu_code,menu_name_zh) VALUES ('MENU_MASTER_DATA','Master data'),
        ('MENU_MD_PRODUCT','Legacy products'),('MENU_FARM_DATA','Flock plan'),('MENU_PROD_INBOUND','History'),
        ('MENU_SETTINGS_MENU_REGISTRY','Menu registry');
      CREATE TABLE sys_role(role_id bigint PRIMARY KEY,role_code text UNIQUE,status text,approval_level int);
      CREATE TABLE sys_user_role(user_id bigint,role_id bigint,is_visible boolean);
      CREATE TABLE sys_role_menu_permission(role_id bigint REFERENCES sys_role(role_id) ON DELETE CASCADE,
        menu_id bigint,perm_codes text NOT NULL,deny_codes text,
        scope_type text,scope_value text,UNIQUE(role_id,menu_id));
      CREATE TABLE sys_permission_set(set_id bigint PRIMARY KEY,set_code text UNIQUE);
      CREATE TABLE sys_permission_set_item(set_id bigint,menu_id bigint,perm_codes text NOT NULL,deny_codes text,
        scope_type text,scope_value text,UNIQUE(set_id,menu_id));
      CREATE TABLE sys_role_permission_set(role_id bigint,set_id bigint);
      CREATE TABLE sys_user_permission_set(user_id bigint,set_id bigint,granted_at timestamptz,UNIQUE(user_id,set_id));
      ALTER TABLE file_metadata ADD COLUMN IF NOT EXISTS checksum text;
      ALTER TABLE production_opening_receipts ADD COLUMN cutover_manifest_id uuid UNIQUE REFERENCES production_cutover_manifests(id);
      CREATE TABLE sys_audit_log(log_id bigserial PRIMARY KEY,user_id bigint,user_name text,action text,entity_type text,entity_id text,before_value jsonb,after_value jsonb);
      CREATE TABLE sys_role_conflict(id bigserial PRIMARY KEY,menu_a text,menu_b text,severity text,reason_zh text,created_at timestamptz);
      CREATE TABLE sys_data_scopes(id bigserial PRIMARY KEY,role_code text,module_code text,scope_type text,enabled boolean,created_at timestamptz);
      CREATE TABLE sys_user_orgs(id bigserial,user_id bigint,org_id bigint,is_primary boolean,data_scope_level text);
      CREATE TABLE sys_user_project_scopes(id bigserial,user_id bigint,project_code text,created_at timestamptz);
      CREATE TABLE sys_user_warehouse_scopes(id bigserial,user_id bigint,warehouse_code text,created_at timestamptz);
      CREATE TABLE sys_user_farm_scopes(id bigserial,user_id bigint,farm_code text,created_at timestamptz);
      ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS warehouse_name text, ADD COLUMN IF NOT EXISTS warehouse_name_zh text,
        ADD COLUMN IF NOT EXISTS warehouse_name_en text, ADD COLUMN IF NOT EXISTS warehouse_name_lo text;
      ALTER TABLE product_grades ADD COLUMN IF NOT EXISTS stock_managed boolean,ADD COLUMN IF NOT EXISTS grade_name text,
        ADD COLUMN IF NOT EXISTS grade_name_lo text;
      ALTER TABLE packaging_specs ADD COLUMN IF NOT EXISTS spec_name text,ADD COLUMN IF NOT EXISTS spec_name_lo text,
        ADD COLUMN IF NOT EXISTS sort_order int;
      ALTER TABLE pkg_source_batches ADD COLUMN IF NOT EXISTS batch_status text;
      UPDATE brd_farms SET farm_name=farm_code,mapped_site_code='${site}' WHERE farm_code='FARM-A';
      UPDATE brd_houses SET house_name=house_code,house_type='LAYER';
      UPDATE md_egg_source_profiles SET site_code='${site}' WHERE company_code='COMP-A';
      UPDATE wms_warehouses SET warehouse_name=warehouse_code;
      UPDATE wms_warehouses SET site_code='${site}' WHERE warehouse_code='WH-A2';
      INSERT INTO wms_warehouses(warehouse_code,company_code,site_code,status,domain,warehouse_name)
      VALUES ('WH-SHARED','COMP-A',NULL,'ACTIVE','OPERATIONAL','Shared'),
        ('WH-INACTIVE','COMP-A',NULL,'INACTIVE','OPERATIONAL','Inactive');
      UPDATE product_grades SET grade_name=grade_code;
      UPDATE packaging_specs SET spec_name=spec_code;
      DELETE FROM md_sku_org_scope WHERE scope_code='COMP-A' AND sku_code='SKU-GRADE_2';
      INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code)
        VALUES ('SKU-GRADE_2','FARM','FARM-A');
      INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code,stock_enabled)
        VALUES ('SKU-GRADE_4','SITE','${site}',false);
      UPDATE md_sku_org_scope SET effective_date=current_date+15 WHERE sku_code='SKU-GRADE_3' AND scope_code='COMP-A';
    `);
    await db.transaction(async m=>new EggSourceIndependentPermissions1795651200000().up(m.queryRunner!));
    await db.transaction(async m=>new EggSourceHouseContract1795654800000().up(m.queryRunner!));
    await db.transaction(async m=>new EggSourceLegacyCreationGate1795658400000().up(m.queryRunner!));
    await db.transaction(async m=>new EggSourceStandardGrants1795658800000().up(m.queryRunner!));
    // The controlled registration starts closed and does not implicitly copy legacy permissions.
    expect(await db.query('SELECT writes_enabled FROM md_egg_source_write_control')).toEqual([{writes_enabled:false}]);
    expect(await db.query('SELECT * FROM sys_role_menu_permission')).toEqual([]);
    await db.query('UPDATE md_egg_source_write_control SET writes_enabled=true,ever_enabled=true WHERE id=1');
    [{future}]=await db.query("SELECT ((now() AT TIME ZONE 'Asia/Vientiane')::date+2)::text AS future");
    changes=new EggSourceChangeService(db,new SkuAvailabilityService(db));
    const module=await Test.createTestingModule({ controllers:[EggSourceChangeController],
      providers:[{provide:EggSourceChangeService,useValue:changes},{provide:EggHistoryReviewService,useValue:new EggHistoryReviewService(db,{} as any,{} as any)},
        {provide:EggSourceAccessService,useValue:{
          resolve:async (user:{userId:string},action?:string)=>({
            scope:action&&action!=='V'?{...scope,actionGrants:[scope]}:scope,
            actor:user.userId,edit:[scope],approve:[scope],
          }),
          flockScope:async (user:{userId:string})=>({ ...scope,companyCodes:[],
            farmCodes:[user.userId==='source-authorized'?'FARM-SOURCE':'FARM-A'] }),
        }}] })
      .overrideGuard(MenuGuard).useValue({canActivate: (context:ExecutionContext)=>{
        const req=context.switchToHttp().getRequest();
        req.user={userId:req.headers['x-test-user']||'author',permissions:['MENU_MD_PRODUCT:V,E,A','MENU_FARM_DATA:V','MENU_PROD_INBOUND:V,A']};
        return true;
      }})
      .overrideGuard(DataScopeGuard).useValue({canActivate: (context:ExecutionContext)=>{
        context.switchToHttp().getRequest().dataScope={isGlobal:false,allowedCompanyCodes:['COMP-A'],allowedWarehouseCodes:['WH-SHARED']};
        return true;
      }}).compile();
    app=module.createNestApplication();
    await app.init();
  },60000);

  afterAll(async()=>{
    if (app) await app.close();
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.destroy();
    }
  });

  it('pages independent history reviews and still returns authorized frozen evidence when live lookup fails',async()=>{
    const http=request(app.getHttpServer());
    const rows=Array.from({length:54},()=>({id:randomUUID(),request_key:randomUUID()}));
    for(const [index,row] of rows.entries()){
      const warehouse=index===51?'WH-A2':'WH-SHARED';
      const siteCode=index===52?'MANAGED-OUTSIDE':site;
      const actor=index===53?'author':'maker';
      await db.query(`INSERT INTO md_egg_history_reviews(id,request_key,company_code,farm_code,site_code,house_code,production_date,
        batch_no,source_line,quantity,target_class,created_by,payload,created_at)
        VALUES($1,$2,'COMP-A','FARM-A',$3,'HOUSE-A2','2026-11-18','SYNTHETIC-OLD-BATCH','8',5,'RED',$4,$5,'2026-11-21T00:00:00.000042Z')`,
        [row.id,row.request_key,siteCode,actor,JSON.stringify({warehouse,reason:'Owned review',attachments:[],
          selected:{id:'8',qty_change:'-8',change_type:'SALE_OUTBOUND',ref_no:'SALE-RESTRICTED',original_module:null}})]);
    }
    const first=(await http.get(base+'/history/reviews').query({view:'pending'}).expect(200)).body.data;
    expect(first.rows).toHaveLength(50);
    const next=(await http.get(base+'/history/reviews').query({view:'pending',cursor:first.nextCursor}).expect(200)).body.data;
    expect(next.rows).toHaveLength(1);
    expect(new Set([...first.rows,...next.rows].map(row=>row.id))).toEqual(new Set(rows.slice(0,51).map(row=>row.id)));
    await http.get(base+'/history/reviews/'+rows[51].id).expect(404);
    await http.get(base+'/history/reviews/'+rows[52].id).expect(404);
    const frozen=(await http.get(base+'/history/reviews/'+rows[0].id).expect(200)).body.data;
    expect(frozen).toMatchObject({quantity:5,evidenceState:'NEEDS_REVIEW',frozenLine:{id:'8',qty_change:'-8',ref_no:null}});
    await http.get(base+'/history/requests/'+rows[0].request_key).query({companyCode:'COMP-A'}).expect(404);
    const own=(await http.get(base+'/history/requests/'+rows[0].request_key).set('x-test-user','maker').query({companyCode:'COMP-A'}).expect(200)).body.data;
    expect(own).toMatchObject({id:rows[0].id,submission:{state:'SUBMITTED'},currentState:'SUBMITTED'});
  });

  it('returns a shared operational warehouse only within the caller scope and verifies real grade/spec options',async()=>{
    const http=request(app.getHttpServer());
    const warehouses=await http.get(base+'/candidates/warehouses').query({houseCode:'HOUSE-A2'}).expect(200);
    expect(warehouses.body.data.map((row:{code:string})=>row.code)).toEqual(['WH-SHARED']);
    const options=await http.get(base+'/candidates/options').query({houseCode:'HOUSE-A2'}).expect(200);
    expect(options.body.data.grades).toContainEqual(expect.objectContaining({code:'GRADE_1'}));
    expect(options.body.data.specs).toContainEqual(expect.objectContaining({code:'LOOSE'}));
    const candidates=await changes.candidateWarehouses('HOUSE-A2',globalScope);
    expect(candidates.map((row:{code:string})=>row.code)).toEqual(['WH-SHARED','WH-A2']);
  });

  it('reports passed, missing company, future authorization and site inventory veto in one HTTP 200',async()=>{
    const http=request(app.getHttpServer());
    const payload={ ...input(),requirements:[1,2,3,4].map(n=>({gradeCode:'GRADE_'+n,specCode:'LOOSE'})) };
    const result=await http.post(base+'/precheck').send(payload).expect(200);
    expect(result.body.data).toMatchObject({ status:'BLOCKED',houseCode:'HOUSE-A2',warehouseCode:'WH-SHARED',targetClass:'RED',
      rows:[
        {status:'PASSED',skuCode:'SKU-GRADE_1',issues:[]},
        {status:'BLOCKED',issues:[{layer:'COMPANY',code:'AUTH_MISSING'}]},
        {status:'BLOCKED',issues:[{layer:'COMPANY',code:'AUTH_NOT_YET_EFFECTIVE'}]},
        {status:'BLOCKED',issues:[{layer:'SITE',code:'STOCK_DISABLED'}]},
      ] });
    await http.post(base+'/precheck').send({...payload,warehouseCode:'WH-B'}).expect(403);
    await http.post(base+'/precheck').send({...payload,planDocument:false}).expect(400);
    const blocked=await http.post(base+'/precheck').send({...payload,effectiveDate:'2026-01-01'}).expect(200);
    expect(blocked.body.data.rows.every((row:{status:string})=>row.status==='NOT_CHECKED')).toBe(true);
    await http.post(base+'/preview').send(input()).expect(201);
  });

  it('finds older authorized requests behind denied rows and preserves sub-millisecond keyset positions',async()=>{
    await db.transaction(async fixture=>{
      await fixture.query("SELECT set_config('phoenix.egg_source_writer','author',true)");
      await fixture.query(`INSERT INTO md_egg_source_changes(id,request_key,company_code,farm_code,site_code,house_code,effective_date,
      target_class,state,created_by,last_editor,payload,created_at)
      SELECT gen_random_uuid(),gen_random_uuid(),'COMP-A','FARM-A',$1,'HOUSE-A2',$2,'RED',
        CASE WHEN n=1 THEN 'SUBMITTED' ELSE 'CANCELLED' END,'author','author',
        jsonb_build_object('warehouseCode',CASE WHEN n>30 THEN 'WH-A' ELSE 'WH-SHARED' END,'reason','list','requirements','[]'::jsonb),
        '2026-01-01T01:00:00Z'::timestamptz+n*interval '1 microsecond'
      FROM generate_series(1,140) n`,[site,future]);
    });
    const http=request(app.getHttpServer());
    const first=await http.get(base+'/changes').query({houseCode:'HOUSE-A2'}).expect(200);
    expect(first.body.data.items).toHaveLength(25);
    const second=await http.get(base+'/changes').query({houseCode:'HOUSE-A2',cursor:first.body.data.nextCursor}).expect(200);
    expect(second.body.data.items).toHaveLength(5);
    const all=[...first.body.data.items,...second.body.data.items];
    expect(new Set(all.map(row=>row.id)).size).toBe(30);
    expect(all.every(row=>row.warehouseCode==='WH-SHARED')).toBe(true);
    await http.get(base+'/changes').query({houseCode:'HOUSE-A2',state:'SUBMITTED',cursor:first.body.data.nextCursor}).expect(400);
    const workspace=await http.get(base+'/workspace').query({houseCode:'HOUSE-A2'}).expect(200);
    expect(workspace.body.data.pending.submitted).toBe(1);
    const denied=await db.query("SELECT id FROM md_egg_source_changes WHERE payload->>'warehouseCode'='WH-A' LIMIT 1");
    await http.get(base+'/changes/'+denied[0].id).expect(404);
  });

  it('applies originating chicken-house permission to both current and compatibility reads',async()=>{
    const plan=randomUUID();
    await db.query(`INSERT INTO brd_farms(farm_code,company_code,mapped_site_code,status) VALUES ('FARM-SOURCE','COMP-A','SITE-DONGPENG-LAYER','ACTIVE');
      INSERT INTO brd_houses(house_code,farm_code,status,house_type) VALUES ('HOUSE-SOURCE','FARM-SOURCE','ACTIVE','LAYER')`);
    await db.query(`INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,site_code,house_code,
      flock_no,business_date,payload,status,version,created_by)
      VALUES ($1,$1,'fixture','TRANSFER','COMP-A','FARM-SOURCE','SITE-DONGPENG-LAYER','HOUSE-SOURCE',
        'FLOCK-SOURCE',$2,'{"targetHouseCode":"HOUSE-A2"}','DRAFT',1,'fixture')`,[plan,future]);
    const http=request(app.getHttpServer());
    const created=await http.post(base+'/changes').send({...input(),planDocument:plan,actionKey:randomUUID()}).expect(201);
    const id=created.body.data.id;
    expect(created.body.data.payload.planDocument).toBeNull();
    const url=base+'/changes/'+id;
    const preview=await http.post(base+'/preview').send({...input(),planDocument:plan}).expect(201);
    expect(preview.body.data.verified.planned).toBeNull();
    const submitted=await http.post(url+'/actions/submit').send({actionKey:randomUUID(),version:1}).expect(201);
    expect(submitted.body.data.change.approval.snapshot.planned).toBeNull();
    await db.query("UPDATE brd_flock_documents SET status='SUBMITTED',version=2 WHERE id=$1",[plan]);
    const restricted=await http.get(url).expect(200);
    expect(restricted.body.data).toMatchObject({linkedPlan:true,plan:null});
    expect(JSON.stringify(restricted.body)).not.toContain(plan);
    const authorized=await http.get(url).set('x-test-user','source-authorized').expect(200);
    expect(authorized.body.data.plan).toMatchObject({id:plan,version:2,frozenVersion:1});
    const legacy=await http.get(base).query({houseCode:'HOUSE-A2'}).expect(200);
    expect(JSON.stringify(legacy.body)).not.toContain(plan);
  });

  it('prechecks a stored draft, confirms independent approval and returns the original action receipt after later transitions',async()=>{
    const http=request(app.getHttpServer());
    const key=randomUUID();
    const draft=await http.post(base+'/changes').send({...input(),actionKey:key}).expect(201);
    const id=draft.body.data.id;
    const url=base+'/changes/'+id;
    await http.get(base+'/change-requests/'+key).query({houseCode:'HOUSE-A2'}).expect(200);
    await http.get(base+'/change-requests/'+key).set('x-test-user','reviewer').query({houseCode:'HOUSE-A2'}).expect(404);
    await http.post(url+'/precheck').set('x-test-user','reviewer').expect(404);
    const checked=await http.post(url+'/precheck').send({targetClass:'PINK'}).expect(200);
    expect(checked.body.data.targetClass).toBe('RED');
    const submitted=await http.post(url+'/actions/submit').send({actionKey:randomUUID(),version:1}).expect(201);
    const digest=submitted.body.data.change.approval.planDigest;
    const reviewed={actionKey:randomUUID(),version:2,planDigest:digest};
    await http.post(url+'/reviews/approve').send(reviewed).expect(403);
    await http.post(url+'/reviews/approve').set('x-test-user','reviewer').send(reviewed).expect(201);
    await http.post(url+'/reviews/approve').set('x-test-user','reviewer').send(reviewed).expect(201);
    await http.post(url+'/actions/request-revoke').send({actionKey:randomUUID(),version:3,reason:'Changed plan'}).expect(201);
    const detail=await http.get(url).set('x-test-user','reviewer').expect(200);
    expect(detail.body.data.state).toBe('REVOKE_REQUESTED');
    expect(detail.body.data.originalApproval.previousProfileCode).toBe('PROFILE-A2');
    expect(detail.body.data.events.map((row:{version:number})=>row.version)).toEqual([2,3,4]);
    expect(detail.body.data).not.toHaveProperty('request_key');
    const receipt=await http.get(url+'/action-requests/'+reviewed.actionKey).set('x-test-user','reviewer').expect(200);
    expect(receipt.body.data).toMatchObject({id,state:'APPROVED',version:3,action:'approve'});
    await http.get(url+'/action-requests/'+reviewed.actionKey).expect(404);
  });
  it('uses real JWT and guards for ordinary role, permission set, warehouse intersection, and old writer fencing',async()=>{
    const secret=process.env.JWT_SECRET || 'DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD';
    // A separately instantiated app exercises the guard and scope chain instead of test overrides.
    const cls=ClsServiceManager.getClsService();
    const resolver=new DataScopeService(db.getRepository(SysDataScopeEntity),db.getRepository(SysUserOrgEntity),
      db.getRepository(SysUserProjectScopeEntity),db.getRepository(SysUserWarehouseScopeEntity),db.getRepository(SysUserFarmScopeEntity),
      db.getRepository(SysOrganizationEntity),cls,new OrgOwnershipService(db.manager));
    const rolePermissions=new PermissionsService({} as never,{} as never,{} as never,{} as never,{} as never,db);
    const sets=new PermissionSetsService(db);
    const permsMenu='MENU_MD_EGG_SOURCE';
    const testApp=(await Test.createTestingModule({imports:[ClsModule.forRoot({global:true,middleware:{mount:true}}),
      ThrottlerModule.forRoot([{name:'login',ttl:900000,limit:30}])],
      controllers:[EggSourceChangeController,MenuAdminController,AuthController,UsersBffController,SystemUsersController],providers:[
        {provide:AuthService,useValue:new AuthService(db.manager as never)},
        {provide:getEntityManagerToken(),useValue:db.manager},
        {provide:JwtStrategy,useValue:new JwtStrategy(new ConfigService({JWT_SECRET:secret}),db.manager)},
        {provide:DataScopeService,useValue:resolver},
        {provide:EggSourceAccessService,useValue:new EggSourceAccessService(db,resolver)},
        {provide:EggSourceChangeService,useValue:changes},
        {provide:EggHistoryReviewService,useValue:new EggHistoryReviewService(db,{} as any,{} as any)},
      ]}).compile()).createNestApplication({logger:['error']});
    try {
      const browserURL=process.env.EGG_SOURCE_BROWSER_URL;
      if (browserURL) {
        const port=Number(process.env.EGG_SOURCE_HTTP_PORT);
        if (!Number.isInteger(port) || port<1024 || new URL(browserURL).hostname!=='127.0.0.1') throw new Error('Invalid loopback browser fixture');
        await testApp.listen(port,'127.0.0.1');
      } else await testApp.init();
      await hydrateMenuRegistry(db.manager);
      const fixtureGrantConfig = (sql:string, args?: unknown[])=>db.transaction(async manager=>{
        await manager.query("SELECT set_config('phoenix.egg_source_role_editor','1',true)");
        return manager.query(sql,args);
      });
      await fixtureGrantConfig(`INSERT INTO brd_houses(house_code,farm_code,status,house_type) VALUES ('HOUSE-RBAC','FARM-A','ACTIVE','LAYER');
        INSERT INTO sys_user(user_id,real_name) VALUES (21,'Applicant'),(22,'Reviewer'),(23,'Legacy'),(24,'Review only'),(26,'Current system administrator');
        UPDATE sys_user SET username='egg-fixture-'||user_id::text WHERE user_id>=21;
        INSERT INTO sys_role VALUES (21,'ROLE_EGG_APPLY','ACTIVE',1),(22,'ROLE_EGG_REVIEW','ACTIVE',1),
          (23,'ROLE_LEGACY_PRODUCT','ACTIVE',1),(24,'ROLE_ONLY_REVIEW','ACTIVE',1),(25,'ROLE_OLD_DENY','DEPRECATED',0),(26,'ROLE_ADMIN','ACTIVE',100),
          (27,'ROLE_V1_GUARD','ACTIVE',1);
        INSERT INTO sys_user_role VALUES (21,21,true),(22,22,true),(23,23,true),(24,24,true),(22,25,true),(26,26,true);
        INSERT INTO sys_user_orgs(user_id,org_id,is_primary,data_scope_level)
          SELECT applicant.id,o.id,true,'COMPANY' FROM sys_organizations o CROSS JOIN (VALUES(21),(22),(23),(24)) applicant(id) WHERE o.org_code='COMP-A';
        INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code)
          SELECT id,warehouse FROM (VALUES(21),(22),(23),(24)) users(id) CROSS JOIN (VALUES('WH-SHARED'),('WH-A2')) wh(warehouse);
        INSERT INTO sys_permission_set VALUES(22,'PSET_EGG_REVIEW'),(24,'PSET_ONLY_REVIEW');
        INSERT INTO sys_role_permission_set VALUES(22,22),(24,24);
        INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes,deny_codes)
          SELECT 25,menu_id,'','V' FROM sys_menu WHERE menu_code='MENU_MD_EGG_SOURCE';
        INSERT INTO sys_menu(menu_code,menu_name_zh) VALUES ('MENU_SETTINGS_USER','Fixture user administration') ON CONFLICT DO NOTHING;
        UPDATE md_egg_source_write_control SET writes_enabled=false WHERE id=1;`);
      await hydrateMenuRegistry(db.manager);
      await expect(rolePermissions.setRolePermissions('ROLE_EGG_APPLY',[{menu_code:permsMenu,perm_codes:'*'}])).rejects.toThrow();
      await expect(sets.setItems('PSET_EGG_REVIEW',[{menu_code:'UNKNOWN',perm_codes:'V'}])).rejects.toThrow();
      const adminActor={userId:26,perms_version:1};
      await rolePermissions.setRolePermissions('ROLE_EGG_APPLY',[{menu_code:permsMenu,perm_codes:'V,E',egg_warehouse_code:'WH-SHARED'}],adminActor);
      await rolePermissions.setRolePermissions('ROLE_LEGACY_PRODUCT',[{menu_code:'MENU_MD_PRODUCT',perm_codes:'V,E,A'}]);
      const legacyWrite = {menu_code:permsMenu,perm_codes:'V,E',egg_warehouse_code:'WH-SHARED'};
      await rolePermissions.setRolePermissions('ROLE_V1_GUARD',[legacyWrite],adminActor);
      const readLegacy = async () => (await db.query(`SELECT p.perm_codes,p.scope_type,p.scope_value
        FROM sys_role_menu_permission p JOIN sys_menu m USING(menu_id) WHERE p.role_id=27 AND m.menu_code=$1`,[permsMenu]))[0];
      const legacyBefore = await readLegacy();
      await rolePermissions.setRolePermissions('ROLE_V1_GUARD',[{menu_code:'MENU_MD_PRODUCT',perm_codes:'V'}]);
      expect(await readLegacy()).toEqual(legacyBefore);
      const clearLegacy = {menu_code:permsMenu,perm_codes:'',egg_legacy_digest:'none'};
      await expect(rolePermissions.setRolePermissions('ROLE_V1_GUARD',[clearLegacy],adminActor)).rejects.toMatchObject({status:409});
      await rolePermissions.setRolePermissions('ROLE_V1_GUARD',[{...clearLegacy,egg_legacy_digest:legacyEggGrantDigest(legacyBefore)}],adminActor);
      expect(await readLegacy()).toEqual({...legacyBefore,perm_codes:''});

      await sets.setItems('PSET_EGG_REVIEW',[{menu_code:permsMenu,perm_codes:'A',egg_warehouse_code:'WH-SHARED'}],adminActor);
      await rolePermissions.setRolePermissions('ROLE_EGG_REVIEW',[{menu_code:permsMenu,perm_codes:'V'}],adminActor);
      await sets.setItems('PSET_ONLY_REVIEW',[{menu_code:permsMenu,perm_codes:'A',egg_warehouse_code:'WH-SHARED'}],adminActor);
      const password='isolated-egg-source-fixture';
      const passwordHash=await bcrypt.hash(password,4);
      await db.query(`ALTER TABLE sys_user ADD COLUMN password_hash text, ADD COLUMN store_code text, ADD COLUMN locale text;
        ALTER TABLE sys_user_role ADD COLUMN is_primary boolean NOT NULL DEFAULT true;
        ALTER TABLE sys_role ADD COLUMN role_name_zh text, ADD COLUMN role_type text;
        ALTER TABLE sys_organizations ADD COLUMN IF NOT EXISTS org_name_cn text`);
      await db.query("UPDATE sys_user SET password_hash=$1,locale='zh-CN' WHERE user_id>=21",[passwordHash]);
      await expect(db.query("UPDATE sys_menu SET menu_name_zh='Unmanaged' WHERE menu_code=$1",[permsMenu]))
        .rejects.toMatchObject({driverError:{code:'42501',message:'EGG_SOURCE_MENU_MANAGED'}});
      await expect(db.query("UPDATE sys_role_menu_permission SET perm_codes='*' WHERE role_id=21"))
        .rejects.toMatchObject({driverError:{code:'42501',message:'EGG_SOURCE_ROLE_CONFIG_REQUIRED'}});
      const token=async (user:number, overrides:Record<string,unknown>={})=>{
        const [account]=await db.query('SELECT perms_version FROM sys_user WHERE user_id=$1',[user]);
        const rows = await loadPermissionSources(db.manager,user,{activeRolesOnly:true});
        const permissions = addEggSourceHouseSessionPermissions(resolvePermissions(rows),rows,await loadEggSourceOrganizationGrants(db.manager,user));
        return sign({sub:user,username:'fixture-'+user,perms_version:Number(account.perms_version),roles:[],
          permissions,...overrides},secret,{expiresIn:'5m'});
      };
      const applicant=await token(21), reviewer=await token(22), legacy=await token(23), reviewOnly=await token(24);
      const http=request(testApp.getHttpServer());
      const admin=await token(26,{roles:['ROLE_ADMIN'],permissions:['*']});
      const nonAdminWithMenu=await token(22,{permissions:['MENU_SETTINGS_MENU_REGISTRY:V,E']});
      const control=(auth:string,expectedEnabled:boolean,enabled:boolean)=>http.post('/api/sys/menu-registry/egg-source-write-control')
        .auth(auth,{type:'bearer'}).send({expectedEnabled,enabled,reason:'Verified technical cutover'});
      const requestKey=randomUUID();
      const create=(auth:string,warehouseCode='WH-SHARED')=>http.post(base+'/changes').auth(auth,{type:'bearer'})
        .send({...input(),houseCode:'HOUSE-RBAC',warehouseCode,actionKey:requestKey});
      await http.get(base+'/workspace').auth(legacy,{type:'bearer'}).query({houseCode:'HOUSE-A2'}).expect(403);
      await create(applicant).expect(409);
      await create(reviewer).expect(403);
      await create(await token(21,{perms_version:undefined})).expect(401);
      await create(await token(21,{impersonatedBy:'99'})).expect(403);
      const readControl=(auth:string)=>http.get('/api/sys/menu-registry/egg-source-write-control').auth(auth,{type:'bearer'});
      await readControl(nonAdminWithMenu).expect(403);
      expect((await readControl(admin).expect(200)).body.data).toMatchObject({writes_enabled:false,changed_by:null});
      await control(nonAdminWithMenu,false,true).expect(403);
      const reopened=await control(admin,false,true).expect(201);
      expect(reopened.body.data).toMatchObject({writes_enabled:true,changed_by:'26',change_reason:'Verified technical cutover'});
      await control(admin,false,true).expect(409);
      expect((await readControl(admin).expect(200)).body.data).toEqual(reopened.body.data);
      // Even after reopening, legacy code without the transaction marker cannot write.
      await expect(db.query("UPDATE md_egg_source_changes SET version=version+1"))
        .rejects.toMatchObject({driverError:{code:'42501'}});
      await create(applicant,'WH-A2').expect(403);
      const opened=await create(applicant).expect(201);
      const doc=base+'/changes/'+opened.body.data.id;
      await http.post(doc+'/reviews/reject').auth(reviewOnly,{type:'bearer'}).send({version:1,actionKey:randomUUID(),reason:'Review'})
        .expect(403);
      const submitted=await http.post(doc+'/actions/submit').auth(applicant,{type:'bearer'})
        .send({version:1,actionKey:randomUUID()}).expect(201);
      await http.post(doc+'/reviews/reject').auth(applicant,{type:'bearer'}).send({version:2,actionKey:randomUUID(),reason:'Review'}).expect(403);
      const review=await http.get(doc).auth(reviewer,{type:'bearer'}).expect(200);
      expect(review.body.data.allowedActions).toEqual(['approve','reject']);
      await db.query("UPDATE sys_role SET status='DEPRECATED' WHERE role_id=22");
      await http.get(doc).auth(reviewer,{type:'bearer'}).expect(403);
      await db.query("UPDATE sys_role SET status='ACTIVE' WHERE role_id=22");
      await fixtureGrantConfig(`UPDATE sys_role_menu_permission SET deny_codes='V' WHERE role_id=22
        AND menu_id=(SELECT menu_id FROM sys_menu WHERE menu_code=$1)`, [permsMenu]);
      await http.post(doc+'/reviews/reject').auth(reviewer,{type:'bearer'})
        .send({version:2,actionKey:randomUUID(),reason:'Review'}).expect(403);
      const [saved]=await db.query(`SELECT item.perm_codes,item.scope_type,item.scope_value
        FROM sys_permission_set_item item JOIN sys_menu m USING(menu_id) WHERE item.set_id=22 AND m.menu_code=$1`, [permsMenu]);
      expect(saved).toEqual({perm_codes:'A',scope_type:'WAREHOUSE',scope_value:'WH-SHARED'});
      await fixtureGrantConfig("UPDATE sys_role_menu_permission SET deny_codes=NULL WHERE role_id=22");
      const actionKey=randomUUID();
      await http.post(doc+'/reviews/approve').auth(reviewer,{type:'bearer'})
        .send({version:2,planDigest:submitted.body.data.change.approval.planDigest,actionKey}).expect(201);
      await control(admin,true,false).expect(201);
      await http.get(doc+'/action-requests/'+actionKey).auth(reviewer,{type:'bearer'}).expect(200);
      await http.get(doc+'/action-requests/'+actionKey).auth(applicant,{type:'bearer'}).expect(404);
      await db.query(`INSERT INTO brd_houses(house_code,house_name,farm_code,status,house_type)
        VALUES ('HOUSE-HOUSE-PILOT','House pilot','FARM-A','ACTIVE','LAYER')`);
      await control(admin,false,true).expect(201);
      const newGate='/api/sys/menu-registry/egg-source-house-write-control';
      expect((await http.get(newGate).auth(admin,{type:'bearer'}).expect(200)).body.data.writes_enabled).toBe(false);
      await http.get(newGate).auth(nonAdminWithMenu,{type:'bearer'}).expect(403);
      const grant = async (subject:string,code:string,actions:string[])=>{
        const path='/api/sys/menu-registry/egg-source-organization-grants/'+subject+'/'+code;
        const current=(await http.get(path).auth(admin,{type:'bearer'}).expect(200)).body.data;
        await http.put(path).auth(admin,{type:'bearer'}).send({expectedDigest:current.digest,reason:'Isolated pilot grant',
          rows:[{scope_type:'HOUSE',scope_code:'HOUSE-HOUSE-PILOT',actions}]}).expect(200);
      };
      await grant('role','ROLE_EGG_APPLY',['V','C','E']);
      await grant('set','PSET_EGG_REVIEW',['V','A']);
      const configured = async (subject:string,code:string) => {
        const path='/api/sys/menu-registry/egg-source-organization-grants/'+subject+'/'+code;
        return (await http.get(path).auth(admin,{type:'bearer'}).expect(200)).body.data;
      };
      const previewRequest = (subject:string,code:string,actions:string[],expectedDigest:string) =>
        http.post('/api/sys/menu-registry/egg-source-standard-grants/'+subject+'/'+code+'/preview').auth(admin,{type:'bearer'})
          .send({actions,expectedDigest});
      const previewStandard = async (subject:string,code:string,actions:string[]) =>
        (await previewRequest(subject,code,actions,(await configured(subject,code)).standardDigest).expect(201)).body.data;
      const standard = async (subject:string,code:string,actions:string[],stale?:string) => {
        const preview=stale?{digest:stale}:await previewStandard(subject,code,actions);
        return http.put('/api/sys/menu-registry/egg-source-standard-grants/'+subject+'/'+code).auth(admin,{type:'bearer'})
          .send({actions,expectedDigest:preview.digest,reason:'Verify the isolated standard grant'});
      };
      const scopeBefore=await configured('role','ROLE_EGG_APPLY');
      const wrong=await standard('role','ROLE_EGG_APPLY',['V','A']);
      expect(wrong.status).toBe(409);
      const equivalence=await previewStandard('role','ROLE_EGG_APPLY',scopeBefore.actions);
      expect(equivalence.changes).toEqual([]);
      const converted=await standard('role','ROLE_EGG_APPLY',scopeBefore.actions,equivalence.digest);
      expect(converted.status).toBe(200);
      expect(converted.body.data.standard.actions).toEqual(['V','C','E']);
      await previewRequest('role','ROLE_EGG_APPLY',['V'],scopeBefore.standardDigest).expect(409);
      const stale=await standard('role','ROLE_EGG_APPLY',[],equivalence.digest);
      expect(stale.status).toBe(409);
      await http.put('/api/sys/menu-registry/egg-source-organization-grants/role/ROLE_EGG_APPLY')
        .auth(admin,{type:'bearer'}).send({expectedDigest:converted.body.data.digest,rows:[],reason:'Attempt to use the old editor'}).expect(409);
      const revocation=await previewStandard('role','ROLE_EGG_APPLY',[]);
      expect(revocation.changes).toEqual(expect.arrayContaining([expect.objectContaining({
        houseCode:'HOUSE-HOUSE-PILOT',before:['V','C','E'],after:[],
      })]));
      await db.query("INSERT INTO brd_houses(house_code,farm_code,status,house_type) VALUES ('HOUSE-STANDARD-NEW','FARM-A','ACTIVE','LAYER')");
      expect((await standard('role','ROLE_EGG_APPLY',[],revocation.digest)).status).toBe(409);
      const withdrawn=await standard('role','ROLE_EGG_APPLY',[]);
      expect(withdrawn.status).toBe(200);
      expect(await db.query('SELECT * FROM md_egg_source_effective_grants WHERE role_id=21')).toEqual([]);
      expect((await configured('role','ROLE_EGG_APPLY')).rows).toEqual(scopeBefore.rows);
      expect((await standard('role','ROLE_EGG_APPLY',scopeBefore.actions)).status).toBe(200);
      const setBefore=await configured('set','PSET_EGG_REVIEW');
      const beforeNewMember=await previewStandard('set','PSET_EGG_REVIEW',setBefore.actions);
      const memberWriter=db.createQueryRunner();
      await memberWriter.connect();
      await memberWriter.startTransaction();
      try {
        await memberWriter.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:egg-source-grant-editor'))");
        await memberWriter.query('INSERT INTO sys_user_permission_set(user_id,set_id) VALUES (23,22)');
        const awaitingSave=standard('set','PSET_EGG_REVIEW',setBefore.actions,beforeNewMember.digest);
        let waiting=false;
        for (let attempt=0;attempt<50&&!waiting;attempt++) {
          const [locks]=await db.query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory'
            AND NOT granted AND objid::bigint=(hashtext('phoenix:egg-source-grant-editor')::bigint & 4294967295)) AS waiting`);
          waiting=locks.waiting;
          if (!waiting) await delay(20);
        }
        await memberWriter.commitTransaction();
        expect((await awaitingSave).status).toBe(409);
        expect(waiting).toBe(true);
      } finally {
        if (memberWriter.isTransactionActive) await memberWriter.rollbackTransaction();
        await memberWriter.release();
        await db.query('DELETE FROM sys_user_permission_set WHERE user_id=23 AND set_id=22');
      }
      expect((await standard('set','PSET_EGG_REVIEW',setBefore.actions)).status).toBe(200);
      expect(await db.query("SELECT scope_type,scope_code FROM md_egg_source_effective_grants WHERE role_id=21"))
        .toEqual([{scope_type:'HOUSE',scope_code:'HOUSE-HOUSE-PILOT'}]);
      await expect(sets.assignUser('PSET_EGG_REVIEW',21,{userId:21,perms_version:1})).rejects.toMatchObject({status:403});
      const [{perms_version:adminVersion}] = await db.query('SELECT perms_version FROM sys_user WHERE user_id=26');
      await sets.assignUser('PSET_EGG_REVIEW',22,{userId:26,perms_version:Number(adminVersion)});
      await db.query('DELETE FROM sys_role_permission_set WHERE role_id=22');
      await db.query('DELETE FROM sys_user_warehouse_scopes WHERE user_id IN (21,22)');
      const login = async (id:number) => (await http.post('/api/auth/login')
        .send({username:'egg-fixture-'+id,password}).expect(200)).body;
      const makerSession=await login(21), reviewerSession=await login(22);
      const makerV2=makerSession.token, reviewerV2=reviewerSession.token;
      const userManager=await token(23,{permissions:['MENU_SETTINGS_USER:E']});
      await http.put('/api/users/23/role').auth(userManager,{type:'bearer'}).send({role:'ROLE_EGG_APPLY'}).expect(403);
      await http.put('/api/system/users/23/role').auth(userManager,{type:'bearer'}).send({role:'ROLE_EGG_APPLY'}).expect(403);
      await http.put('/api/users/26/password').auth(userManager,{type:'bearer'}).send({password:'FixtureOnly2026!'}).expect(403);
      await http.put('/api/system/users/26/password').auth(userManager,{type:'bearer'}).send({password:'FixtureOnly2026!'}).expect(403);

      expect(makerSession.user_info.permissions.find((permission:string)=>permission.startsWith('MENU_MD_EGG_SOURCE:'))?.split(':')[1].split(',')).toEqual(expect.arrayContaining(['V','C','E']));
      expect(reviewerSession.user_info.permissions.some((permission:string)=>permission.startsWith('MENU_MD_EGG_SOURCE:'))).toBe(true);
      const {warehouseCode:_,...houseInput}=input();
      const body={...houseInput,houseCode:'HOUSE-HOUSE-PILOT',contractVersion:2,actionKey:randomUUID()};
      const postDraft=(user:string,requestBody:Record<string,unknown>=body)=>http.post(base+'/changes').auth(user,{type:'bearer'}).send(requestBody);
      await postDraft(makerV2).expect(409);
      const pilotPath='/api/sys/menu-registry/egg-source-house-rollouts/HOUSE-HOUSE-PILOT';
      const pilotRequest={expectedEnabled:null,enabled:true,reason:'Approved isolated pilot',maker:'egg-fixture-21',reviewer:'egg-fixture-22'};
      await http.put(pilotPath).auth(admin,{type:'bearer'}).send(pilotRequest).expect(409);
      await http.post(newGate).auth(admin,{type:'bearer'})
        .send({expectedEnabled:false,enabled:true,reason:'Verified protocol test'}).expect(201);
      await http.put(pilotPath).auth(admin,{type:'bearer'}).send({...pilotRequest,reviewer:pilotRequest.maker}).expect(409);
      const effective=(await http.get('/api/sys/menu-registry/egg-source-house-access').auth(admin,{type:'bearer'})
        .query({house:'HOUSE-HOUSE-PILOT',username:pilotRequest.maker}).expect(200)).body.data;
      expect(effective).toMatchObject({eligibleAccount:true,actions:['V','C','E'],
        origins:expect.arrayContaining([{action:'E',source:{subject:'role',code:'ROLE_EGG_APPLY',
          retained:true,scopeType:'HOUSE',scopeCode:'HOUSE-HOUSE-PILOT'}}])});
      await http.put(pilotPath).auth(admin,{type:'bearer'}).send(pilotRequest).expect(200);
      await postDraft(makerV2,{...body,houseCode:'HOUSE-RBAC'}).expect(403);
      await postDraft(reviewerV2).expect(403);
      await postDraft(legacy).expect(403);
      const openedV2=browserURL ? await createBrowserDraft(browserURL,password,future) : (await postDraft(makerV2).expect(201)).body.data;
      expect(openedV2.payload).not.toHaveProperty('warehouseCode');
      const docV2=base+'/changes/'+openedV2.id;
      await expect(db.transaction(async m=>{
        await m.query("SELECT set_config('phoenix.egg_source_writer','21',true)");
        return m.query("UPDATE md_egg_source_changes SET version=version+1 WHERE id=$1",[openedV2.id]);
      })).rejects.toMatchObject({driverError:{code:'42501',message:'EGG_SOURCE_STANDARD_PROTOCOL_REQUIRED'}});
      await expect(db.transaction(async m=>{
        await m.query("SELECT set_config('phoenix.egg_source_writer','21',true)");
        return m.query(`INSERT INTO md_egg_source_change_events(change_id,action_key,actor_id,action,input_sha256,receipt)
          VALUES($1,$2,'21','cancel',repeat('a',64),'{}')`,[openedV2.id,randomUUID()]);
      })).rejects.toMatchObject({driverError:{code:'42501'}});
      const submitV2=(await http.post(docV2+'/actions/submit').auth(makerV2,{type:'bearer'})
        .send({contractVersion:2,version:1,actionKey:randomUUID()}).expect(201)).body.data.change;
      const reviewV2=(await http.get(docV2).auth(reviewerV2,{type:'bearer'}).expect(200)).body.data;
      expect(reviewV2).toMatchObject({contractVersion:2,warehouseCode:null,readiness:{status:'NOT_CUT_OVER'},allowedActions:['approve','reject']});
      const reviewV2Key=randomUUID();
      const reviewV2Body={contractVersion:2,version:2,actionKey:reviewV2Key,
        planDigest:submitV2.approval.planDigest,readinessDigest:reviewV2.readiness.digest};
      await http.post(docV2+'/reviews/approve').auth(reviewerV2,{type:'bearer'}).send({...reviewV2Body,readinessDigest:'stale'}).expect(409);
      const scopeId=randomUUID();
      await db.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
        flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,'COMP-A','HOUSE-HOUSE-PILOT',1,$2,
        'DRAFT','WH-SHARED','FLOCK-A','PROFILE-A',repeat('d',64),'{}','fixture')`,[scopeId,future]);
      await db.query(`INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code)
        VALUES($1,'COMP-A','WH-SHARED','PRD-EGG-RAW')`,[scopeId]);
      const blocked=(await http.get(docV2).auth(reviewerV2,{type:'bearer'}).expect(200)).body.data;
      expect(blocked.readiness).toMatchObject({status:'BLOCKED',code:'CUTOVER_DRAFT_CONFLICT'});
      await http.post(docV2+'/reviews/approve').auth(reviewerV2,{type:'bearer'}).send(reviewV2Body).expect(409);
      const domain=await activateOwnedConversionDomain(db,{scopeId,houseCode:'HOUSE-HOUSE-PILOT',warehouseCode:'WH-SHARED'});
      await db.query("UPDATE production_cutover_scopes SET state='FENCED' WHERE id=$1",[scopeId]);
      await db.query("UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now() WHERE id=$1",[scopeId]);
      const ready=(await http.get(docV2).auth(reviewerV2,{type:'bearer'}).expect(200)).body.data;
      expect(ready.readiness).toMatchObject({status:'READY',warehouseCode:null});
      expect(ready.readiness.digest).not.toBe(reviewV2.readinessDigest);
      await http.post(docV2+'/reviews/approve').auth(reviewerV2,{type:'bearer'})
        .send({...reviewV2Body,readinessDigest:ready.readiness.digest}).expect(201);
      const [frozen]=await db.query('SELECT approval FROM md_egg_source_changes WHERE id=$1',[openedV2.id]);
      expect(frozen.approval.readiness).toMatchObject({status:'READY',scope:{id:scopeId},domains:[{domainId:domain}]});
      expect(frozen.approval.snapshot.items[0]).not.toHaveProperty('domainId');
      await http.post(newGate).auth(admin,{type:'bearer'})
        .send({expectedEnabled:true,enabled:false,reason:'Confirmed receipt lookup'}).expect(201);
      const original=await http.get(docV2+'/action-requests/'+reviewV2Key).auth(reviewerV2,{type:'bearer'}).expect(200);
      expect(original.body.data).toMatchObject({id:openedV2.id,state:'APPROVED',version:3});
      await http.get(docV2+'/action-requests/'+reviewV2Key).auth(makerV2,{type:'bearer'}).expect(404);
      await http.post(newGate).auth(admin,{type:'bearer'})
        .send({expectedEnabled:false,enabled:true,reason:'Verify safe retirement'}).expect(201);
      await db.query("INSERT INTO brd_houses(house_code,farm_code,status,house_type) VALUES ('HOUSE-V1-REPLAY','FARM-A','ACTIVE','LAYER')");
      const replay={...input(),houseCode:'HOUSE-V1-REPLAY',actionKey:randomUUID()};
      const prior=(await postDraft(admin,replay).expect(201)).body.data;
      const gate='/api/sys/menu-registry/egg-source-legacy-creation';
      const classification=(await http.get(gate).auth(admin,{type:'bearer'}).expect(200)).body.data;
      expect(classification.unclassified).toContain('HOUSE-V1-REPLAY');
      await http.post(gate).auth(admin,{type:'bearer'}).send({confirmed:true,reason:'Unclassified'}).expect(409);
      for (const house of classification.unclassified) {
        await http.put('/api/sys/menu-registry/egg-source-house-rollouts/'+house).auth(admin,{type:'bearer'})
          .send({expectedEnabled:null,enabled:false,reason:'Approved pause in isolated fixture'}).expect(200);
      }
      const admission=db.createQueryRunner();
      await admission.connect();
      await admission.startTransaction();
      const retire=async()=>http.post(gate).auth(admin,{type:'bearer'})
        .send({confirmed:true,reason:'Verified cutover checklist'}).expect(201);
      let pendingRetirement:ReturnType<typeof retire>|undefined;
      try {
        await admission.query('SELECT id FROM md_egg_source_write_control WHERE id=1 FOR SHARE');
        pendingRetirement=retire();
        const end=Date.now()+3000;
        let waiting=false;
        while (!waiting && Date.now()<end) {
          const [activity]=await db.query(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
            WHERE wait_event_type='Lock' AND query LIKE '%legacy_creates_enabled AS enabled%') AS waiting`);
          waiting=activity.waiting;
          if (!waiting) await new Promise(resolve=>setTimeout(resolve,25));
        }
        expect(waiting).toBe(true);
      } finally {
        await admission.commitTransaction();
        await admission.release();
        await pendingRetirement;
      }
      expect((await postDraft(admin,replay).expect(201)).body.data.id).toBe(prior.id);
      await postDraft(admin,{...replay,reason:'Different payload'}).expect(409);
      await http.post(base+'/changes/'+prior.id+'/actions/cancel').auth(admin,{type:'bearer'})
        .send({actionKey:randomUUID(),version:1}).expect(201);
      await db.query("INSERT INTO brd_houses(house_code,farm_code,status,house_type) VALUES ('HOUSE-AFTER-RETIRE','FARM-A','ACTIVE','LAYER')");
      const newLegacy={...replay,houseCode:'HOUSE-AFTER-RETIRE',actionKey:randomUUID()};
      await postDraft(admin,newLegacy).expect(409);
      const held=(await http.get(base+'/workspace').auth(admin,{type:'bearer'}).query({houseCode:newLegacy.houseCode}).expect(200)).body.data;
      expect(held).toMatchObject({createContractVersion:2,createBlocker:'HOUSE_NOT_OPEN'});
      await expect(db.transaction(async m=>{
        await m.query("SELECT set_config('phoenix.egg_source_writer','26',true)");
        await m.query(`INSERT INTO md_egg_source_changes(id,request_key,company_code,farm_code,site_code,house_code,effective_date,
          target_class,created_by,last_editor,payload) VALUES($1,$2,'COMP-A','FARM-A',$3,'HOUSE-AFTER-RETIRE',$4,'RED','26','26',$5)`,
          [randomUUID(),newLegacy.actionKey,site,future,JSON.stringify(prior.payload)]);
      })).rejects.toMatchObject({driverError:{code:'42501',message:'EGG_SOURCE_LEGACY_CREATION_RETIRED'}});
      await expect(db.query('DELETE FROM md_egg_source_write_control')).rejects.toMatchObject({driverError:{code:'42501'}});
      await expect(db.query('UPDATE md_egg_source_write_control SET legacy_creates_enabled=true')).rejects.toMatchObject({driverError:{code:'42501'}});
      await control(admin,true,false).expect(201);
      await db.query('DELETE FROM sys_role WHERE role_id=21');
      expect(await db.query('SELECT 1 FROM sys_role_menu_permission WHERE role_id=21')).toEqual([]);
    } finally { await testApp.close(); }
  },60000);

});

async function createBrowserDraft(webUrl:string,password:string,effectiveDate:string) {
  const fromWeb=createRequire(resolvePath(process.cwd(),'../web/package.json'));
  const {chromium,expect:browserExpect}=fromWeb('@playwright/test');
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:850},locale:'zh-CN'});
    const login=await page.request.post(webUrl+'/api/auth/login',{data:{username:'egg-fixture-21',password}});
    expect(login.ok()).toBe(true);
    const session=await login.json();
    await page.context().addCookies([{name:'phoenix_access_token',value:session.cookie_token,url:webUrl}]);
    await page.addInitScript((data:{token:string;user_info:unknown})=>{
      sessionStorage.setItem('phoenix_session_version','v6');
      sessionStorage.setItem('phoenix_token',data.token);
      sessionStorage.setItem('phoenix_user',JSON.stringify(data.user_info));
      localStorage.setItem('phoenix_token',data.token);
      localStorage.setItem('phoenix_user',JSON.stringify(data.user_info));
      localStorage.setItem('phoenix_lang','zh');
    },session);
    let warehouseCalls=0;
    page.on('request',(request:{url:()=>string})=>{if (request.url().includes('/candidates/warehouses')) warehouseCalls++;});
    await page.goto(webUrl+'/master-data/egg-sources/new?houseCode=HOUSE-HOUSE-PILOT');
    await browserExpect(page.getByRole('heading',{name:'排期与商品壳色'})).toBeVisible({timeout:12000});
    await browserExpect(page.getByLabel('目标仓库',{exact:true})).toHaveCount(0);
    await page.getByLabel('生效日',{exact:true}).fill(effectiveDate);
    await page.getByLabel('商品壳色',{exact:true}).selectOption('RED');
    await page.getByLabel('等级',{exact:true}).selectOption('GRADE_1');
    await page.getByLabel('规格',{exact:true}).selectOption('LOOSE');
    await page.getByLabel('依据',{exact:true}).fill('Isolated browser change');
    const request=page.waitForResponse((response:{request:()=>{method:()=>string};url:()=>string})=>response.request().method()==='POST' &&
      new URL(response.url()).pathname.endsWith('/egg-sources/changes'));
    await page.getByRole('button',{name:'保存草稿'}).click();
    const response=await request;
    expect(response.ok()).toBe(true);
    expect(response.request().postDataJSON()).not.toHaveProperty('warehouseCode');
    expect(warehouseCalls).toBe(0);
    await browserExpect(page.getByRole('heading',{name:'来源变更详情'})).toBeVisible();
    return (await response.json()).data;
  } finally { await browser.close(); }
}
