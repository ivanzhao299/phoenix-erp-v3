import 'reflect-metadata';
import { Body, Controller, Get, INestApplication, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthGuard, PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { sign } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ClsModule, ClsService } from 'nestjs-cls';
import { DataSource, EntityManager } from 'typeorm';
import request = require('supertest');
import { installProductionInboundFixture } from './production-inbound.pg-fixture';
import { ProductionInboundDocumentsController } from '../controllers/production-inbound-documents.controller';
import { ProductionInboundDocumentsService } from './production-inbound-documents.service';
import { ProductionInboundService } from './production-inbound.service';
import { EggInventoryService } from './egg-inventory.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { InventorySourceModeService } from './inventory-source-mode.service';
import { FileAccessService } from '../../file/file-access.service';
import { FileMetadataEntity } from '../../file/entities/file-metadata.entity';
import { UploadController } from '../../upload/upload.controller';
import { DataScopeService } from '../../org/services/data-scope.service';
import { SysDataScopeEntity } from '../../org/entities/sys-data-scope.entity';
import { SysOrganizationEntity } from '../../org/entities/sys-organization.entity';
import { SysUserOrgEntity } from '../../org/entities/sys-user-org.entity';
import { SysUserProjectScopeEntity } from '../../org/entities/sys-user-project-scope.entity';
import { SysUserWarehouseScopeEntity } from '../../org/entities/sys-user-warehouse-scope.entity';
import { SysUserFarmScopeEntity } from '../../org/entities/sys-user-farm-scope.entity';
import { hydrateMenuRegistry } from '../../../common/guards/menu-registry.service';
import { AllExceptionsFilter } from '../../../common/filters/all-exceptions.filter';

