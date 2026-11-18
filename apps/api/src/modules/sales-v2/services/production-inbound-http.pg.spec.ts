import 'reflect-metadata';
import { AnalyticsController } from '../../analytics/analytics.controller';
import { GroupAnalyticsService } from '../../analytics/services/group-analytics.service';
import { FinanceAnalyticsService } from '../../analytics/services/finance-analytics.service';
import { SalesAnalyticsAggregatorService } from '../../analytics/services/sales-analytics-aggregator.service';
import { InventoryAnalyticsService } from '../../analytics/services/inventory-analytics.service';
import { ProductionAnalyticsService } from '../../analytics/services/production-analytics.service';
import { ShareholderAnalyticsService } from '../../analytics/services/shareholder-analytics.service';
import { ExceptionAnalyticsService } from '../../analytics/services/exception-analytics.service';
import { ForecastAnalyticsService } from '../../analytics/services/forecast-analytics.service';
import { installEmptyCutoverClosureFixture } from './production-cutover-closure.pg-fixture';
import { ProductionCutoverController } from '../../wms/production-cutover.controller';
import { ProductionCutoverService } from '../../wms/production-cutover.service';
import { FarmController } from '../../farm/farm.controller';
import { FarmService } from '../../farm/farm.service';
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
        (4,'view_only',1,'VIEWER'),(5,'unbound_all',1,'MAKER'),(6,'foreign',1,'MAKER'),(7,'wrong_warehouse',1,'MAKER'),(8,'create_only',1,'CREATOR'),(9,'farm_reporter',1,'FARM_REPORTER'),(10,'farm_only',1,'FARM_REPORTER'),(11,'finance_only',1,'FINANCE_ONLY'),(12,'analyst_a',1,'ANALYST'),(13,'analyst_b',1,'ANALYST'),(14,'analyst_warehouse',1,'ANALYST');
      INSERT INTO sys_role SELECT DISTINCT role_code,'ACTIVE' FROM sys_user;
      INSERT INTO fixture_permissions VALUES('MAKER','MENU_PROD_INBOUND:V,C,E'),('REVIEWER','MENU_PROD_INBOUND:V,E,A'),
        ('REVIEWER','MENU_FIN2_AR_LEDGER:V,E,A'),('RECEIVER','MENU_PROD_INBOUND:V,E'),('VIEWER','MENU_PROD_INBOUND:V'),('CREATOR','MENU_PROD_INBOUND:V,C'),('FARM_REPORTER','MENU_FARM_DAILY:V,E'),('FINANCE_ONLY','MENU_FIN2_AR_LEDGER:E'),('ANALYST','MENU_ANALYTICS:V');
      INSERT INTO sys_menu VALUES('MENU_PROD_INBOUND'),('MENU_PRC2_ORDER'),('MENU_FIN2_AR_LEDGER'),('MENU_FARM_DAILY'),('MENU_DASHBOARD'),('MENU_ANALYTICS');
      INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT u.user_id,o.id,'COMPANY' FROM sys_user u JOIN sys_organizations o
        ON o.org_code=CASE WHEN u.user_id IN (6,13) THEN 'COMP-B' ELSE 'COMP-A' END WHERE u.user_id IN (1,2,3,4,6,8,9,11,12,13);
      INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES(10,'FARM-A');
      INSERT INTO sys_organizations(org_code,org_name,org_type,company_code,status,warehouse_code,parent_id)
        SELECT 'SITE-A','Restricted site','SITE','COMP-A','ACTIVE',NULL,id FROM sys_organizations WHERE org_code='COMP-A';
      INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT 7,id,'SELF' FROM sys_organizations WHERE org_code='SITE-A';
      INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES(7,'WH-A2'),(14,'WH-A2');
      INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT 14,id,'SELF' FROM sys_organizations WHERE org_code='SITE-A';
      ALTER TABLE file_metadata ADD COLUMN id bigserial UNIQUE,ADD COLUMN original_name text,ADD COLUMN stored_name text,ADD COLUMN storage_path text,
        ADD COLUMN size_bytes bigint,ADD COLUMN checksum text,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now();
      ALTER TABLE product_grades ADD COLUMN grade_name text,ADD COLUMN stock_managed boolean DEFAULT true,ADD COLUMN sale_enabled boolean DEFAULT true,
        ADD COLUMN default_stock_status text DEFAULT 'AVAILABLE';
      UPDATE product_grades SET grade_name=grade_code;
      CREATE TABLE inv_source_mode(scope_level text,scope_code text,mode text);
      INSERT INTO inv_source_mode VALUES('GROUP','ALL','TEMP_PRODUCTION_INBOUND');
      CREATE TABLE brd_medication_records(flock_no text,status text,start_date date,withdraw_until date);`);
    await installEmptyCutoverClosureFixture(db);
    await db.query(`ALTER TABLE sal_sales_orders ADD COLUMN company_code text,ADD COLUMN currency_code text,ADD COLUMN total_amount numeric,
        ADD COLUMN customer_code text,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN project_code text;
      ALTER TABLE sal_order_items ADD COLUMN qty numeric,ADD COLUMN amount numeric,ADD COLUMN quantity_snapshot jsonb,ADD COLUMN allocated_qty numeric;
      CREATE TABLE fin_cash_accounts(company_code text,current_balance numeric,status text);
      CREATE TABLE fin_ar_invoices(company_code text,balance_amount_original numeric,collection_status text);
      CREATE TABLE fin_ap_invoices(company_code text,balance_amount_original numeric,payment_status text);
      CREATE TABLE fin_shareholder_contributions(company_code text,amount_original numeric,status text);
      CREATE TABLE fin_expense_requests(company_code text,amount_original numeric,status text,currency_code text,expense_date date,project_code text);
      CREATE TABLE prc2_purchase_orders(id bigint PRIMARY KEY,company_code text,currency_code text);
      CREATE TABLE prc2_order_items(id bigint PRIMARY KEY,po_id bigint,unit_price numeric);
      CREATE TABLE prc2_receipts(id bigint PRIMARY KEY,receipt_no text,company_code text,warehouse_code text,status text,po_id bigint);
      CREATE TABLE prc2_receipt_items(id bigint PRIMARY KEY,receipt_id bigint,item_code text,actual_qty numeric,unit text,po_item_id bigint);`);
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
      @Get('companies')async companies(){return (await db.query("SELECT org_code FROM sys_organizations WHERE org_type='COMPANY' AND status='ACTIVE'")).map((c:any)=>({companyCode:c.org_code,orgName:c.org_code}));}
      @Get('products')products(){return db.query("SELECT * FROM mst_products WHERE status='ACTIVE'");}
      @Get('houses')async houses(){return (await db.query('SELECT * FROM brd_houses WHERE status=\'ACTIVE\'')).map((h:any)=>({houseCode:h.house_code,houseName:h.house_code,companyCode:'COMP-A',siteCode:'SITE-A',ownershipResolved:true}));}
      @Get('warehouses')async warehouses(@Query('companyCode') company:string){return (await db.query('SELECT * FROM wms_warehouses WHERE company_code=$1',[company||'COMP-A'])).map((w:any)=>({warehouseCode:w.warehouse_code,warehouseName:w.warehouse_code}));}
      @Get('packaging-specs')specs(){return db.query("SELECT *,spec_code AS spec_name FROM packaging_specs WHERE status='ACTIVE'");}
      @Get('product-grades')async grades(){return {code:200,data:await db.query("SELECT * FROM product_grades WHERE status='ACTIVE' ORDER BY sort_order")};}
    }
    @Controller('api/product-master') @UseGuards(AuthGuard('jwt')) class FixtureSkus {@Get('skus')skus(){return db.query("SELECT * FROM product_skus WHERE status='ACTIVE'");}}
    @Controller('api/crud') @UseGuards(AuthGuard('jwt')) class FixtureDictionary {
      @Get('sys_dict')async dict(@Query('dict_type') type:string){return db.query("SELECT * FROM sys_dict WHERE dict_type=$1 AND status='ACTIVE'",[type]);}
    }
    const module=await Test.createTestingModule({imports:[PassportModule,ClsModule.forRoot({global:true,middleware:{mount:true}})],
      controllers:[AnalyticsController,ProductionCutoverController,FarmController,ProductionInboundDocumentsController,UploadController,FixtureLogin,FixtureLookups,FixtureDictionary,FixtureSkus],providers:[FixtureJwt,
        GroupAnalyticsService,...[FinanceAnalyticsService,SalesAnalyticsAggregatorService,InventoryAnalyticsService,ProductionAnalyticsService,ShareholderAnalyticsService,ExceptionAnalyticsService,ForecastAnalyticsService].map(provide=>({provide,useValue:{}})),ProductionCutoverService,FarmService,ProductionInboundDocumentsService,ProductionInboundService,EggInventoryService,SkuAvailabilityService,InventorySourceModeService,FileAccessService,OrgOwnershipService,
        {provide:EntityManager,useValue:db.manager},{provide:DataSource,useValue:db},
        {provide:getRepositoryToken(FileMetadataEntity),useValue:db.getRepository(FileMetadataEntity)},
        {provide:DataScopeService,inject:[ClsService,OrgOwnershipService],useFactory:(cls:ClsService,own:OrgOwnershipService)=>new DataScopeService(
          db.getRepository(SysDataScopeEntity),db.getRepository(SysUserOrgEntity),db.getRepository(SysUserProjectScopeEntity),db.getRepository(SysUserWarehouseScopeEntity),
          db.getRepository(SysUserFarmScopeEntity),db.getRepository(SysOrganizationEntity),cls,own)}]}).compile();
    app=module.createNestApplication();app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
    app.useGlobalFilters(new AllExceptionsFilter({spawn:()=>undefined} as any));await app.init();await hydrateMenuRegistry(db.manager);scopes=app.get(DataScopeService);
    if(process.env.INSTALLMENT_HTTP_PORT)await app.listen(Number(process.env.INSTALLMENT_HTTP_PORT),'127.0.0.1');
  },30000);
  async function resetState(emptyReports=false){
    await db.query(`TRUNCATE prc2_receipt_items,prc2_receipts,prc2_order_items,prc2_purchase_orders,fin_cash_accounts,fin_ar_invoices,fin_ap_invoices,fin_shareholder_contributions,fin_expense_requests,qa_inspections,qa_non_conformance,chanjet_writeback_outbox,chanjet_voucher_drafts,sal_order_items,sal_sales_orders,sal_order_item_batch_allocations,production_cutover_manifests,production_inventory_domain_states,production_handover_cancellations,production_physical_handovers,production_financial_clearances,production_posting_periods,
      production_posting_period_events,production_inbound_allocations,production_inbound_lines,production_inbound_documents,production_opening_receipts,
      production_inbound_days,production_batch_roots,production_batch_qualifications,production_inventory_domains,production_cutover_scopes,inv_batches,
      inv_ledger,brd_flock_events,brd_flock_balances,brd_flock_daily_balances,brd_flock_house_states,brd_daily_logs,inv_flock_source_links,brd_egg_source_receipts,brd_egg_day_routes,brd_flock_occupancies,brd_flock_documents RESTART IDENTITY CASCADE;
      INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,business_date,payload,status,created_by)
        VALUES('HTTP-BASELINE','HTTP-SYNTHETIC-COUNT',repeat('b',64),'BASELINE','COMP-A','FARM-A','HOUSE-A','2026-11-17','{}','POSTED','fixture');
      INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,capacity_snapshot,opened_document_id)
        VALUES('HTTP-OCC','FLOCK-A','HOUSE-A','COMP-A','FARM-A','SITE-A','2026-11-17',5000,'HTTP-BASELINE');
      INSERT INTO brd_flock_events(id,document_id,line_no,flock_no,occupancy_id,company_code,farm_code,site_code,house_code,business_date,kind,quantity_delta,actor,approved_by)
        VALUES('HTTP-BASELINE-EVENT','HTTP-BASELINE',1,'FLOCK-A','HTTP-OCC','COMP-A','FARM-A','SITE-A','HOUSE-A','2026-11-17','BASELINE',1000,'fixture','fixture-reviewer');
      INSERT INTO brd_flock_balances(flock_no,company_code,farm_code,site_code,house_code,quantity,baseline_on,last_business_date)
        VALUES('FLOCK-A','COMP-A','FARM-A','SITE-A','HOUSE-A',1000,'2026-11-17','2026-11-17');
      INSERT INTO brd_flock_daily_balances VALUES('FLOCK-A','2026-11-17',0,1000,0,0);
      INSERT INTO brd_flock_house_states(house_code,state,document_id,last_occupied_on) VALUES('HOUSE-A','OCCUPIED','HTTP-BASELINE','2026-11-17');
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
        VALUES('30000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'2026-11-17','DRAFT','WH-A','FLOCK-A','PROFILE-A',repeat('c',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains VALUES('30000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW');
      UPDATE production_cutover_scopes SET state='FENCED';UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now();
      ${emptyReports?'':`INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id,company_code,farm_code,site_code)
        VALUES('HOUSE-A','FLOCK-A','2026-11-18','DAILY','{"GRADE_1":1000,"GRADE_2":100}','HTTP-OCC','COMP-A','FARM-A','SITE-A');`}

      UPDATE product_skus SET status='ACTIVE';UPDATE file_metadata SET status='ACTIVE';UPDATE sys_user SET status=1;`);
    for(let id=1;id<=14;id++)scopes.invalidate(String(id));
  }
  beforeEach(()=>resetState());
  afterAll(async()=>{
    if(process.env.INSTALLMENT_HTTP_HOLD==='1'){await resetState(process.env.INSTALLMENT_HTTP_GRAIN==='1');console.log('Owned installment HTTP fixture ready');await new Promise<void>(done=>{releaseBrowser=done;});}
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
  const cutoverEndpoint='/api/v2/inventory/production-cutovers';
  const cutoverApi=(id:number,path:string,method:'get'|'post'='post')=>request(app.getHttpServer())[method](cutoverEndpoint+path).auth(token(id),{type:'bearer'});
  const cutoverUpload=(id:number,warehouse='WH-A',company='COMP-A')=>request(app.getHttpServer()).post('/api/upload/contract').auth(token(id),{type:'bearer'})
    .field('moduleCode','PRODUCTION_CUTOVER').field('ownerType','WAREHOUSE').field('ownerId',warehouse).field('companyCode',company)
    .attach('file',Buffer.from('%PDF-1.4\nSynthetic isolated counted inventory evidence\n%%EOF'),{filename:'synthetic-count.pdf',contentType:'application/pdf'});
  const cutoverBoundary=()=>({companyCode:'COMP-A',warehouseCode:'WH-A',productCodes:['PRD-EGG-RAW'],houses:[{houseCode:'HOUSE-A',firstProductionDate:'2026-11-19'}]});
  const emptyCount=(fileId:string)=>({boundary:cutoverBoundary(),intentKey:randomUUID(),postingDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date()),
    evidenceFileIds:[fileId],physicalTotals:[{productCode:'PRD-EGG-RAW',quantity:0}],openingLines:[],decisions:[],referenceDecisions:[]});
  it('prepares, freezes and role-signs a real uploaded count without enabling any house or physical domain',async()=>{
    const file=(await cutoverUpload(1).expect(201)).body.fileId,p=emptyCount(file);
    const d=(await cutoverApi(1,'').send(p).expect(201)).body;
    expect((await cutoverApi(1,'').send(p).expect(201)).body.id).toBe(d.id);
    await cutoverApi(1,'').send({...p,physicalTotals:[{productCode:'PRD-EGG-RAW',quantity:1}]}).expect(409);
    const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
    expect(frozen.state).toBe('READY');expect(frozen.releaseAdmission).toBe(false);expect(frozen.activationAuthorized).toBe(false);
    expect(frozen.snapshot.missingTables).toEqual([]);
    const signerFile=(await cutoverUpload(2).expect(201)).body.fileId;
    const signature={role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:signerFile,reason:'Synthetic isolated business confirmation'};
    await cutoverApi(1,`/${d.id}/sign`).send(signature).expect(403);
    await cutoverApi(2,`/${d.id}/sign`).send({...signature,contentHash:'a'.repeat(64)}).expect(409);
    await cutoverApi(2,`/${d.id}/sign`).send({...signature,evidenceFileId:file}).expect(409);
    await cutoverApi(2,`/${d.id}/sign`).send(signature).expect(201);
    await cutoverApi(2,`/${d.id}/sign`).send({...signature,role:'FINANCE',reason:'Synthetic isolated finance confirmation'}).expect(201);
    const approved=(await cutoverApi(4,`/${d.id}`,'get').expect(200)).body;
    expect(approved.state).toBe('APPROVED');expect(approved.signatures).toHaveLength(2);
    expect(approved.activationAuthorized).toBe(false);expect((await db.query('SELECT count(*)::int AS n FROM production_inventory_domain_states'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM inv_batches'))[0].n).toBe(0);
    await cutoverApi(4,`/${d.id}/evidence/${file}`,'get').expect(200).expect('Content-Type',/pdf/);
    await cutoverApi(4,`/${d.id}/evidence/FILE-forged`,'get').expect(404);
    await cutoverApi(1,`/${d.id}/apply`).send({contentHash:frozen.content_hash}).expect(404);
  });
  it('checks count JWT, real operation scope, ownership and DTO boundaries without accepting caller activation flags',async()=>{
    await request(app.getHttpServer()).get(cutoverEndpoint).expect(401);
    await cutoverUpload(4).expect(403);await cutoverUpload(5).expect(400);await cutoverUpload(6).expect(400);await cutoverUpload(7).expect(400);
    const file=(await cutoverUpload(1).expect(201)).body.fileId,p=emptyCount(file);
    await cutoverApi(1,'').send({...p,state:'ACTIVE',official:true}).expect(400);
    await cutoverApi(1,'').send({...p,physicalTotals:[{productCode:'PRD-EGG-RAW',quantity:0.5}]}).expect(400);
    await cutoverApi(5,'').send(p).expect(403);await cutoverApi(6,'').send(p).expect(403);await cutoverApi(7,'').send(p).expect(403);
    const d=(await cutoverApi(1,'').send(p).expect(201)).body;
    await cutoverApi(6,`/${d.id}`,'get').expect(403);await cutoverApi(6,`/${d.id}/evidence/${file}`,'get').expect(403);
    await cutoverApi(4,`/${d.id}/freeze`).send({version:0}).expect(403);
    await cutoverApi(1,`/${d.id}/cancel`).send({version:1}).expect(409);
    expect((await cutoverApi(1,`/${d.id}/cancel`).send({version:0}).expect(201)).body.state).toBe('CANCELLED');
    await cutoverApi(1,`/${d.id}/freeze`).send({version:1}).expect(409);
  });
  it('lets a finance E-only signer read its actual count and signature evidence without granting production rights',async()=>{
    const file=(await cutoverUpload(1).expect(201)).body.fileId,d=(await cutoverApi(1,'').send(emptyCount(file)).expect(201)).body;
    const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
    const proof=(await cutoverUpload(11).expect(201)).body.fileId;
    const body={role:'FINANCE',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:proof,reason:'Synthetic finance-only confirmation'};
    await cutoverApi(11,`/${d.id}/sign`).send(body).expect(201);
    await cutoverApi(11,`/${d.id}/sign`).send({...body,role:'BUSINESS'}).expect(403);
    await cutoverApi(11,`/${d.id}`,'get').expect(200);await cutoverApi(11,`/${d.id}/evidence/${proof}`,'get').expect(200).expect('Content-Type',/pdf/);
    await cutoverApi(11,'').send(emptyCount(proof)).expect(403);
  });
  it('denies a foreign house before returning its production facts and holds an incomplete required schema',async()=>{
    await cutoverApi(1,'/inspect').send({...cutoverBoundary(),houses:[{houseCode:'HOUSE-B',firstProductionDate:'2026-11-19'}]}).expect(403);
    const file=(await cutoverUpload(1).expect(201)).body.fileId;
    const d=(await cutoverApi(1,'').send(emptyCount(file)).expect(201)).body;
    await db.query('ALTER TABLE qa_inspections RENAME TO fixture_hidden_qa_inspections');
    try{
      const e=(await cutoverApi(1,'/inspect').send(cutoverBoundary()).expect(201)).body;expect(e.snapshot.missingTables).toContain('qa_inspections');
      await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(409);
      expect((await cutoverApi(1,`/${d.id}`,'get').expect(200)).body.state).toBe('DRAFT');
    }finally{await db.query('ALTER TABLE fixture_hidden_qa_inspections RENAME TO qa_inspections');}
  });
  it('uses actual finance-menu warehouse scope when the same signer also holds broader business approval',async()=>{
    const file=(await cutoverUpload(1).expect(201)).body.fileId,d=(await cutoverApi(1,'').send(emptyCount(file)).expect(201)).body;
    const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body,signer=(await cutoverUpload(2).expect(201)).body.fileId;
    await db.query(`DELETE FROM sys_user_orgs WHERE user_id=2;
      INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT 2,id,'SELF' FROM sys_organizations WHERE org_code='SITE-A';
      INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES(2,'WH-A2');
      INSERT INTO sys_data_scopes(role_code,module_code,scope_type,enabled) VALUES('REVIEWER','MENU_PROD_INBOUND','GROUP',true)`);
    scopes.invalidate('2');
    try{
      const body={role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:signer,reason:'Synthetic scoped signature'};
      await cutoverApi(2,`/${d.id}/sign`).send(body).expect(201);
      await cutoverApi(2,`/${d.id}/sign`).send({...body,role:'FINANCE'}).expect(403);
      expect((await db.query('SELECT signature_role FROM production_cutover_signatures WHERE manifest_id=$1',[d.id])).map((r:any)=>r.signature_role)).toEqual(['BUSINESS']);
    }finally{
      await db.query(`DELETE FROM sys_data_scopes WHERE role_code='REVIEWER';DELETE FROM sys_user_warehouse_scopes WHERE user_id=2;
        DELETE FROM sys_user_orgs WHERE user_id=2;INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT 2,id,'COMPANY' FROM sys_organizations WHERE org_code='COMP-A'`);scopes.invalidate('2');
    }
  });
  async function legacyCountStock(file:string,quantity=0){
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,location_code,product_code,sku_code,source_type,source_no,unit,qty,qty_available,status)
      VALUES('SYNTHETIC-LEGACY-COUNT','COMP-A','WH-A2','LOC-A2','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','SYNTHETIC-OLD-COUNT','枚',$1,$1,'AVAILABLE')`,[quantity]);
    return {...emptyCount(file),boundary:{...cutoverBoundary(),warehouseCode:'WH-A2'},decisions:[{batchNo:'SYNTHETIC-LEGACY-COUNT',disposition:'ARCHIVED_TEST',evidenceFileId:file,reason:'Explicit synthetic historical test classification'}]};
  }
  it('keeps pending DRAFT source metadata from proving carry-forward while cost read and write agree',async()=>{
    const file=(await cutoverUpload(1,'WH-A2').expect(201)).body.fileId,p=await legacyCountStock(file,5);
    const pending=(await cutoverApi(1,'').send({...emptyCount(file),boundary:p.boundary}).expect(201)).body;
    await db.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
      VALUES('30000000-0000-0000-0000-000000000002','COMP-A','HOUSE-A',2,'2026-11-19','DRAFT','WH-A2','FLOCK-A','PROFILE-A',repeat('c',64),'{}','fixture')`);
    await db.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,origin_ref,source_type,source_no,
        evidence_sha256,created_by,opening_manifest_id,source_warehouse_code,source_quantity,source_unit)
      VALUES('SYNTHETIC-LEGACY-COUNT','30000000-0000-0000-0000-000000000002','COMP-A','PRD-EGG-RAW','SKU-GRADE_1','QUALIFIED','OPENING','SYNTHETIC-PENDING:1',
        'PURCHASE','SYNTHETIC-OLD-COUNT',repeat('d',64),'1',$1,'WH-A2',5,'枚')`,[pending.id]);
    await db.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,cost_change,ref_no) VALUES('SYNTHETIC-LEGACY-COUNT','OPENING_INBOUND',5,0,'SYNTHETIC-OLD-COUNT')`);
    const [cost]=await db.query(`SELECT official_inventory_cost_known('SYNTHETIC-LEGACY-COUNT') AS known,cost_change FROM inv_ledger WHERE batch_no='SYNTHETIC-LEGACY-COUNT'`);
    expect(cost).toEqual({known:false,cost_change:null});
    const d=(await cutoverApi(1,'').send({...p,physicalTotals:[{productCode:'PRD-EGG-RAW',quantity:5}],decisions:[{...p.decisions[0],disposition:'CARRY_FORWARD'}]}).expect(201)).body;
    await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(409);
    expect((await cutoverApi(1,`/${d.id}`,'get').expect(200)).body.state).toBe('DRAFT');
  });
  it('follows QA JSON and voucher-outbox foreign keys and resolves fully released real reservation facts without labelling them TEST',async()=>{
    const file=(await cutoverUpload(1,'WH-A2').expect(201)).body.fileId,p=await legacyCountStock(file);
    await db.query(`INSERT INTO sal_sales_orders(id,order_no,status) VALUES(1,'SYNTHETIC-RESOLVED','CANCELLED');
      INSERT INTO sal_order_items(id,sales_order_id,allocated_batch_no) VALUES(2,1,'SYNTHETIC-LEGACY-COUNT');
      INSERT INTO sal_order_item_batch_allocations VALUES(3,2,'SYNTHETIC-LEGACY-COUNT',10,0,10);
      INSERT INTO chanjet_voucher_drafts VALUES(4,'CANCELLED','COMP-A','SYNTHETIC','SYNTHETIC-OLD-COUNT','{"privateMarker":"SYNTHETIC-NONPUBLIC"}');
      INSERT INTO chanjet_writeback_outbox VALUES(5,4,'CANCELLED')`);
    await db.query(`INSERT INTO qa_inspections VALUES(6,'CLOSED',$1,'[]')`,[JSON.stringify(JSON.stringify([{batch_no:'SYNTHETIC-LEGACY-COUNT'}]))]);
    const e=(await cutoverApi(1,'/inspect').send(p.boundary).expect(201)).body;
    expect(e.snapshot.obligations.qa_inspections).toHaveLength(1);expect(e.snapshot.finance.chanjet_writeback_outbox).toHaveLength(1);
    expect(JSON.stringify(e.snapshot.finance)).not.toContain('SYNTHETIC-NONPUBLIC');
    const body={...p,referenceDecisions:e.references.map((r:any)=>({table:r.table,rowSha256:r.rowSha256,classification:'RESOLVED',evidenceFileId:file,reason:'Synthetic actual closed facts'}))};
    const d=(await cutoverApi(1,'').send(body).expect(201)).body;
    const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
    expect(frozen.state).toBe('READY');expect(frozen.payload.referenceDecisions.every((r:any)=>r.classification==='RESOLVED')).toBe(true);
  });
  it('freezes one actual read-only inventory snapshot when a sale commits between stock and ledger reads',async()=>{
    const file=(await cutoverUpload(1,'WH-A2').expect(201)).body.fileId,p=await legacyCountStock(file,100);
    await db.query("INSERT INTO inv_ledger(batch_no,qty_change,change_type,ref_no) VALUES('SYNTHETIC-LEGACY-COUNT',100,'PURCHASE_INBOUND','SYNTHETIC-OLD-COUNT')");
    const d=(await cutoverApi(1,'').send(p).expect(201)).body;
    const original=db.createQueryRunner.bind(db);let committed=false;
    const spy=jest.spyOn(db,'createQueryRunner').mockImplementation((...args:any[])=>{
      const q=original(...args as []),query=q.query.bind(q);
      q.query=(async(sql:string,...parameters:any[])=>{const result=await (query as any)(sql,...parameters);
        if(!committed&&q.isTransactionActive&&sql.includes('SELECT to_jsonb(b) AS fact FROM inv_batches b')){
          committed=true;await db.transaction(async m=>{
            await m.query("UPDATE inv_batches SET qty=60,qty_available=60 WHERE batch_no='SYNTHETIC-LEGACY-COUNT'");
            await m.query("INSERT INTO inv_ledger(batch_no,qty_change,change_type,ref_no) VALUES('SYNTHETIC-LEGACY-COUNT',-40,'FIFO_OUT','SYNTHETIC-CONCURRENT-SALE')");
          });
        }return result;}) as any;return q;
    });
    try{
      const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
      expect(committed).toBe(true);expect(frozen.snapshot.batches[0].qty).toBe(100);
      expect(frozen.snapshot.ledger.reduce((n:number,l:any)=>n+Number(l.qty_change),0)).toBe(100);
      expect((await db.query("SELECT qty FROM inv_batches WHERE batch_no='SYNTHETIC-LEGACY-COUNT'"))[0].qty).toBe('60');
    }finally{spy.mockRestore();}
  });
  const groupApi=(id:number,query='')=>request(app.getHttpServer()).get('/api/v2/analytics/group'+query).auth(token(id),{type:'bearer'});
  async function groupFacts(){
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,source_type,source_no,unit,qty,qty_available,status,unit_cost)
      VALUES('SYNTHETIC-GROUP-COST-1','COMP-A','WH-A2','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','SYNTHETIC-OLD-COST-1','枚',100,90,'AVAILABLE',2),
        ('SYNTHETIC-GROUP-COST-2','COMP-A','WH-A2','PRD-EGG-RAW','SKU-GRADE_1','PURCHASE','SYNTHETIC-OLD-COST-2','枚',100,100,'AVAILABLE',4),
        ('SYNTHETIC-OTHER-WAREHOUSE','COMP-A','WH-A','PRD-STD','SKU-STD','PURCHASE','SYNTHETIC-OTHER','枚',3,3,'AVAILABLE',7);
      INSERT INTO sal_sales_orders(id,order_no,status,company_code,currency_code,total_amount,customer_code)
        VALUES(1,'SYNTHETIC-GROUP-A','APPROVED','COMP-A','CNY',100,'CUSTOMER-A'),(2,'SYNTHETIC-GROUP-B','APPROVED','COMP-B','CNY',900,'CUSTOMER-B');
      INSERT INTO sal_order_items(id,sales_order_id,allocated_batch_no,allocated_qty,qty,amount)
        VALUES(1,1,'SYNTHETIC-GROUP-COST-1',10,10,100);
      INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,reserved_qty,outbound_qty,released_qty)
        VALUES(1,1,'SYNTHETIC-GROUP-COST-1',10,0,0);
      INSERT INTO fin_cash_accounts VALUES('COMP-A',31,'ACTIVE'),('COMP-B',901,'ACTIVE');
      INSERT INTO fin_ar_invoices VALUES('COMP-A',7,'UNPAID'),('COMP-B',700,'UNPAID');
      INSERT INTO fin_ap_invoices VALUES('COMP-A',3,'UNPAID'),('COMP-B',300,'UNPAID');
      INSERT INTO fin_shareholder_contributions VALUES('COMP-A',2,'CONFIRMED'),('COMP-B',200,'CONFIRMED');
      INSERT INTO fin_expense_requests(company_code,amount_original,status,currency_code,expense_date)
        VALUES('COMP-A',5,'APPROVED','CNY','2026-11-18'),('COMP-B',500,'APPROVED','CNY','2026-11-18');
      INSERT INTO prc2_purchase_orders VALUES(1,'COMP-A','CNY');
      INSERT INTO prc2_order_items VALUES(1,1,2),(2,1,4);
      INSERT INTO prc2_receipts VALUES(1,'SYNTHETIC-OLD-COST-1','COMP-A','WH-A2','CONFIRMED',1),(2,'SYNTHETIC-OLD-COST-2','COMP-A','WH-A2','CONFIRMED',1);
      INSERT INTO prc2_receipt_items VALUES(1,1,'SKU-GRADE_1',100,'枚',1),(2,2,'SKU-GRADE_1',100,'枚',2);
      INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no,company_code,warehouse_code)
        VALUES('SYNTHETIC-GROUP-COST-1','PURCHASE_INBOUND',100,'SYNTHETIC-OLD-COST-1','COMP-A','WH-A2'),
          ('SYNTHETIC-GROUP-COST-2','PURCHASE_INBOUND',100,'SYNTHETIC-OLD-COST-2','COMP-A','WH-A2')`);
  }
  it('reads expected order margin from actual allocation fields while respecting real company and stock warehouse scope',async()=>{
    await groupFacts();await groupApi(1).expect(403);await groupApi(12,'?companyCode=COMP-B').expect(403);await groupApi(13,'?companyCode=COMP-A').expect(403);
    const result=(await groupApi(12).expect(200)).body;
    expect(result).toMatchObject({revenue:100,grossProfit:80,netProfit:75,cashBalance:31,receivable:7,payable:3,shareholderInput:2,
      grossProfitStatus:'COMPLETE',grossProfitCostPendingLines:0,grossProfitCurrency:'CNY',grossProfitBasis:'ORDER_ESTIMATE',inventoryValue:621});
    expect(result.dimensions).toEqual({companyCount:1,projectCount:0,customerCount:1});
    const scoped=(await groupApi(14).expect(200)).body;expect(scoped.inventoryValue).toBe(600);expect(scoped.grossProfit).toBe(80);
    await db.query("UPDATE inv_batches SET warehouse_code=NULL WHERE batch_no='SYNTHETIC-GROUP-COST-1'");
    expect((await groupApi(14).expect(200)).body).toMatchObject({grossProfit:null,netProfit:null,grossProfitStatus:'COST_PENDING'});
  });
  it('keeps cross-currency or unproven costs unknown and applies complete end dates to order and expense estimates',async()=>{
    await groupFacts();await db.query("UPDATE sal_sales_orders SET created_at='2026-11-18 16:30:00+08'");
    expect((await groupApi(12,'?dateFrom=2026-11-18&dateTo=2026-11-18').expect(200)).body).toMatchObject({revenue:100,grossProfit:80,netProfit:75});
    await db.query("UPDATE sal_sales_orders SET created_at='2026-11-18 00:30:00+08'");
    expect((await groupApi(12,'?dateFrom=2026-11-18&dateTo=2026-11-18').expect(200)).body).toMatchObject({revenue:100,grossProfit:80,netProfit:75});
    await db.query("UPDATE sal_sales_orders SET created_at='2026-11-19 00:30:00+08'");
    expect((await groupApi(12,'?dateFrom=2026-11-18&dateTo=2026-11-18').expect(200)).body).toMatchObject({revenue:0,grossProfit:0});
    await db.query("UPDATE fin_expense_requests SET currency_code='LAK' WHERE company_code='COMP-A'");
    expect((await groupApi(12).expect(200)).body).toMatchObject({grossProfit:80,netProfit:null});
    await db.query("UPDATE prc2_purchase_orders SET currency_code='LAK'");
    expect((await groupApi(12).expect(200)).body).toMatchObject({grossProfit:null,netProfit:null,grossProfitStatus:'COST_PENDING'});
    await db.query("UPDATE prc2_purchase_orders SET currency_code='CNY'");
    expect((await groupApi(12).expect(200)).body.grossProfit).toBe(80);
    await db.query("DELETE FROM prc2_receipts");
    expect((await groupApi(12).expect(200)).body.grossProfit).toBeNull();
  });
  it('deducts only the selected project expenses from its estimate',async()=>{
    await groupFacts();await db.query(`UPDATE sal_sales_orders SET project_code='PROJECT-A' WHERE company_code='COMP-A';
      UPDATE fin_expense_requests SET project_code='PROJECT-A' WHERE company_code='COMP-A';
      INSERT INTO fin_expense_requests VALUES('COMP-A',15,'APPROVED','CNY','2026-11-18','PROJECT-B')`);
    expect((await groupApi(12,'?projectCode=PROJECT-A').expect(200)).body).toMatchObject({revenue:100,grossProfit:80,netProfit:75});
  });
  it('aggregates each order amount once and keeps incomplete, invalid saved quantity and legacy mixed allocations unknown',async()=>{
    await groupFacts();await db.query(`UPDATE sal_order_item_batch_allocations SET reserved_qty=6 WHERE id=1;
      INSERT INTO sal_order_item_batch_allocations VALUES(2,1,'SYNTHETIC-GROUP-COST-2',4,0,0)`);
    expect((await groupApi(12).expect(200)).body.grossProfit).toBe(72);
    await db.query("INSERT INTO sal_order_item_batch_allocations VALUES(3,1,'SYNTHETIC-OTHER-WAREHOUSE',1,0,1)");
    expect((await groupApi(14).expect(200)).body.grossProfit).toBe(72);
    await db.query('UPDATE sal_order_item_batch_allocations SET released_qty=1 WHERE id=2');
    expect((await groupApi(12).expect(200)).body).toMatchObject({grossProfit:null,netProfit:null,grossProfitCostPendingLines:1});
    await db.query(`DELETE FROM sal_order_item_batch_allocations;UPDATE sal_order_items SET allocated_batch_no='SYNTHETIC-GROUP-COST-1,SYNTHETIC-GROUP-COST-2' WHERE id=1`);
    expect((await groupApi(12).expect(200)).body.grossProfit).toBeNull();
    await db.query(`UPDATE sal_order_items SET allocated_batch_no='SYNTHETIC-GROUP-COST-1' WHERE id=1`);
    expect((await groupApi(12).expect(200)).body.grossProfit).toBe(80);
    await db.query(`UPDATE sal_order_items SET quantity_snapshot='{"version":1,"basis":"BASE","baseQty":999,"factor":1}' WHERE id=1`);
    expect((await groupApi(12).expect(200)).body.grossProfit).toBeNull();
  });
  it('does not treat a qualified unknown production cost or failed cost query as a zero-margin result',async()=>{
    const {ready}=await signedDraft();const posted=(await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body;
    const batch=posted.batches[0].batchNo;
    await db.query(`INSERT INTO sal_sales_orders(id,order_no,status,company_code,currency_code,total_amount) VALUES(1,'SYNTHETIC-UNKNOWN-COST','APPROVED','COMP-A','CNY',100);
      INSERT INTO sal_order_items(id,sales_order_id,qty,amount) VALUES(1,1,10,100)`);
    await db.query('INSERT INTO sal_order_item_batch_allocations VALUES(1,1,$1,10,0,0)',[batch]);
    const pending=(await groupApi(12).expect(200)).body;
    expect(pending).toMatchObject({grossProfit:null,netProfit:null,grossProfitStatus:'COST_PENDING',grossProfitCostPendingLines:1});
    await db.query('ALTER TABLE sal_order_item_batch_allocations RENAME TO fixture_missing_cost_allocations');
    try{expect((await groupApi(12).expect(200)).body).toMatchObject({grossProfit:null,netProfit:null,grossProfitStatus:'UNAVAILABLE',grossProfitCostPendingLines:null});}
    finally{await db.query('ALTER TABLE fixture_missing_cost_allocations RENAME TO sal_order_item_batch_allocations');}
  });
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
  it('uses actual Farm HTTP routes for AM/PM and limits farm-only scope without granting inbound access',async()=>{
    await resetState(true);
    const farm=(id:number,method:'get'|'post',path:string)=>request(app.getHttpServer())[method]('/api/v3/farm'+path).auth(token(id),{type:'bearer'});
    await api(10,'get','/context?companyCode=COMP-A&houseCode=HOUSE-A').expect(200);
    await api(10,'get','/context?companyCode=COMP-B&houseCode=HOUSE-B').expect(403);
    await api(10,'get','').expect(403);
    const p={house_code:'HOUSE-A',flock_no:'FLOCK-A',log_date:day,shift:'AM',eggs_by_grade:{GRADE_0:0,GRADE_1:100,GRADE_2:0,GRADE_3:0,GRADE_4:0,GRADE_5:0,DIRTY:0,BROKEN:0}};
    await farm(10,'post','/daily-logs').send(p).expect(201);
    await farm(10,'post','/daily-logs').send({...p,shift:'PM',eggs_by_grade:{...p.eggs_by_grade,GRADE_1:200}}).expect(201);
    await farm(10,'post','/daily-logs').send(p).expect(201);
    await farm(10,'post','/daily-logs').send({...p,shift:'DAILY'}).expect(400);
    const sources=(await farm(10,'get',`/daily-logs/production-sources?date=${day}&houseCode=HOUSE-A`).expect(200)).body;
    expect(sources.map((r:any)=>[r.shift,r.eggs_by_grade.GRADE_1,r.occupancy_id])).toEqual([['AM',100,'HTTP-OCC'],['PM',200,'HTTP-OCC']]);
    expect((await farm(10,'get',`/daily-logs/production-sources?date=${day}&houseCode=HOUSE-B`).expect(200)).body).toEqual([]);
    expect((await db.query('SELECT count(*)::int AS n FROM inv_ledger'))[0].n).toBe(0);
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
