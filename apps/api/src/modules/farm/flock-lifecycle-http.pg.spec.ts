import {freezeOwnedFlockClock} from '../../test-fixtures/flock-business-clock';
import {FlockReportCorrection1794903000000} from '../../database/migrations/1794903000000-FlockReportCorrection';
import {GenericCrudController} from '../generic-crud/generic-crud.controller';
import {GenericCrudService} from '../generic-crud/generic-crud.service';
import {WmsService} from '../wms/wms.service';
import 'reflect-metadata';
import {Body,Controller,Get,INestApplication,Post,Req,UseGuards} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {getRepositoryToken} from '@nestjs/typeorm';
import {AuthGuard,PassportModule,PassportStrategy} from '@nestjs/passport';
import {ExtractJwt,Strategy} from 'passport-jwt';
import {sign} from 'jsonwebtoken';
import {ClsModule,ClsService} from 'nestjs-cls';
import {DataSource,EntityManager} from 'typeorm';
import request = require('supertest');
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {FlockLifecycleController} from './flock-lifecycle.controller';
import {FlockLifecycleService} from './flock-lifecycle.service';
import {UploadController} from '../upload/upload.controller';
import {FileAccessService} from '../file/file-access.service';
import {FileMetadataEntity} from '../file/entities/file-metadata.entity';
import {DataScopeService} from '../org/services/data-scope.service';
import {OrgOwnershipService} from '../org/services/org-ownership.service';
import {SysDataScopeEntity} from '../org/entities/sys-data-scope.entity';
import {SysOrganizationEntity} from '../org/entities/sys-organization.entity';
import {SysUserOrgEntity} from '../org/entities/sys-user-org.entity';
import {SysUserProjectScopeEntity} from '../org/entities/sys-user-project-scope.entity';
import {SysUserWarehouseScopeEntity} from '../org/entities/sys-user-warehouse-scope.entity';
import {SysUserFarmScopeEntity} from '../org/entities/sys-user-farm-scope.entity';
import {FlockLifecycleLedger1794900000000} from '../../database/migrations/1794900000000-FlockLifecycleLedger';
import {FlockProductionProvenance1794901000000} from '../../database/migrations/1794901000000-FlockProductionProvenance';
import {FlockActivitySources1794902000000} from '../../database/migrations/1794902000000-FlockActivitySources';
import {hydrateMenuRegistry} from '../../common/guards/menu-registry.service';
const url=process.env.FLOCK_HTTP_PG_URL;const suite=url?describe:describe.skip;
const secret='owned-flock-http-fixture-jwt';
suite('flock lifecycle real JWT, persisted roles, DataScope, uploads and PostgreSQL',()=>{
 let releaseBusinessClock:(()=>void)|undefined;
 let db:DataSource,app:INestApplication,scopeService:DataScopeService;let seq=0;
 const token=(id:number)=>sign({sub:id},secret,{expiresIn:'1h'});
 const api=(id:number,method:'get'|'post',path:string)=>request(app.getHttpServer())[method]('/api/v3/farm/flock-lifecycle'+path).auth(token(id),{type:'bearer'});
 const payload=(extra:Record<string,unknown>={})=>({kind:'BASELINE',sourceKey:`http-${++seq}`,houseCode:'HA',flockNo:'FA',businessDate:'2026-11-10',quantity:100,expectedLegacyQty:100,expectedVersion:0,reason:'actual fixture physical count',responsible:'keeper',differenceReceipt:'SIGNED-COUNT',...extra});
 const upload=(id=1,house='HA',company='CA',site='SA')=>request(app.getHttpServer()).post('/api/upload/contract').auth(token(id),{type:'bearer'})
   .field('moduleCode','FLOCK_LIFECYCLE').field('ownerType','HOUSE').field('ownerId',house).field('companyCode',company).field('storeCode',site)
   .attach('file',Buffer.from('%PDF-1.4\nsynthetic owned test evidence\n%%EOF'),{filename:'count.pdf',contentType:'application/pdf'});
 beforeAll(async()=>{
  const u=new URL(url!);if(u.hostname!=='127.0.0.1'||u.pathname!=='/phoenix_flock_http')throw Error('Owned loopback HTTP fixture required');
  db=await new DataSource({type:'postgres',url,synchronize:false,migrationsRun:false,installExtensions:false,
    entities:[SysDataScopeEntity,SysOrganizationEntity,SysUserOrgEntity,SysUserProjectScopeEntity,SysUserWarehouseScopeEntity,SysUserFarmScopeEntity,FileMetadataEntity]}).initialize();
  releaseBusinessClock=freezeOwnedFlockClock(url!,process.env.FLOCK_HTTP_HOLD==='1');
  const sql=readFileSync(resolve(__dirname,'../../../ddl/19_seed_sys_dict.sql'),'utf8');const at=sql.indexOf('CREATE TABLE IF NOT EXISTS sys_dict');await db.query(sql.slice(at,sql.indexOf(');',at)+2));
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS http_dict_identity ON sys_dict(dict_type,dict_code);
   CREATE TABLE IF NOT EXISTS sys_organizations(id bigint PRIMARY KEY,org_code text,org_name text,org_type text,level int,status text,company_code text,project_code text,warehouse_code text,parent_id bigint,site_code text,sort_order int);
   CREATE TABLE IF NOT EXISTS sys_user_orgs(id bigserial PRIMARY KEY,user_id bigint,org_id bigint,is_primary boolean,data_scope_level text,is_manager boolean,UNIQUE(user_id,org_id));
   CREATE TABLE IF NOT EXISTS sys_role(role_code text PRIMARY KEY,status text);
   CREATE TABLE IF NOT EXISTS sys_data_scopes(id bigserial PRIMARY KEY,role_code text,module_code text,scope_type text,enabled boolean,created_at timestamptz DEFAULT now(),UNIQUE(role_code,module_code));
   CREATE TABLE IF NOT EXISTS sys_user_project_scopes(id bigserial PRIMARY KEY,user_id bigint,project_code text,created_at timestamptz);
   CREATE TABLE IF NOT EXISTS sys_user_warehouse_scopes(id bigserial PRIMARY KEY,user_id bigint,warehouse_code text,created_at timestamptz);
   CREATE TABLE IF NOT EXISTS sys_user_farm_scopes(id bigserial PRIMARY KEY,user_id bigint,farm_code text,created_at timestamptz);
   CREATE TABLE IF NOT EXISTS sys_menu(menu_id bigserial PRIMARY KEY,menu_code text UNIQUE,menu_name_zh text,domain text,parent_code text,route text,sort_order int);
   CREATE TABLE IF NOT EXISTS fixture_users(id int PRIMARY KEY,username text,role text);
   CREATE TABLE IF NOT EXISTS fixture_permissions(role text,permission text,PRIMARY KEY(role,permission));
   CREATE TABLE IF NOT EXISTS brd_farms(farm_code text PRIMARY KEY,farm_name text,company_code text,mapped_site_code text,status text);
   CREATE TABLE IF NOT EXISTS brd_houses(house_code text PRIMARY KEY,house_name text,farm_code text,max_capacity int,status text);
   CREATE TABLE IF NOT EXISTS brd_flocks(flock_no text PRIMARY KEY,house_code text,farm_code text,company_code text,site_code text,breed_code text,strain text,breed_type text,start_date date,placement_date date,placement_age int,initial_qty int,current_qty int,status text,elimination_date date,current_lay_rate numeric,updated_at timestamptz DEFAULT now());
   CREATE TABLE IF NOT EXISTS brd_daily_logs(id serial PRIMARY KEY,flock_no text,house_code text,log_date date,shift text);
   ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS mortality_qty integer DEFAULT 0,ADD COLUMN IF NOT EXISTS elimination_qty integer DEFAULT 0,
    ADD COLUMN IF NOT EXISTS opening_qty integer,ADD COLUMN IF NOT EXISTS closing_qty integer,ADD COLUMN IF NOT EXISTS eggs_produced integer DEFAULT 0,ADD COLUMN IF NOT EXISTS lay_rate numeric,ADD COLUMN IF NOT EXISTS eggs_by_grade jsonb,ADD COLUMN IF NOT EXISTS feed_consumed numeric,ADD COLUMN IF NOT EXISTS water_consumed numeric,ADD COLUMN IF NOT EXISTS note text,ADD COLUMN IF NOT EXISTS dirty_eggs integer,ADD COLUMN IF NOT EXISTS broken_eggs integer,ADD COLUMN IF NOT EXISTS farm_code text,ADD COLUMN IF NOT EXISTS company_code text,ADD COLUMN IF NOT EXISTS site_code text,ADD COLUMN IF NOT EXISTS business_date date,ADD COLUMN IF NOT EXISTS operator text;
   ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS farm_name text,ADD COLUMN IF NOT EXISTS source_farm text,ADD COLUMN IF NOT EXISTS cost numeric,ADD COLUMN IF NOT EXISTS target_weeks int,ADD COLUMN IF NOT EXISTS peak_lay_rate numeric,ADD COLUMN IF NOT EXISTS feed_conversion_ratio numeric;
   CREATE TABLE IF NOT EXISTS product_grades(grade_code text PRIMARY KEY,grade_name text,is_saleable boolean,status text);
   INSERT INTO product_grades VALUES('GRADE_1','一级',true,'ACTIVE'),('DIRTY','脏蛋',false,'ACTIVE'),('BROKEN','破损蛋',false,'ACTIVE') ON CONFLICT DO NOTHING;
   CREATE TABLE IF NOT EXISTS inv_batches(batch_no text PRIMARY KEY,quality_grade text);
   CREATE TABLE IF NOT EXISTS file_metadata(id bigserial PRIMARY KEY,file_id text UNIQUE,original_name text,stored_name text,storage_path text,mime_type text,size_bytes bigint,checksum text,module_code text,owner_type text,owner_id text,company_code text,store_code text,uploaded_by text,status text,visibility text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),deleted_at timestamptz);
   INSERT INTO brd_farms VALUES('A','farm A','CA','SA','ACTIVE'),('A2','farm A2','CA','SA2','ACTIVE'),('B','farm B','CB','SB','ACTIVE') ON CONFLICT DO NOTHING;
   INSERT INTO brd_houses VALUES('HA','house A','A',200,'ACTIVE'),('HX','house same company other farm','A2',200,'ACTIVE'),('HB','house B','B',200,'ACTIVE') ON CONFLICT DO NOTHING;
   INSERT INTO sys_organizations(id,org_code,org_name,org_type,level,status,company_code,parent_id,sort_order) VALUES
    (1,'CA','Company A','COMPANY',2,'ACTIVE','CA',NULL,0),(2,'CB','Company B','COMPANY',2,'ACTIVE','CB',NULL,0),
    (3,'SA','Site A','SITE',3,'ACTIVE','CA',1,0),(4,'SA2','Site A2','SITE',3,'ACTIVE','CA',1,0),(5,'SB','Site B','SITE',3,'ACTIVE','CB',2,0) ON CONFLICT DO NOTHING;
   INSERT INTO sys_role VALUES('ROLE_KEEPER','ACTIVE'),('ROLE_REVIEWER','ACTIVE'),('ROLE_POSTER','ACTIVE'),('ROLE_ADMIN','ACTIVE') ON CONFLICT DO NOTHING;
   INSERT INTO fixture_users VALUES(1,'keeper','ROLE_KEEPER'),(2,'reviewer','ROLE_REVIEWER'),(3,'poster','ROLE_POSTER'),(4,'other_farm','ROLE_KEEPER'),(5,'unbound','ROLE_KEEPER'),(6,'admin','ROLE_ADMIN'),(7,'foreign','ROLE_KEEPER') ON CONFLICT DO NOTHING;
   INSERT INTO sys_user_farm_scopes(user_id,farm_code) SELECT id,'A' FROM fixture_users WHERE id IN(1,2,3) AND NOT EXISTS(SELECT 1 FROM sys_user_farm_scopes s WHERE s.user_id=fixture_users.id);
   INSERT INTO sys_user_farm_scopes(user_id,farm_code) SELECT id,CASE WHEN id=4 THEN 'A2' ELSE 'B' END FROM fixture_users WHERE id IN(4,7) AND NOT EXISTS(SELECT 1 FROM sys_user_farm_scopes s WHERE s.user_id=fixture_users.id);
   INSERT INTO fixture_permissions VALUES('ROLE_KEEPER','MENU_FARM_DATA:V'),('ROLE_KEEPER','MENU_FLOCK_CREATE:E'),('ROLE_KEEPER','MENU_FLOCK_BASELINE:A'),
    ('ROLE_REVIEWER','MENU_FARM_DATA:V'),('ROLE_REVIEWER','MENU_FLOCK_APPROVE:A'),('ROLE_REVIEWER','MENU_FLOCK_BASELINE:A'),
    ('ROLE_POSTER','MENU_FARM_DATA:V'),('ROLE_POSTER','MENU_FLOCK_POST:E'),('ROLE_POSTER','MENU_FLOCK_BASELINE:A'),('ROLE_ADMIN','*'),('ROLE_KEEPER','MENU_FLOCK_REPORT:A'),('ROLE_REVIEWER','MENU_FLOCK_REPORT:A'),('ROLE_POSTER','MENU_FLOCK_REPORT:A') ON CONFLICT DO NOTHING;
   INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,status) VALUES('BRD_BREED','BREED','approved breed','ACTIVE') ON CONFLICT DO NOTHING;
   INSERT INTO sys_menu(menu_code,menu_name_zh,domain) VALUES('MENU_FARM_DATA','Flock data','FARM'),('MENU_PRC2_ORDER','Purchase order','PRC') ON CONFLICT DO NOTHING;`);
  const q=db.createQueryRunner();await new FlockLifecycleLedger1794900000000().up(q);await new FlockProductionProvenance1794901000000().up(q);await new FlockActivitySources1794902000000().up(q);await new FlockReportCorrection1794903000000().up(q);await q.release();
  class FixtureJwt extends PassportStrategy(Strategy){
   constructor(){super({jwtFromRequest:ExtractJwt.fromAuthHeaderAsBearerToken(),secretOrKey:secret});}
   async validate(p:{sub:number}){const [u]=await db.query('SELECT * FROM fixture_users WHERE id=$1',[p.sub]);if(!u)return null;
    return {userId:String(u.id),username:u.username,roles:[u.role],role:u.role,permissions:(await db.query('SELECT permission FROM fixture_permissions WHERE role=$1',[u.role])).map((r:any)=>r.permission)};}
  }
  @Controller('api/auth') class FixtureLogin{
   @Post('login')async login(@Body() b:{username:string;password:string}){if(b.password!=='owned-fixture')return {code:401};const [u]=await db.query('SELECT * FROM fixture_users WHERE username=$1',[b.username]);if(!u)return {code:401};const info={userId:String(u.id),username:u.username,realNameZh:u.username,roles:[u.role],role:u.role,permissions:(await db.query('SELECT permission FROM fixture_permissions WHERE role=$1',[u.role])).map((r:any)=>r.permission)};return {code:200,token:token(u.id),user_info:info,user:{userId:String(u.id),username:u.username,roles:[u.role],role:u.role,permissions:(await db.query('SELECT permission FROM fixture_permissions WHERE role=$1',[u.role])).map((r:any)=>r.permission)}};}
  }
  @Controller('api/lookup') @UseGuards(AuthGuard('jwt')) class FixtureLookups {
    @Get('users')async users(){return {code:200,data:(await db.query('SELECT id,username FROM fixture_users WHERE id IN (1,2,3,6)')).map((u:any)=>({code:u.username,username:u.username,id:u.id,name:u.username,realNameZh:u.username,storeCode:'ALL',status:'ACTIVE'}))};}
    @Get('product-grades')async grades(){return {code:200,data:await db.query("SELECT grade_code,grade_name,is_saleable,status FROM product_grades WHERE status='ACTIVE'")};}
    @Get('suppliers')async suppliers(){return {code:200,data:[]};}
    @Get('farms')async farms(){return {code:200,data:[{farmCode:'A',farmNameZh:'farm A',farmName:'farm A',status:'ACTIVE'}]};}
  }
  const mod=await Test.createTestingModule({imports:[PassportModule,ClsModule.forRoot({global:true,middleware:{mount:true}})],
   controllers:[FlockLifecycleController,GenericCrudController,FixtureLookups,UploadController,FixtureLogin],providers:[FixtureJwt,FlockLifecycleService,GenericCrudService,FileAccessService,OrgOwnershipService,{provide:WmsService,useValue:{}},
    {provide:EntityManager,useValue:db.manager},{provide:DataSource,useValue:db},{provide:getRepositoryToken(FileMetadataEntity),useValue:db.getRepository(FileMetadataEntity)},
    {provide:DataScopeService,inject:[ClsService,OrgOwnershipService],useFactory:(cls:ClsService,own:OrgOwnershipService)=>new DataScopeService(db.getRepository(SysDataScopeEntity),db.getRepository(SysUserOrgEntity),db.getRepository(SysUserProjectScopeEntity),db.getRepository(SysUserWarehouseScopeEntity),db.getRepository(SysUserFarmScopeEntity),db.getRepository(SysOrganizationEntity),cls,own)}]}).compile();
  app=mod.createNestApplication();await app.init();if(process.env.FLOCK_HTTP_PORT)await app.listen(Number(process.env.FLOCK_HTTP_PORT),'127.0.0.1');scopeService=app.get(DataScopeService);
  await app.get(FlockLifecycleService).provisionActions({id:'admin',admin:true});await hydrateMenuRegistry(db.manager);
 },30000);
 beforeEach(async()=>{
  await db.query(`TRUNCATE brd_flock_admission_receipts,brd_flock_activity_sources,brd_flock_sales_settlements,inv_flock_source_links,brd_egg_source_receipts,brd_egg_day_routes,brd_flock_events,brd_flock_document_audits,brd_flock_daily_balances,brd_flock_held_balances,brd_flock_house_states,brd_flock_balances,brd_flock_occupancies,brd_flock_documents,brd_daily_logs,brd_flocks CASCADE;
    INSERT INTO brd_flocks(flock_no,house_code,farm_code,company_code,site_code,breed_code,start_date,placement_date,initial_qty,current_qty,status) VALUES('FA','HA','A','CA','SA','BREED','2026-01-01','2026-01-01',100,100,'LAYING');`);
  for(let id=1;id<=7;id++)scopeService.invalidate(String(id));
 });
 afterAll(async()=>{
  if(process.env.FLOCK_HTTP_HOLD==='1'){console.log('Owned HTTP/browser fixture ready');await new Promise<void>(done=>process.once('SIGUSR2',done));}
  await app?.close();await db?.destroy();releaseBusinessClock?.();
 },process.env.FLOCK_HTTP_HOLD==='1'?21600000:30000);
 it('registers actions without auto grants, denying ordinary-user provisioning',async()=>{
  await api(1,'post','/provision-actions').send({}).expect(403);
  const r=await api(6,'post','/provision-actions').send({}).expect(201);expect(r.body.data.rolesGranted).toBe(false);
 });
 it('non-admin uploads real protected metadata, creates, submits, independent reviewer approves, poster posts',async()=>{
  const file=await upload().expect(201);expect(file.body.fileId).toMatch(/^FILE-/);
  const r=await api(1,'post','/documents').send(payload({evidence:[file.body.fileId]})).expect(201);let d=r.body.data;
  await api(4,'get',`/documents/${d.id}`).expect(403);await api(5,'get',`/documents/${d.id}`).expect(403);
  d=(await api(1,'post',`/documents/${d.id}/submit`).send({version:0}).expect(201)).body.data;
  await api(1,'post',`/documents/${d.id}/approve`).send({version:1}).expect(403);
  d=(await api(2,'post',`/documents/${d.id}/approve`).send({version:d.version}).expect(201)).body.data;
  await api(1,'post',`/documents/${d.id}/post`).send({version:d.version}).expect(403);
  d=(await api(3,'post',`/documents/${d.id}/post`).send({version:d.version}).expect(201)).body.data;
  expect(d.status).toBe('POSTED');expect(d.business_date).toBe('2026-11-10');
  const detail=(await api(2,'get',`/documents/${d.id}`).expect(200)).body.data;expect(detail.business_date).toBe('2026-11-10');expect(detail.events[0].business_date).toBe('2026-11-10');
  const balances=(await api(1,'get','/balances').expect(200)).body.data;expect(balances[0].baseline_on).toBe('2026-11-10');expect((await db.query('SELECT quantity FROM brd_flock_balances'))[0].quantity).toBe(100);
  await api(2,'get',`/documents/${d.id}/evidence/${file.body.fileId}`).expect(200);
 });
 it('rejects spoofed house/company/site, same-company foreign farm and unbound users at upload/create',async()=>{
  await upload(1,'HB','CB','SB').expect(400);await upload(1,'HA','CB','SA').expect(400);await upload(1,'HX','CA','SA2').expect(400);await upload(5).expect(400);
  const validEvidence=(await upload().expect(201)).body.fileId;
  for(const id of [4,7,5])await api(id,'post','/documents').send(payload({evidence:[validEvidence]})).expect(403);
  expect((await db.query('SELECT COUNT(*)::int AS n FROM brd_flock_documents'))[0].n).toBe(0);
  for(const id of [4,5,7])expect((await api(id,'get','/documents').expect(200)).body.data).toHaveLength(0);
 });
 it('rejects fake, pending, disabled, foreign-owner and other-uploader evidence',async()=>{
  const f=(await upload().expect(201)).body.fileId;
  await api(1,'post','/documents').send(payload({evidence:['FILE-forged']})).expect(400);
  for(const status of ['PENDING','DISABLED']){await db.query('UPDATE file_metadata SET status=$2 WHERE file_id=$1',[f,status]);await api(1,'post','/documents').send(payload({evidence:[f]})).expect(400);}
  await db.query("UPDATE file_metadata SET status='ACTIVE',uploaded_by='reviewer' WHERE file_id=$1",[f]);await api(1,'post','/documents').send(payload({evidence:[f]})).expect(400);
 });
});