const url=process.env.OFFICIAL_INVENTORY_PG_URL;const suite=url?describe:describe.skip;
const secret='owned-installment-http-fixture-only';
const endpoint='/api/v2/inventory/production-inbound-documents';
suite('formal production inbound — real HTTP/JWT/Menu/DataScope/DTO/upload and PostgreSQL 18',()=>{
  let db:DataSource,app:INestApplication,scopes:DataScopeService;let releaseBrowser:(()=>void)|undefined;const schema=`inbound_http_${process.pid}`;
  const day='2026-11-18';const token=(id:number)=>sign({sub:id},secret,{expiresIn:'2h'});
  const api=(id:number,method:'get'|'post'|'patch',path:string)=>request(app.getHttpServer())[method](endpoint+path).auth(token(id),{type:'bearer'});
  const upload=(id:number,house='HOUSE-A',company='COMP-A',site='SITE-A')=>request(app.getHttpServer()).post('/api/upload/contract').auth(token(id),{type:'bearer'})
    .field('moduleCode','PRODUCTION_INBOUND').field('ownerType','HOUSE').field('ownerId',house).field('companyCode',company).field('storeCode',site)
    .attach('file',Buffer.from('%PDF-1.4\nSynthetic isolated physical handover evidence\n%%EOF'),{filename:'handover.pdf',contentType:'application/pdf'});
  const draft=(quantity=100)=>({companyCode:'COMP-A',houseCode:'HOUSE-A',eggDate:day,warehouseCode:'WH-A',locationCode:'LOC-A',
    intentKey:randomUUID(),handoverRef:`HTTP-${randomUUID()}`,items:[{gradeCode:'GRADE_1',specCode:'LOOSE',quantity}],evidenceFileIds:[] as string[]});
  beforeAll(async()=>{
    const u=new URL(url!);if(u.hostname!=='127.0.0.1'||!['/phoenix_temp_reversal_fixture','/installments_fixture'].includes(u.pathname))throw Error('Owned loopback fixture required');
    db=await new DataSource({type:'postgres',url,synchronize:false,migrationsRun:false,installExtensions:false,
      entities:[SysDataScopeEntity,SysOrganizationEntity,SysUserOrgEntity,SysUserProjectScopeEntity,SysUserWarehouseScopeEntity,SysUserFarmScopeEntity,FileMetadataEntity],
      extra:{options:`-c search_path=${schema}`,max:10}}).initialize();
    if(!(await db.query('SHOW server_version'))[0].server_version.startsWith('18.'))throw Error('PostgreSQL 18 required');
    await db.query(`CREATE SCHEMA "${schema}"`);await installProductionInboundFixture(db,['GRADE_0','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','BROKEN']);
    await db.query(`ALTER TABLE sys_organizations ADD COLUMN id bigserial UNIQUE,ADD COLUMN org_name text,ADD COLUMN level int DEFAULT 2,
        ADD COLUMN project_code text,ADD COLUMN warehouse_code text,ADD COLUMN parent_id bigint,ADD COLUMN site_code text,ADD COLUMN sort_order int DEFAULT 0;
      CREATE TABLE sys_user_orgs(id bigserial PRIMARY KEY,user_id bigint,org_id bigint,is_primary boolean DEFAULT true,data_scope_level text,is_manager boolean DEFAULT false);
      CREATE TABLE sys_role(role_code text PRIMARY KEY,status text);
      CREATE TABLE sys_data_scopes(id bigserial PRIMARY KEY,role_code text,module_code text,scope_type text,enabled boolean,created_at timestamptz DEFAULT now());
      CREATE TABLE sys_user_project_scopes(id bigserial PRIMARY KEY,user_id bigint,project_code text,created_at timestamptz);
      CREATE TABLE sys_user_warehouse_scopes(id bigserial PRIMARY KEY,user_id bigint,warehouse_code text,created_at timestamptz);
      CREATE TABLE sys_user_farm_scopes(id bigserial PRIMARY KEY,user_id bigint,farm_code text,created_at timestamptz);
      CREATE TABLE sys_menu(menu_code text PRIMARY KEY);
      CREATE TABLE sys_user(user_id int PRIMARY KEY,username text,status int DEFAULT 1,role_code text);
      CREATE TABLE fixture_permissions(role_code text,permission text);
      INSERT INTO sys_user VALUES(1,'maker',1,'MAKER'),(2,'reviewer',1,'REVIEWER'),(3,'receiver',1,'RECEIVER'),
        (4,'view_only',1,'VIEWER'),(5,'unbound_all',1,'MAKER'),(6,'foreign',1,'MAKER'),(7,'wrong_warehouse',1,'MAKER'),(8,'create_only',1,'CREATOR');
      INSERT INTO sys_role SELECT DISTINCT role_code,'ACTIVE' FROM sys_user;
      INSERT INTO fixture_permissions VALUES('MAKER','MENU_PROD_INBOUND:V,C,E'),('REVIEWER','MENU_PROD_INBOUND:V,E,A'),
        ('REVIEWER','MENU_FIN2_AR_LEDGER:V,E,A'),('RECEIVER','MENU_PROD_INBOUND:V,E'),('VIEWER','MENU_PROD_INBOUND:V'),('CREATOR','MENU_PROD_INBOUND:V,C');
      INSERT INTO sys_menu VALUES('MENU_PROD_INBOUND'),('MENU_PRC2_ORDER'),('MENU_FIN2_AR_LEDGER'),('MENU_FARM_DAILY');
      INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT u.user_id,o.id,'COMPANY' FROM sys_user u JOIN sys_organizations o
        ON o.org_code=CASE WHEN u.user_id=6 THEN 'COMP-B' ELSE 'COMP-A' END WHERE u.user_id IN (1,2,3,4,6,8);
      INSERT INTO sys_organizations(org_code,org_name,org_type,company_code,status,warehouse_code,parent_id)
        SELECT 'SITE-A','Restricted site','SITE','COMP-A','ACTIVE',NULL,id FROM sys_organizations WHERE org_code='COMP-A';
      INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT 7,id,'SELF' FROM sys_organizations WHERE org_code='SITE-A';
      INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES(7,'WH-A2');
      ALTER TABLE file_metadata ADD COLUMN id bigserial UNIQUE,ADD COLUMN original_name text,ADD COLUMN stored_name text,ADD COLUMN storage_path text,
        ADD COLUMN size_bytes bigint,ADD COLUMN checksum text,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now();
      ALTER TABLE product_grades ADD COLUMN grade_name text,ADD COLUMN stock_managed boolean DEFAULT true,ADD COLUMN sale_enabled boolean DEFAULT true,
        ADD COLUMN default_stock_status text DEFAULT 'AVAILABLE';
      UPDATE product_grades SET grade_name=grade_code;
      CREATE TABLE inv_source_mode(scope_level text,scope_code text,mode text);
      INSERT INTO inv_source_mode VALUES('GROUP','ALL','TEMP_PRODUCTION_INBOUND');
      CREATE TABLE brd_medication_records(flock_no text,status text,start_date date,withdraw_until date);`);
    async function userInfo(id:number){const [u]=await db.query('SELECT * FROM sys_user WHERE user_id=$1 AND status=1',[id]);if(!u)return null;
      return {userId:String(u.user_id),username:u.username,roles:[u.role_code],role:u.role_code,storeCode:'ALL',
        permissions:(await db.query('SELECT permission FROM fixture_permissions WHERE role_code=$1',[u.role_code])).map((r:any)=>r.permission)};}
    class FixtureJwt extends PassportStrategy(Strategy){constructor(){super({jwtFromRequest:ExtractJwt.fromAuthHeaderAsBearerToken(),secretOrKey:secret});}
      async validate(p:{sub:number}){return userInfo(p.sub);}}
    @Controller('api/auth') class FixtureLogin {
      @Post('fixture-finish')finish(@Body() body:{password:string}){if(body.password!=='owned-fixture')return {code:403};releaseBrowser?.();return {code:200};}
      @Post('login')async login(@Body() b:{username:string;password:string}){if(b.password!=='owned-fixture')return {code:401};
        const [u]=await db.query('SELECT user_id FROM sys_user WHERE username=$1',[b.username]);if(!u)return {code:401};
        const user=await userInfo(u.user_id);return {code:200,token:token(u.user_id),user,user_info:user};}
    }
    @Controller('api/lookup') @UseGuards(AuthGuard('jwt')) class FixtureLookups {
      @Get('houses')async houses(){return (await db.query('SELECT * FROM brd_houses WHERE status=\'ACTIVE\'')).map((h:any)=>({houseCode:h.house_code,houseName:h.house_code,companyCode:'COMP-A',siteCode:'SITE-A',ownershipResolved:true}));}
      @Get('warehouses')async warehouses(@Query('companyCode') company:string){return (await db.query('SELECT * FROM wms_warehouses WHERE company_code=$1',[company||'COMP-A'])).map((w:any)=>({warehouseCode:w.warehouse_code,warehouseName:w.warehouse_code}));}
      @Get('packaging-specs')specs(){return db.query("SELECT *,spec_code AS spec_name FROM packaging_specs WHERE status='ACTIVE'");}
      @Get('product-grades')grades(){return db.query("SELECT * FROM product_grades WHERE status='ACTIVE' ORDER BY sort_order");}
    }
    @Controller('api/crud') @UseGuards(AuthGuard('jwt')) class FixtureDictionary {
      @Get('sys_dict')async dict(@Query('dict_type') type:string){return db.query("SELECT * FROM sys_dict WHERE dict_type=$1 AND status='ACTIVE'",[type]);}
    }
    const module=await Test.createTestingModule({imports:[PassportModule,ClsModule.forRoot({global:true,middleware:{mount:true}})],
      controllers:[ProductionInboundDocumentsController,UploadController,FixtureLogin,FixtureLookups,FixtureDictionary],providers:[FixtureJwt,
        ProductionInboundDocumentsService,ProductionInboundService,EggInventoryService,SkuAvailabilityService,InventorySourceModeService,FileAccessService,OrgOwnershipService,
        {provide:EntityManager,useValue:db.manager},{provide:DataSource,useValue:db},
        {provide:getRepositoryToken(FileMetadataEntity),useValue:db.getRepository(FileMetadataEntity)},
        {provide:DataScopeService,inject:[ClsService,OrgOwnershipService],useFactory:(cls:ClsService,own:OrgOwnershipService)=>new DataScopeService(
          db.getRepository(SysDataScopeEntity),db.getRepository(SysUserOrgEntity),db.getRepository(SysUserProjectScopeEntity),db.getRepository(SysUserWarehouseScopeEntity),
          db.getRepository(SysUserFarmScopeEntity),db.getRepository(SysOrganizationEntity),cls,own)}]}).compile();
    app=module.createNestApplication();app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
    app.useGlobalFilters(new AllExceptionsFilter({spawn:()=>undefined} as any));await app.init();await hydrateMenuRegistry(db.manager);scopes=app.get(DataScopeService);
    if(process.env.INSTALLMENT_HTTP_PORT)await app.listen(Number(process.env.INSTALLMENT_HTTP_PORT),'127.0.0.1');
  },30000);
  async function resetState(){
    await db.query(`TRUNCATE production_handover_cancellations,production_physical_handovers,production_financial_clearances,production_posting_periods,
      production_posting_period_events,production_inbound_allocations,production_inbound_lines,production_inbound_documents,production_opening_receipts,
      production_inbound_days,production_batch_roots,production_batch_qualifications,production_inventory_domains,production_cutover_scopes,inv_batches,
      inv_ledger,brd_daily_logs,inv_flock_source_links,brd_egg_source_receipts,brd_egg_day_routes,brd_flock_occupancies,brd_flock_documents RESTART IDENTITY CASCADE;
      INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,business_date,payload,status,created_by)
        VALUES('HTTP-BASELINE','HTTP-SYNTHETIC-COUNT',repeat('b',64),'BASELINE','COMP-A','FARM-A','HOUSE-A','2026-11-17','{}','POSTED','fixture');
      INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,capacity_snapshot,opened_document_id)
        VALUES('HTTP-OCC','FLOCK-A','HOUSE-A','COMP-A','FARM-A','SITE-A','2026-11-17',5000,'HTTP-BASELINE');
      INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id)
        VALUES('HOUSE-A','FLOCK-A','2026-11-18','DAILY','{"GRADE_1":1000,"GRADE_2":100}','HTTP-OCC');
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
        VALUES('30000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'2026-11-17','DRAFT','WH-A','FLOCK-A','PROFILE-A',repeat('c',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains VALUES('30000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW');
      UPDATE production_cutover_scopes SET state='FENCED';UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now();
      UPDATE product_skus SET status='ACTIVE';UPDATE file_metadata SET status='ACTIVE';UPDATE sys_user SET status=1;`);
    for(let id=1;id<=8;id++)scopes.invalidate(String(id));
  }
  beforeEach(resetState);
  afterAll(async()=>{
    if(process.env.INSTALLMENT_HTTP_HOLD==='1'){await resetState();console.log('Owned installment HTTP fixture ready');await new Promise<void>(done=>{releaseBrowser=done;});}
    await app?.close();if(db?.isInitialized){await db.query(`DROP SCHEMA "${schema}" CASCADE`);await db.destroy();}
  },process.env.INSTALLMENT_HTTP_HOLD==='1'?21600000:30000);
  async function signedDraft(quantity=100){const p=draft(quantity);const file=(await upload(1).expect(201)).body.fileId;p.evidenceFileIds=[file];
    const report=(await db.query('SELECT id FROM brd_daily_logs ORDER BY id'))[0].id;
    const handover=(await api(1,'post','/handovers').send({companyCode:p.companyCode,houseCode:p.houseCode,eggDate:p.eggDate,
      warehouseCode:p.warehouseCode,handoverRef:p.handoverRef,segments:[{dailyLogId:report,gradeCode:'GRADE_1',quantity,evidenceFileId:file}]}).expect(201)).body;
    await api(1,'post',`/handovers/${handover.id}/confirm`).send({version:1,contentHash:handover.content_hash}).expect(409);
    await api(3,'post',`/handovers/${handover.id}/confirm`).send({version:1,contentHash:handover.content_hash}).expect(201);
    const d=(await api(1,'post','').send(p).expect(201)).body;
    const ready=(await api(1,'post',`/${d.id}/ready`).send({version:d.version,submitKey:randomUUID()}).expect(201)).body;
    return {p,ready,file,handover};
  }
  it('enforces real JWT, operation permissions, strict DTO and canonical company/warehouse scope',async()=>{
    await request(app.getHttpServer()).get(endpoint).expect(401);
    await api(4,'post','').send(draft()).expect(403);await api(5,'post','').send(draft()).expect(403);await api(6,'post','').send(draft()).expect(403);
    await api(1,'post','').send({...draft(),sourceType:'TEMP_PRODUCTION',official:true}).expect(400);
    await api(1,'post','').send({...draft(),items:[{gradeCode:'GRADE_1',quantity:1.5}]}).expect(400);
    await api(7,'get',`/balance?companyCode=COMP-A&houseCode=HOUSE-A&eggDate=${day}&warehouseCode=WH-A`).expect(403);
    await api(7,'get',`/balance?companyCode=COMP-A&houseCode=HOUSE-A&eggDate=${day}&warehouseCode=WH-A2`).expect(409);
    const locations=await api(1,'get','/locations?companyCode=COMP-A&houseCode=HOUSE-A&warehouseCode=WH-A').expect(200);
    expect(locations.body.map((l:any)=>l.location_code)).toContain('LOC-A');
    await upload(4).expect(403);await upload(5).expect(400);await upload(6).expect(400);
    await upload(8).expect(201);await upload(3).expect(201); // creator C-only and receiver E-only never need WMS/Procurement E
  });
  it('posts real uploaded signed segments, recovers by handover after storage loss and replays with V-only permission',async()=>{
    const {p,ready,file,handover}=await signedDraft();const result=(await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body;
    expect(result.totalInbound).toBe(100);expect(result.documentId).toBe(ready.id);
    const found=await api(4,'get',`/recover?companyCode=COMP-A&handoverRef=${encodeURIComponent(p.handoverRef)}`).expect(200);
    expect(found.body[0].id).toBe(ready.id);
    expect((await api(4,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body).toEqual(result);
    await api(4,'get',`/handovers/${handover.id}/evidence/${file}`).expect(200).expect('Content-Type',/pdf/);
    await api(6,'get',`/handovers/${handover.id}/evidence/${file}`).expect(403);
    await api(4,'get',`/${ready.id}/evidence/FILE-forged`).expect(404);
    expect((await db.query('SELECT count(*)::int AS n FROM inv_ledger'))[0].n).toBe(1);
  });
  it('requires independent finance and business signatures and serves their bound protected evidence',async()=>{
    const {ready}=await signedDraft();await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201);
    const d=(await api(1,'get',`/${ready.id}`).expect(200)).body;const evidence=(await upload(1).expect(201)).body.fileId;
    const r=(await api(1,'post',`/${d.id}/reversals`).send({intentKey:randomUUID(),reason:'Synthetic physical return correction',segments:[{allocationId:d.lines[0].allocations[0].id,quantity:20}],evidenceFileIds:[evidence]}).expect(201)).body;
    const frozen=(await api(1,'post',`/${r.id}/ready`).send({version:r.version,submitKey:randomUUID()}).expect(201)).body;
    const financeFile=(await upload(2).expect(201)).body.fileId;
    await api(2,'post','/posting-period').send({companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth:frozen.expected_posting_date.slice(0,7),
      state:'OPEN',expectedVersion:0,evidenceFileId:financeFile,reason:'Synthetic independent open period'}).expect(201);
    const input={contentHash:frozen.content_hash,financialEvidenceFileId:financeFile,periodStatus:'OPEN',costs:[{batchNo:d.lines[0].batch_no,costStatus:'UNKNOWN',unitCost:0}]};
    await api(1,'post',`/${r.id}/financial-clearance`).send(input).expect(403);
    const c=(await api(2,'post',`/${r.id}/financial-clearance`).send(input).expect(201)).body;
    expect((await api(2,'post',`/${r.id}/financial-clearance`).send(input).expect(201)).body.id).toBe(c.id);
    await api(4,'get',`/${r.id}/evidence/${financeFile}`).expect(404);
    await api(2,'get',`/${r.id}/evidence/${financeFile}`).expect(200);
    const approved=(await api(2,'post',`/${r.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash,financialClearanceId:c.id}).expect(201)).body;
    await api(1,'post',`/${r.id}/post`).send({submitKey:approved.submit_key,contentHash:approved.content_hash}).expect(201);
    expect((await db.query('SELECT qty FROM inv_batches'))[0].qty).toBe('80');
  });
});
