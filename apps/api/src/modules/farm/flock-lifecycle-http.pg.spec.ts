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
 const token=(id:number,impersonatedBy?:{id:number;username:string})=>sign({sub:id,impersonatedBy},secret,{expiresIn:'1h'});
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
   CREATE TABLE IF NOT EXISTS sys_audit_log(log_id bigserial PRIMARY KEY,user_id bigint NOT NULL,user_name varchar(64) NOT NULL,
    action varchar(32) NOT NULL,entity_type varchar(64),entity_id varchar(128),before_value jsonb,after_value jsonb,created_at timestamp DEFAULT now());
   CREATE TABLE IF NOT EXISTS fixture_users(id int PRIMARY KEY,username text,role text);
   CREATE TABLE IF NOT EXISTS fixture_permissions(role text,permission text,PRIMARY KEY(role,permission));
   CREATE TABLE IF NOT EXISTS brd_farms(farm_code text PRIMARY KEY,farm_name text,company_code text,mapped_site_code text,status text);
   CREATE TABLE IF NOT EXISTS brd_houses(house_code text PRIMARY KEY,house_name text,farm_code text,max_capacity int,status text);
   ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS capacity int;
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
   INSERT INTO brd_houses(house_code,house_name,farm_code,max_capacity,status) VALUES('HA','house A','A',200,'ACTIVE'),('HX','house same company other farm','A2',200,'ACTIVE'),('HNEW','new fixture house','A',200,'ACTIVE'),('HB','house B','B',200,'ACTIVE') ON CONFLICT DO NOTHING;
   INSERT INTO sys_organizations(id,org_code,org_name,org_type,level,status,company_code,parent_id,sort_order) VALUES
    (1,'CA','Company A','COMPANY',2,'ACTIVE','CA',NULL,0),(2,'CB','Company B','COMPANY',2,'ACTIVE','CB',NULL,0),
    (3,'SA','Site A','SITE',3,'ACTIVE','CA',1,0),(4,'SA2','Site A2','SITE',3,'ACTIVE','CA',1,0),(5,'SB','Site B','SITE',3,'ACTIVE','CB',2,0) ON CONFLICT DO NOTHING;
   INSERT INTO sys_role VALUES('ROLE_KEEPER','ACTIVE'),('ROLE_REVIEWER','ACTIVE'),('ROLE_POSTER','ACTIVE'),('ROLE_ADMIN','ACTIVE') ON CONFLICT DO NOTHING;
   INSERT INTO fixture_users VALUES(1,'keeper','ROLE_KEEPER'),(2,'reviewer','ROLE_REVIEWER'),(3,'poster','ROLE_POSTER'),(4,'other_farm','ROLE_KEEPER'),(5,'unbound','ROLE_KEEPER'),(6,'admin','ROLE_ADMIN'),(7,'foreign','ROLE_KEEPER') ON CONFLICT DO NOTHING;
   INSERT INTO sys_user_farm_scopes(user_id,farm_code) SELECT id,'A' FROM fixture_users WHERE id IN(1,2,3) AND NOT EXISTS(SELECT 1 FROM sys_user_farm_scopes s WHERE s.user_id=fixture_users.id);
   INSERT INTO sys_user_farm_scopes(user_id,farm_code) SELECT id,CASE WHEN id=4 THEN 'A2' ELSE 'B' END FROM fixture_users WHERE id IN(4,7) AND NOT EXISTS(SELECT 1 FROM sys_user_farm_scopes s WHERE s.user_id=fixture_users.id);
   INSERT INTO fixture_permissions VALUES('ROLE_KEEPER','MENU_FARM_DATA:V'),('ROLE_KEEPER','MENU_FLOCK_CREATE:E'),('ROLE_KEEPER','MENU_FLOCK_BASELINE:A'),
    ('ROLE_REVIEWER','MENU_FARM_DATA:V'),('ROLE_REVIEWER','MENU_FLOCK_APPROVE:A'),('ROLE_REVIEWER','MENU_FLOCK_BASELINE:A'),
    ('ROLE_POSTER','MENU_FARM_DATA:V'),('ROLE_POSTER','MENU_FLOCK_POST:E'),('ROLE_POSTER','MENU_FLOCK_BASELINE:A'),('ROLE_ADMIN','*'),('ROLE_KEEPER','MENU_FLOCK_REPORT:A'),('ROLE_REVIEWER','MENU_FLOCK_REPORT:A'),('ROLE_POSTER','MENU_FLOCK_REPORT:A'),('ROLE_KEEPER','MENU_FLOCK_CLEAN:A'),('ROLE_REVIEWER','MENU_FLOCK_CLEAN:A'),('ROLE_POSTER','MENU_FLOCK_CLEAN:A') ON CONFLICT DO NOTHING;
   INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,status) VALUES
    ('BRD_BREED','BREED','approved breed','ACTIVE'),('BRD_BREED','OTHER','another breed','ACTIVE'),('BRD_BREED','RETIRED_BREED','retired breed','INACTIVE') ON CONFLICT DO NOTHING;
   INSERT INTO sys_menu(menu_code,menu_name_zh,domain) VALUES('MENU_FARM_DATA','Flock data','FARM'),('MENU_PRC2_ORDER','Purchase order','PRC') ON CONFLICT DO NOTHING;`);
  const q=db.createQueryRunner();await new FlockLifecycleLedger1794900000000().up(q);await new FlockProductionProvenance1794901000000().up(q);await new FlockActivitySources1794902000000().up(q);await new FlockReportCorrection1794903000000().up(q);await q.release();
  class FixtureJwt extends PassportStrategy(Strategy){
   constructor(){super({jwtFromRequest:ExtractJwt.fromAuthHeaderAsBearerToken(),secretOrKey:secret});}
   async validate(p:{sub:number;impersonatedBy?:{id:number;username:string}}){const [u]=await db.query('SELECT * FROM fixture_users WHERE id=$1',[p.sub]);if(!u)return null;
    return {userId:String(u.id),username:u.username,roles:[u.role],role:u.role,impersonatedBy:p.impersonatedBy,permissions:(await db.query('SELECT permission FROM fixture_permissions WHERE role=$1',[u.role])).map((r:any)=>r.permission)};}
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
    DELETE FROM sys_audit_log WHERE action='CONFIRM_BREED';
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
 it('guides first placement before submission and keeps a legacy approval intact until real inspection',async()=>{
  const evidence=(await upload(1,'HNEW').expect(201)).body.fileId;
  const house=async()=> (await api(1,'get','/houses').expect(200)).body.data.find((h:any)=>h.house_code==='HNEW');
  const place=(version:number,sourceReceipt='NEW-HOUSE-DELIVERY')=>payload({kind:'ADMIT',houseCode:'HNEW',expectedHouseVersion:version,
    sourceKind:'INTERNAL',sourceFarmCode:'A',sourceReceipt,breedCode:'BREED',placementAge:80,evidence:[evidence]});
  const createDocument=async(body:Record<string,unknown>)=>(await api(1,'post','/documents').send(body).expect(201)).body.data;
  const act=(d:any,id:number,action:string)=>api(id,'post',`/documents/${d.id}/${action}`).send({version:d.version});
  const approve=async(d:any)=>{
    const submitted=(await act(d,1,'submit').expect(201)).body.data;
    return (await act(submitted,2,'approve').expect(201)).body.data;
  };
  const post=async(d:any)=>(await act(await approve(d),3,'post').expect(201)).body.data;

  expect(await house()).toMatchObject({entry_readiness:'FIRST_CLEAN',state:null,legacy_flocks:0});
  const legacy=await createDocument(place(0));
  expect((await act(legacy,1,'submit').expect(400)).body.message).toContain('首次清洗');
  // Recreate the statuses the previous application admitted before checking cleaning at posting.
  await db.query("UPDATE brd_flock_documents SET status='SUBMITTED',version=1 WHERE id=$1",[legacy.id]);
  expect((await act({...legacy,version:1},2,'approve').expect(400)).body.message).toContain('首次清洗');
  await db.query("UPDATE brd_flock_documents SET status='APPROVED',version=2,approved_by='admin' WHERE id=$1",[legacy.id]);
  const oldApproved={...legacy,version:2};
  expect((await act(oldApproved,6,'post').expect(400)).body.message).toContain('首次清洗');
  expect(await db.query('SELECT * FROM brd_flock_admission_receipts')).toEqual([]);
  expect(await db.query('SELECT * FROM brd_flock_occupancies')).toEqual([]);

  await post(await createDocument(payload({kind:'CLEAN_START',houseCode:'HNEW',expectedHouseVersion:0})));
  expect(await house()).toMatchObject({entry_readiness:'CLEANING',house_version:0});
  expect((await act(oldApproved,6,'post').expect(400)).body.message).toContain('完成清舍验收');
  await post(await createDocument(payload({kind:'CLEAN_ACCEPT',houseCode:'HNEW',expectedHouseVersion:0,evidence:[evidence]})));
  expect(await house()).toMatchObject({entry_readiness:'READY',house_version:1});
  expect((await act(oldApproved,6,'post').expect(409)).body.message).toContain('重新制单审核');
  expect((await api(6,'get',`/documents/${legacy.id}`).expect(200)).body.data).toMatchObject({status:'APPROVED',version:2,events:[]});
  await act(oldApproved,6,'cancel').expect(201);

  const ready=await approve(await createDocument(place(1)));
  const competing=await approve(await createDocument(place(1,'SECOND-DELIVERY')));
  const results=await Promise.all([act(ready,3,'post'),act(competing,3,'post')]);
  expect(results.map(r=>r.status).sort()).toEqual([201,400]);
  const winner=results.find(r=>r.status===201)!.body.data;
  expect((await act(winner,3,'post').expect(201)).body.data.id).toBe(winner.id);
  expect(await house()).toMatchObject({entry_readiness:'OCCUPIED',quantity:100});
  expect(await db.query("SELECT kind FROM brd_flock_events WHERE kind='ADMIT'")).toEqual([{kind:'ADMIT'}]);
  expect(await db.query('SELECT quantity FROM brd_flock_admission_receipts')).toEqual([{quantity:100}]);
  expect(await db.query('SELECT house_code FROM brd_flock_occupancies')).toEqual([{house_code:'HNEW'}]);
 });
 const confirmBody={houseCode:'HA',breedCode:'BREED',basis:'Original supplier statement F-881'};
 const confirmRoute='/flocks/FA/breed-confirmation';
 it('recovers an already approved baseline on the original version after confirming the legacy name',async()=>{
  const evidence=(await upload().expect(201)).body.fileId;
  const made=(await api(1,'post','/documents').send(payload({evidence:[evidence]})).expect(201)).body.data;
  await api(1,'post',`/documents/${made.id}/submit`).send({version:0}).expect(201);
  const approved=(await api(2,'post',`/documents/${made.id}/approve`).send({version:1}).expect(201)).body.data;
  // Simulate the persisted older approval with the missing code and only the historic display text.
  await db.query("UPDATE brd_flocks SET breed_code=NULL,strain='approved breed',breed_type=' approved breed ' WHERE flock_no='FA'");
  const action=`/documents/${made.id}/post`;
  expect((await api(3,'post',action).send({version:approved.version}).expect(400)).body.message).toContain('品种核对');
  expect((await api(2,'get','/documents').expect(200)).body.data[0]).toMatchObject({status:'APPROVED',version:approved.version,breed_confirmation_required:true});
  expect((await db.query("SELECT COUNT(*)::int AS n FROM brd_flock_events"))[0].n).toBe(0);
  expect((await api(2,'get',confirmRoute).expect(200)).body.data).toMatchObject({status:'MISSING',historicalNames:['approved breed']});
  await api(2,'post',confirmRoute).send({...confirmBody,breedCode:'OTHER'}).expect(409);
  const confirmed=(await api(2,'post',confirmRoute).send(confirmBody).expect(201)).body.data;
  expect(confirmed).toMatchObject({breedCode:'BREED',changed:true,receiptId:expect.any(String)});
  expect((await api(2,'get','/documents').expect(200)).body.data[0].breed_confirmation_required).toBe(false);
  expect((await api(3,'post',action).send({version:approved.version}).expect(201)).body.data.status).toBe('POSTED');
  expect(await db.query("SELECT strain,breed_type FROM brd_flocks WHERE flock_no='FA'")).toEqual([{strain:'approved breed',breed_type:' approved breed '}]);
  const [audit]=await db.query("SELECT user_name,before_value,after_value FROM sys_audit_log WHERE log_id=$1",[confirmed.receiptId]);
  expect(audit).toMatchObject({user_name:'reviewer',before_value:{breedCode:null,breedType:' approved breed '},after_value:{breedCode:'BREED',basis:confirmBody.basis,houseCode:'HA'}});
 });
 it('flags a missing code on drafts before submission rather than after approval',async()=>{
  await db.query("UPDATE brd_flocks SET breed_code=NULL WHERE flock_no='FA'");
  const evidence=(await upload().expect(201)).body.fileId;
  const made=(await api(1,'post','/documents').send(payload({evidence:[evidence]})).expect(201)).body.data;
  expect((await api(1,'post',`/documents/${made.id}/submit`).send({version:0}).expect(400)).body.message).toContain('品种核对');
  expect((await api(2,'get','/documents').expect(200)).body.data[0]).toMatchObject({status:'DRAFT',version:0,breed_confirmation_required:true});
 });
 it('confirms an empty breed with existing daily reports exactly once and preserves production facts',async()=>{
  await db.query("UPDATE brd_flocks SET breed_code=' ',strain=NULL,breed_type=NULL WHERE flock_no='FA'");
  await db.query("INSERT INTO brd_daily_logs(flock_no,house_code,log_date,shift,eggs_produced,note) VALUES('FA','HA','2026-11-09','DAILY',12,'historical')");
  const day=await db.query("SELECT row_to_json(d) AS fact FROM brd_daily_logs d WHERE flock_no='FA'");
  expect((await api(1,'get',confirmRoute).expect(200)).body.data).toMatchObject({status:'MISSING',historicalNames:[],hasReports:true});
  await api(1,'post',confirmRoute).send(confirmBody).expect(403);
  await api(4,'get',confirmRoute).expect(403);
  await api(4,'post',confirmRoute).send(confirmBody).expect(403);
  await api(2,'post',confirmRoute).send({...confirmBody,startDate:'2026-01-02'}).expect(400);
  await api(2,'post',confirmRoute).send({...confirmBody,breedCode:'RETIRED_BREED'}).expect(400);
  await api(2,'post',confirmRoute).send({...confirmBody,basis:' '}).expect(400);
  const concurrent=await Promise.all([api(2,'post',confirmRoute).send(confirmBody),api(6,'post',confirmRoute).send({...confirmBody,breedCode:'OTHER'})]);
  expect(concurrent.map(r=>r.status).sort()).toEqual([201,409]);
  const {breedCode:active,receiptId}=concurrent.find(r=>r.status===201)!.body.data;
  expect((await api(2,'post',confirmRoute).send({...confirmBody,breedCode:active}).expect(201)).body.data).toMatchObject({changed:false,breedCode:active,receiptId});
  expect((await api(2,'get',confirmRoute).expect(200)).body.data).toMatchObject({status:'CONFIRMED',breedCode:active,receiptId});
  expect(await db.query("SELECT row_to_json(d) AS fact FROM brd_daily_logs d WHERE flock_no='FA'")).toEqual(day);
  expect(await db.query("SELECT breed_code,strain,breed_type,current_qty,start_date::text FROM brd_flocks WHERE flock_no='FA'"))
   .toEqual([{breed_code:active,strain:null,breed_type:null,current_qty:100,start_date:'2026-01-01'}]);
  expect(await db.query("SELECT entity_id FROM sys_audit_log WHERE action='CONFIRM_BREED'")).toEqual([{entity_id:'FA'}]);
 });
 it('keeps shadow initiation attributable and rejects generic tampering with the audit receipt',async()=>{
  await db.query("UPDATE brd_flocks SET breed_code=NULL WHERE flock_no='FA'");
  const result=(await request(app.getHttpServer()).post('/api/v3/farm/flock-lifecycle'+confirmRoute)
   .auth(token(2,{id:6,username:'admin'}),{type:'bearer'}).send(confirmBody).expect(201)).body.data;
  const [audit]=await db.query("SELECT user_name,after_value FROM sys_audit_log WHERE log_id=$1",[result.receiptId]);
  expect(audit).toMatchObject({user_name:'reviewer',after_value:{impersonatedBy:{id:6,username:'admin'}}});
  await request(app.getHttpServer()).put(`/api/crud/sys_audit_log/log_id/${result.receiptId}`).auth(token(6),{type:'bearer'}).send({action:'EDITED'}).expect(403);
  await request(app.getHttpServer()).delete(`/api/crud/sys_audit_log/log_id/${result.receiptId}`).auth(token(6),{type:'bearer'}).expect(403);
 });
 it('denies inconsistent legacy ownership even for the house’s authorized user',async()=>{
  await db.query("UPDATE brd_flocks SET breed_code=NULL,farm_code='B',company_code='CB',site_code='SB' WHERE flock_no='FA'");
  await api(2,'get',confirmRoute).expect(409);
  await api(2,'post',confirmRoute).send(confirmBody).expect(409);
  expect(await db.query("SELECT breed_code FROM brd_flocks WHERE flock_no='FA'")).toEqual([{breed_code:null}]);
 });
 it('rolls back the code assignment if the same transaction cannot persist an audit receipt',async()=>{
  await db.query("UPDATE brd_flocks SET breed_code=NULL WHERE flock_no='FA'");
  await db.query("ALTER TABLE sys_audit_log ADD CONSTRAINT fixture_reject_confirmation CHECK (action <> 'CONFIRM_BREED')");
  try {
   await api(2,'post',confirmRoute).send(confirmBody).expect(500);
   expect(await db.query("SELECT breed_code FROM brd_flocks WHERE flock_no='FA'")).toEqual([{breed_code:null}]);
  } finally {
   await db.query('ALTER TABLE sys_audit_log DROP CONSTRAINT fixture_reject_confirmation');
  }
 });
 it('keeps conflicting aliases and preexisting unavailable codes out of the one-time fill path',async()=>{
  await db.query("UPDATE brd_flocks SET breed_code=NULL,strain='approved breed',breed_type='another breed' WHERE flock_no='FA'");
  await api(2,'post',confirmRoute).send(confirmBody).expect(409);
  await db.query("UPDATE brd_flocks SET breed_code='RETIRED_BREED' WHERE flock_no='FA'");
  expect((await api(2,'get',confirmRoute).expect(200)).body.data.status).toBe('CATALOG_REVIEW');
  await api(2,'post',confirmRoute).send(confirmBody).expect(409);
  expect(await db.query("SELECT entity_id FROM sys_audit_log WHERE action='CONFIRM_BREED'")).toEqual([]);
 });
 it('rejects spoofed house/company/site, same-company foreign farm and unbound users at upload/create',async()=>{
  await upload(1,'HB','CB','SB').expect(400);await upload(1,'HA','CB','SA').expect(400);await upload(1,'HX','CA','SA2').expect(400);await upload(5).expect(400);
  const validEvidence=(await upload().expect(201)).body.fileId;
  for(const id of [4,7,5])await api(id,'post','/documents').send(payload({evidence:[validEvidence]})).expect(403);
  expect((await db.query('SELECT COUNT(*)::int AS n FROM brd_flock_documents'))[0].n).toBe(0);
  for(const id of [4,5,7])expect((await api(id,'get','/documents').expect(200)).body.data).toHaveLength(0);
 });
 it('retains controlled historical evidence upload for disabled masters without widening scope',async()=>{
  await db.query("UPDATE brd_houses SET status='INACTIVE' WHERE house_code='HA'");
  try {
   const file=await upload(1).expect(201);expect(file.body.fileId).toMatch(/^FILE-/);
   await db.query("UPDATE brd_farms SET status='INACTIVE' WHERE farm_code='A'");
   // Explicit farm grants retain their existing ACTIVE eligibility. A current
   // company grant can authorize controlled historical evidence for that company.
   scopeService.invalidate('1');await upload(1).expect(400);
   await db.query("INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level,is_primary) VALUES(1,1,'COMPANY',true)");scopeService.invalidate('1');
   await upload(1).expect(201);
   for(const id of [4,5,7])await upload(id).expect(400);
   await upload(1,'HA','CB','SA').expect(400);
   await upload(1,'HA','CA','FORGED').expect(400);
  } finally {await db.query("DELETE FROM sys_user_orgs WHERE user_id=1 AND org_id=1;UPDATE brd_houses SET status='ACTIVE' WHERE house_code='HA';UPDATE brd_farms SET status='ACTIVE' WHERE farm_code='A'");scopeService.invalidate('1');}
 });
 it('rejects fake, pending, disabled, foreign-owner and other-uploader evidence',async()=>{
  const f=(await upload().expect(201)).body.fileId;
  await api(1,'post','/documents').send(payload({evidence:['FILE-forged']})).expect(400);
  for(const status of ['PENDING','DISABLED']){await db.query('UPDATE file_metadata SET status=$2 WHERE file_id=$1',[f,status]);await api(1,'post','/documents').send(payload({evidence:[f]})).expect(400);}
  await db.query("UPDATE file_metadata SET status='ACTIVE',uploaded_by='reviewer' WHERE file_id=$1",[f]);await api(1,'post','/documents').send(payload({evidence:[f]})).expect(400);
 });
});
