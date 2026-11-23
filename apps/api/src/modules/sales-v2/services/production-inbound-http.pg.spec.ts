import { ProductionCutoverEvidenceBarriers1795025712607 } from '../../../database/migrations/1795025712607-ProductionCutoverEvidenceBarriers';
import { OfficialRawCollectionReceipts1795005390930 } from '../../../database/migrations/1795005390930-OfficialRawCollectionReceipts';
import { OfficialRawCollectionController } from '../controllers/official-raw-collection.controller';
import { OfficialRawCollectionService } from './official-raw-collection.service';
import { OfficialInventoryConversions1795011331222 } from '../../../database/migrations/1795011331222-OfficialInventoryConversions';
import { AddWmsDefectDisposition1794405000000 } from '../../../database/migrations/1794405000000-AddWmsDefectDisposition';
import { OfficialInventoryConversionController } from '../controllers/official-inventory-conversion.controller';
import { OfficialInventoryConversionService } from './official-inventory-conversion.service';
import { singaporeBusinessDate } from '../../wms/temp-production-reversal';
import { installManagedSalesFixture, resetManagedSalesFixture } from './production-managed-sales.pg-fixture';
import { ProductMasterService } from '../../product-master/services/product-master.service';
import { SkuPolicy } from '../../product-master/services/sku-policy';
import { resolveQuantity } from '../../product-master/services/quantity-contract';
import { StorePosService } from '../../store-pos/services/store-pos.service';
import { StoreScopePolicy } from '../../store-pos/services/store-scope-policy.service';
import { PriceRuntimeService } from './price-runtime.service';
import { DeliveryOrdersService } from './delivery-orders.service';
import { ReturnOrdersService } from './return-orders.service';
import { SalesReturnsController } from '../controllers/sales-returns.controller';
import { FinanceCreditNoteAdapter } from '../adapters/finance-credit-note.adapter';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { AlignWmsTransactionForms1787731200000 } from '../../../database/migrations/1787731200000-AlignWmsTransactionForms';
import { UpgradeWmsTransferLifecycle1787965200000 } from '../../../database/migrations/1787965200000-UpgradeWmsTransferLifecycle';
import { CUTOVER_PROVENANCE_SIGNER } from '../../wms/cutover-cross-company-proof';
import { WmsService } from '../../wms/wms.service';
import 'reflect-metadata';
import * as postingClock from '../../wms/temp-production-reversal';
import { ProductionDocumentContinuations1795400100000 } from '../../../database/migrations/1795400100000-ProductionDocumentContinuations';
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
import { FlockLifecycleController } from '../../farm/flock-lifecycle.controller';
import { FlockLifecycleService } from '../../farm/flock-lifecycle.service';
import { FarmController } from '../../farm/farm.controller';
import { FarmService } from '../../farm/farm.service';
import { Body, Controller, Get, INestApplication, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthGuard, PassportModule, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { sign } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import crypto = require('crypto');
import { existsSync,readdirSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp = require('sharp');
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
    const sample=await PDFDocument.create();sample.addPage([300,200]).drawText('Owned synthetic conversion evidence');conversionPdf=Buffer.from(await sample.save());
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
        (4,'view_only',1,'VIEWER'),(5,'unbound_all',1,'MAKER'),(6,'foreign',1,'MAKER'),(7,'wrong_warehouse',1,'MAKER'),(8,'create_only',1,'CREATOR'),(9,'farm_reporter',1,'FARM_REPORTER'),(10,'farm_only',1,'FARM_REPORTER'),(11,'finance_only',1,'FINANCE_ONLY'),(12,'analyst_a',1,'ANALYST'),(13,'analyst_b',1,'ANALYST'),(14,'analyst_warehouse',1,'ANALYST'),(15,'cross_company_operator',1,'MAKER'),(16,'company_b_reviewer',1,'REVIEWER');
      INSERT INTO sys_role SELECT DISTINCT role_code,'ACTIVE' FROM sys_user;
      INSERT INTO fixture_permissions VALUES('MAKER','MENU_PROD_INBOUND:V,C,E'),('REVIEWER','MENU_PROD_INBOUND:V,E,A'),
        ('REVIEWER','MENU_FIN2_AR_LEDGER:V,E,A'),('RECEIVER','MENU_PROD_INBOUND:V,E'),('VIEWER','MENU_PROD_INBOUND:V'),('CREATOR','MENU_PROD_INBOUND:V,C'),('FARM_REPORTER','MENU_FARM_DAILY:V,E'),('FINANCE_ONLY','MENU_FIN2_AR_LEDGER:E'),('ANALYST','MENU_ANALYTICS:V');
      INSERT INTO fixture_permissions VALUES('MAKER','MENU_SALES2_RETURN:V,C,E'),('RECEIVER','MENU_SALES2_RETURN:V,E'),('VIEWER','MENU_SALES2_RETURN:V');
      INSERT INTO sys_menu VALUES('MENU_SALES2_RETURN'),('MENU_PROD_INBOUND'),('MENU_PRC2_ORDER'),('MENU_FIN2_AR_LEDGER'),('MENU_FARM_DAILY'),('MENU_DASHBOARD'),('MENU_ANALYTICS');
      INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT u.user_id,o.id,'COMPANY' FROM sys_user u JOIN sys_organizations o
        ON o.org_code=CASE WHEN u.user_id IN (6,13,16) THEN 'COMP-B' ELSE 'COMP-A' END WHERE u.user_id IN (1,2,3,4,6,8,9,11,12,13,15,16);
      INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) SELECT 15,id,'COMPANY' FROM sys_organizations WHERE org_code='COMP-B';
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
      CREATE TABLE brd_medication_records(flock_no text,status text,start_date date,withdraw_until date,end_date date);
      ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS current_lay_rate numeric;
      ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS dirty_eggs int,ADD COLUMN IF NOT EXISTS broken_eggs int;
      INSERT INTO sys_menu VALUES('MENU_FARM_DATA');
      INSERT INTO fixture_permissions VALUES('MAKER','MENU_FARM_DATA:V'),('MAKER','MENU_FLOCK_CREATE:E'),
        ('MAKER','MENU_FLOCK_POST:E'),('MAKER','MENU_FLOCK_CLOSE:A'),('REVIEWER','MENU_FARM_DATA:V'),
        ('REVIEWER','MENU_FLOCK_APPROVE:A'),('REVIEWER','MENU_FLOCK_CLOSE:A'),('MAKER','MENU_FLOCK_CLEAN:A'),('REVIEWER','MENU_FLOCK_CLEAN:A');
      INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by)
        VALUES('FILE-close','ACTIVE','PROTECTED','application/pdf','FLOCK_LIFECYCLE','HOUSE','HOUSE-A','COMP-A','SITE-A','maker'),
          ('FILE-close-A2','ACTIVE','PROTECTED','application/pdf','FLOCK_LIFECYCLE','HOUSE','HOUSE-A2','COMP-A','SITE-A','maker');`);
    await db.query(`ALTER TABLE pkg_source_batches ADD COLUMN batch_code text,ADD COLUMN source_inbound_no text,ADD COLUMN shift_id int,
      ADD COLUMN total_qty int,ADD COLUMN dirty_qty int DEFAULT 0,ADD COLUMN cracked_qty int DEFAULT 0,ADD COLUMN batch_status text;
      CREATE TABLE pkg_work_shifts(id int PRIMARY KEY,site_id text,production_date date,is_test boolean);`);
    const rawMigration=db.createQueryRunner();await rawMigration.connect();
    try{await new OfficialRawCollectionReceipts1795005390930().up(rawMigration);}finally{await rawMigration.release();}
    await installEmptyCutoverClosureFixture(db);
    const continuation = db.createQueryRunner();
    try { await new ProductionDocumentContinuations1795400100000().up(continuation); }
    finally { await continuation.release(); }
    await db.query('ALTER TABLE brd_vaccinations ADD COLUMN flock_no text,ADD COLUMN status text,ADD COLUMN actual_date date');
    // Replace only the empty closure contracts with the real owned transfer schema for actual handovers.
    await db.query('DROP TABLE wms_transfer_items;DROP TABLE wms_transfer');
    const transfers=db.createQueryRunner();await transfers.connect();
    try{await new AlignWmsTransactionForms1787731200000().up(transfers);await new UpgradeWmsTransferLifecycle1787965200000().up(transfers);}finally{await transfers.release();}
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
    await installManagedSalesFixture(db);
    await db.query('DROP TABLE wms_defect_dispositions');
    const conversionMigration=db.createQueryRunner();await conversionMigration.connect();
    try{await new AddWmsDefectDisposition1794405000000().up(conversionMigration);await new OfficialInventoryConversions1795011331222().up(conversionMigration);await new ProductionCutoverEvidenceBarriers1795025712607().up(conversionMigration);}
    finally{await conversionMigration.release();}
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
    @Controller('api/product-master') @UseGuards(AuthGuard('jwt')) class FixtureSkus {@Get('skus')skus(@Query('product_code') product_code:string,@Query('company_code') company_code:string,@Query('usage') usage:string){return new ProductMasterService(db.manager,{} as never).listSkus({product_code,company_code,usage:SkuPolicy.usage(usage)});}}
    @Controller('api/crud') @UseGuards(AuthGuard('jwt')) class FixtureDictionary {
      @Get('sys_dict')async dict(@Query('dict_type') type:string){return db.query("SELECT * FROM sys_dict WHERE dict_type=$1 AND status='ACTIVE'",[type]);}
    }
    const module=await Test.createTestingModule({imports:[PassportModule,ClsModule.forRoot({global:true,middleware:{mount:true}})],
      controllers:[FlockLifecycleController,SalesReturnsController,OfficialInventoryConversionController,OfficialRawCollectionController,AnalyticsController,ProductionCutoverController,FarmController,ProductionInboundDocumentsController,UploadController,FixtureLogin,FixtureLookups,FixtureDictionary,FixtureSkus],providers:[FlockLifecycleService,OfficialInventoryConversionService,OfficialRawCollectionService,FixtureJwt,
        FinanceCreditNoteAdapter,SalesOrderLifecycleService,
        {provide:ReturnOrdersService,inject:[ClsService,FinanceCreditNoteAdapter,EggInventoryService,SalesOrderLifecycleService],
          useFactory:(cls:ClsService,finance:FinanceCreditNoteAdapter,inventory:EggInventoryService,lifecycle:SalesOrderLifecycleService)=>
            new ReturnOrdersService(db,cls,{} as never,finance,inventory,lifecycle)},
        GroupAnalyticsService,...[FinanceAnalyticsService,SalesAnalyticsAggregatorService,InventoryAnalyticsService,ProductionAnalyticsService,ShareholderAnalyticsService,ExceptionAnalyticsService,ForecastAnalyticsService].map(provide=>({provide,useValue:{}})),ProductionCutoverService,FarmService,ProductionInboundDocumentsService,ProductionInboundService,EggInventoryService,SkuAvailabilityService,InventorySourceModeService,FileAccessService,OrgOwnershipService,
        {provide:CUTOVER_PROVENANCE_SIGNER,useValue:{key:'SYNTHETIC-OWNED-CUTOVER-TRANSFER-PROOF-KEY',keyId:'owned-test-v1'}},
        {provide:EntityManager,useValue:db.manager},{provide:DataSource,useValue:db},
        {provide:WmsService,inject:[ClsService],useFactory:(cls:ClsService)=>new WmsService(db.manager,cls)},
        {provide:getRepositoryToken(FileMetadataEntity),useValue:db.getRepository(FileMetadataEntity)},
        {provide:DataScopeService,inject:[ClsService,OrgOwnershipService],useFactory:(cls:ClsService,own:OrgOwnershipService)=>new DataScopeService(
          db.getRepository(SysDataScopeEntity),db.getRepository(SysUserOrgEntity),db.getRepository(SysUserProjectScopeEntity),db.getRepository(SysUserWarehouseScopeEntity),
          db.getRepository(SysUserFarmScopeEntity),db.getRepository(SysOrganizationEntity),cls,own)}]}).compile();
    app=module.createNestApplication();app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,
      forbidNonWhitelisted:process.env.INSTALLMENT_HTTP_PRODUCTION_VALIDATION!=='1',
      ...(process.env.INSTALLMENT_HTTP_PRODUCTION_VALIDATION==='1'?{transformOptions:{enableImplicitConversion:true}}:{})}));
    app.useGlobalFilters(new AllExceptionsFilter({spawn:()=>undefined} as any));await app.init();await hydrateMenuRegistry(db.manager);scopes=app.get(DataScopeService);
    if(process.env.INSTALLMENT_HTTP_PORT)await app.listen(Number(process.env.INSTALLMENT_HTTP_PORT),'127.0.0.1');
  },30000);
  async function resetState(emptyReports=false){
    await resetManagedSalesFixture(db);
    await db.query("UPDATE inv_source_mode SET mode='TEMP_PRODUCTION_INBOUND';UPDATE md_egg_source_profiles SET status='ACTIVE'");
    // Clear only this test-owned schema, including append-only continuation history.
    await db.query(`ALTER TABLE production_inbound_reissues DISABLE TRIGGER trg_reissue_truncate;
      TRUNCATE production_conversion_documents,production_conversion_inputs,production_conversion_outputs,production_conversion_inventory_debits,
      production_batch_raw_roots,production_batch_derivation_parents,wms_defect_dispositions,
      production_raw_receipt_segments,production_raw_receipts,pkg_source_batches,pkg_work_shifts,wms_transfer_discrepancies,wms_transfer_items,wms_transfer,prc2_receipt_items,prc2_receipts,prc2_order_items,prc2_purchase_orders,fin_cash_accounts,fin_ar_invoices,fin_ap_invoices,fin_shareholder_contributions,fin_expense_requests,qa_inspections,qa_non_conformance,chanjet_writeback_outbox,chanjet_voucher_drafts,sal_order_items,sal_sales_orders,sal_order_item_batch_allocations,production_cutover_manifests,production_inventory_domain_states,production_handover_cancellations,production_physical_handovers,production_financial_clearances,production_posting_periods,
      production_posting_period_events,production_inbound_allocations,production_inbound_lines,production_inbound_documents,production_opening_receipts,
      production_inbound_days,production_batch_roots,production_batch_qualifications,production_inventory_domains,production_cutover_scopes,inv_batches,
      inv_ledger,brd_flock_events,brd_flock_balances,brd_flock_daily_balances,brd_flock_house_states,brd_daily_logs,inv_flock_source_links,brd_egg_source_receipts,brd_egg_day_routes,brd_flock_occupancies,brd_flock_documents RESTART IDENTITY CASCADE;
      ALTER TABLE production_inbound_reissues ENABLE TRIGGER trg_reissue_truncate;
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
        VALUES('HOUSE-A','FLOCK-A','2026-11-18','DAILY','{"GRADE_0":0,"GRADE_1":1000,"GRADE_2":100,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0,"DIRTY":0,"BROKEN":0}','HTTP-OCC','COMP-A','FARM-A','SITE-A');`}

      UPDATE product_skus SET status='ACTIVE';UPDATE file_metadata SET status='ACTIVE';UPDATE sys_user SET status=1;`);
    await db.query(`UPDATE md_egg_source_profiles SET product_mode='VARIANT',variety_code='EGG_RED' WHERE profile_code='PROFILE-A';
      UPDATE md_egg_source_profiles SET product_mode='STANDARD',variety_code=NULL WHERE profile_code='PROFILE-A2'`);
    for(let id=1;id<=16;id++)scopes.invalidate(String(id));
  }
  beforeEach(()=>resetState());
  afterAll(async()=>{
    if(process.env.INSTALLMENT_HTTP_HOLD==='1'){
      await resetState(process.env.INSTALLMENT_HTTP_GRAIN==='1');
      if(process.env.INSTALLMENT_HTTP_CROSS==='1'){
        await crossCompanyReceipt();const {payload}=await companyBCount();const d=(await cutoverApi(6,'').send(payload).expect(201)).body;
        await cutoverApi(6,`/${d.id}/freeze`).send({version:0}).expect(201);
      }
      if(process.env.INSTALLMENT_HTTP_RAW==='1')await seedRaw();
      if(process.env.INSTALLMENT_HTTP_CONVERSION==='1')await conversionDraft();
      console.log('Owned installment HTTP fixture ready');await new Promise<void>(done=>{releaseBrowser=done;});
    }
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
  it('T08/T09 returns structured day conflicts, requires create and edit, and replays an authorized posted receipt',async()=>{
    const previous=(await db.query(`SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date-1)::text AS day`))[0].day;
    const clock=jest.spyOn(postingClock,'singaporeBusinessDate').mockReturnValue(previous);
    let old:any;
    try {
      old=(await signedDraft()).ready;
      const late=await api(1,'post',`/${old.id}/post`).send({submitKey:old.submit_key,contentHash:old.content_hash}).expect(409);
      expect(late.body.code).toBe('PRODUCTION_POSTING_DAY_CHANGED');
    } finally {clock.mockRestore();}
    const intentKey=randomUUID(),url=`/${old.id}/reissue`,body={version:old.version,intentKey};
    await api(4,'post',url).send(body).expect(403);
    await api(6,'post',url).send(body).expect(403);
    await api(1,'post',url).send({...body,unexpected:'x'}).expect(400);
    const first=(await api(1,'post',url).send(body).expect(201)).body;
    expect(first.outcome).toBe('DRAFT');
    expect((await api(1,'post',url).send(body).expect(201)).body).toEqual({...first,outcome:'EXISTING'});
    const next=(await api(1,'post',`/${first.documentId}/ready`).send({version:1,submitKey:randomUUID()}).expect(201)).body;
    const receipt=(await api(1,'post',`/${next.id}/post`).send({submitKey:next.submit_key,contentHash:next.content_hash}).expect(201)).body;
    const tomorrow=jest.spyOn(postingClock,'singaporeBusinessDate').mockReturnValue('2099-01-01');
    try {
      expect((await api(4,'post',`/${next.id}/reissue`).send(body).expect(201)).body).toEqual({outcome:'POSTED',documentId:next.id,receipt});
      await api(6,'post',`/${next.id}/reissue`).send(body).expect(403);
    } finally {tomorrow.mockRestore();}
  });

  const cutoverEndpoint='/api/v2/inventory/production-cutovers';
  const cutoverApi=(id:number,path='',method:'get'|'post'|'patch'='post')=>request(app.getHttpServer())[method](cutoverEndpoint+path).auth(token(id),{type:'bearer'});
  const cutoverUpload=(id:number,warehouse='WH-A',company='COMP-A')=>request(app.getHttpServer()).post('/api/upload/contract').auth(token(id),{type:'bearer'})
    .field('moduleCode','PRODUCTION_CUTOVER').field('ownerType','WAREHOUSE').field('ownerId',warehouse).field('companyCode',company)
    .attach('file',Buffer.from('%PDF-1.4\nSynthetic isolated counted inventory evidence\n%%EOF'),{filename:'synthetic-count.pdf',contentType:'application/pdf'});
  const cutoverBoundary=()=>({companyCode:'COMP-A',warehouseCode:'WH-A',productCodes:['PRD-EGG-RAW'],houses:[{houseCode:'HOUSE-A',firstProductionDate:'2026-11-19'}]});
  const emptyCount=(fileId:string)=>({boundary:cutoverBoundary(),intentKey:randomUUID(),postingDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore'}).format(new Date()),
    evidenceFileIds:[fileId],physicalTotals:[{productCode:'PRD-EGG-RAW',quantity:0}],openingLines:[],decisions:[],referenceDecisions:[]});
  it('preserves exact decimal opening prices through real HTTP and rejects implicit, rounded or overflowing money',async()=>{
    const file=(await cutoverUpload(1).expect(201)).body.fileId;
    const requestFor=(unitCost:unknown,quantity=4)=>({...emptyCount(file),physicalTotals:[{productCode:'PRD-EGG-RAW',quantity}],openingLines:[{
      skuCode:'SKU-GRADE_1',productCode:'PRD-EGG-RAW',gradeCode:'GRADE_1',specCode:'LOOSE',locationCode:'LOC-A',quantity,
      stockStatus:'QUARANTINE',productionDate:null,expireDate:null,costStatus:'CONFIRMED',unitCost,qualityConfirmed:false}]});
    for(const price of [true,{},'2.1234567','1e3',100000000000.00002,'1000000000000','999999999999.999999'])
      await cutoverApi(1).send(requestFor(price)).expect(400);
    const exact=(await cutoverApi(1).send(requestFor('100000000000.000020')).expect(201)).body;
    expect(exact.payload.openingLines[0].unitCost).toBe('100000000000.000020');
    const recovered=(await cutoverApi(1,'/'+exact.id,'get').expect(200)).body;
    expect(recovered.payload.openingLines[0].unitCost).toBe('100000000000.000020');
    const compatible=(await cutoverApi(1).send(requestFor(2.5)).expect(201)).body;
    expect(compatible.payload.openingLines[0].unitCost).toBe(2.5);
  });
  const companyBBoundary=()=>({...cutoverBoundary(),companyCode:'COMP-B',warehouseCode:'WH-B',houses:[{houseCode:'HOUSE-B',firstProductionDate:'2026-11-19'}]});
  async function crossCompanyReceipt(){
    const {ready}=await signedDraft(),posted=(await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body;
    await asInventoryActor(15,async cls=>new WmsService(db.manager,cls).confirmTransfer({transfer_no:'SYNTHETIC-B-RECEIPT',from_warehouse:'WH-A',to_warehouse:'WH-B',
      items:[{batch_no:posted.batches[0].batchNo,qty:20}]},{username:'cross_company_operator'}));
    const [child]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='SYNTHETIC-B-RECEIPT'");
    return {root:posted.batches[0].batchNo,child:child.batch_no};
  }
  async function companyBCount(){
    const file=(await cutoverUpload(6,'WH-B','COMP-B').expect(201)).body.fileId;
    const inspected=(await cutoverApi(6,'/inspect').send(companyBBoundary()).expect(201)).body;
    const payload={...emptyCount(file),boundary:companyBBoundary(),physicalTotals:[{productCode:'PRD-EGG-RAW',quantity:20}],
      decisions:inspected.snapshot.batches.map((b:any)=>({batchNo:b.batch_no,disposition:'CARRY_FORWARD',evidenceFileId:file,reason:'Synthetic verified own received physical stock'})),
      referenceDecisions:inspected.references.map((r:any)=>({table:r.table,rowSha256:r.rowSha256,classification:'RESOLVED',evidenceFileId:file,reason:'Synthetic actual completed handover'}))};
    return {payload,inspected};
  }
  const rawEndpoint='/api/v2/inventory/raw-collection-receipts';
  const rawApi=(id:number,path='',method:'get'|'post'='post')=>request(app.getHttpServer())[method](rawEndpoint+path).auth(token(id),{type:'bearer'});
  async function seedRaw(){
    await db.query(`UPDATE inv_source_mode SET mode='PACKAGING_INBOUND';UPDATE brd_daily_logs SET eggs_by_grade=
      '{"GRADE_0":0,"GRADE_1":1000,"GRADE_2":100,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0,"DIRTY":0,"BROKEN":0}';
      INSERT INTO pkg_work_shifts VALUES(1,'FARM-A','2026-11-18',false);
      INSERT INTO pkg_source_batches(id,house_code,flock_code,received_qty,production_date,lay_date,is_test,batch_code,source_inbound_no,shift_id,total_qty,batch_status)
        VALUES(1,'HOUSE-A','FLOCK-A',100,'2026-11-18','2026-11-18',false,'SYNTHETIC-HTTP-RAW','SYNTHETIC-HTTP-RAW',1,100,'RECEIVED');`);
  }
  async function signedRaw(){
    await seedRaw();
    const file=(await upload(1).expect(201)).body.fileId,[report]=await db.query('SELECT id FROM brd_daily_logs ORDER BY id');
    const input={companyCode:'COMP-A',houseCode:'HOUSE-A',eggDate:day,warehouseCode:'WH-A',handoverRef:randomUUID(),rawCollectionSourceId:'1',
      segments:[{dailyLogId:report.id,gradeCode:'GRADE_1',quantity:100,evidenceFileId:file}]};
    const h=(await api(1,'post','/handovers').send(input).expect(201)).body;
    await api(3,'post',`/handovers/${h.id}/confirm`).send({version:h.version,contentHash:h.content_hash}).expect(201);
    return {companyCode:'COMP-A',houseCode:'HOUSE-A',productionDate:day,warehouseCode:'WH-A',sourceBatchId:'1',handoverId:h.id,intentKey:randomUUID()};
  }
  const lifecycle=(id:number,method:'get'|'post',path:string)=>request(app.getHttpServer())[method]('/api/v3/farm/flock-lifecycle'+path).auth(token(id),{type:'bearer'});
  const blockers=(id=1)=>lifecycle(id,'get',`/occupancies/HTTP-OCC/close-blockers?businessDate=${singaporeBusinessDate()}`);
  async function approvedFlockDocument(input:Record<string,unknown>){
    const created=(await lifecycle(1,'post','/documents').send({houseCode:'HOUSE-A',flockNo:'FLOCK-A',businessDate:singaporeBusinessDate(),
      reason:'Synthetic flock close fixture',sourceKey:randomUUID(),responsible:'keeper',evidence:['FILE-close'],...input}).expect(201)).body.data;
    await lifecycle(1,'post',`/documents/${created.id}/submit`).send({version:created.version}).expect(201);
    return (await lifecycle(2,'post',`/documents/${created.id}/approve`).send({version:created.version+1}).expect(201)).body.data;
  }
  it.each(['ordinary','raw'] as const)('closes only after actual %s handover posting and preserves scoped evidence',async route=>{
    const ordinary=route==='ordinary'?await signedDraft():undefined;
    const raw=route==='raw'?await signedRaw():undefined;
    const [handover]=await db.query('SELECT id,handover_ref FROM production_physical_handovers');
    const [balance]=await db.query("SELECT version FROM brd_flock_balances WHERE flock_no='FLOCK-A'");
    const cull=await approvedFlockDocument({kind:'CULL',quantity:1000,positionCode:'HOLD-A',expectedVersion:balance.version});
    await lifecycle(1,'post',`/documents/${cull.id}/post`).send({version:cull.version}).expect(201);
    const close=await approvedFlockDocument({kind:'CLOSE',expectedVersion:balance.version+1,
      finalProductionStatus:singaporeBusinessDate()===day?'REPORTED':'CONFIRMED_ZERO'});
    const closeAction=()=>lifecycle(1,'post',`/documents/${close.id}/post`).send({version:close.version});
    await blockers(6).expect(404);
    const earlier=(await lifecycle(1,'get','/occupancies/HTTP-OCC/close-blockers?businessDate=2026-11-17').expect(200)).body.data;
    expect(earlier).toContainEqual({reference:handover.handover_ref,reason:'AFTER_CLOSE_DATE'});
    const outstanding=(await blockers().expect(200)).body.data;
    expect(outstanding).toContainEqual({reference:handover.handover_ref,reason:'AWAITING_POSTING'});
    const failed=(await closeAction().expect(409)).body;
    expect(failed).toMatchObject({code:'FLOCK_HANDOVER_CLOSE_HOLD',blockers:outstanding});
    if(ordinary){
      await api(1,'post',`/${ordinary.ready.id}/post`).send({submitKey:ordinary.ready.submit_key,contentHash:ordinary.ready.content_hash}).expect(201);
    } else if(raw){
      const receipt=(await rawApi(1).send(raw).expect(201)).body;
      const ready=(await rawApi(1,`/${receipt.id}/ready`).send({version:0,submitKey:randomUUID()}).expect(201)).body;
      await rawApi(2,`/${receipt.id}/approve`).send({version:ready.version,contentHash:ready.content_hash}).expect(201);
      await rawApi(1,`/${receipt.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201);
      await api(1,'post','').send({...draft(),handoverRef:handover.handover_ref}).expect(409);
    }
    expect((await blockers().expect(200)).body.data).toEqual([]);
    // Previous occupation and today's unsourced legacy document must be distinguished.
    await db.query(`INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,ended_on,capacity_snapshot,opened_document_id)
      VALUES('OLD-HTTP-OCC','OTHER-FLOCK','HOUSE-A','COMP-A','FARM-A','SITE-A','2026-11-12','2026-11-17',5000,'HTTP-BASELINE')`);
    for(const [date,ref] of [['2026-11-16','PRIOR-OCCUPATION'],[day,'REVIEW-MISSING-SOURCE']]){
      await db.query(`INSERT INTO production_physical_handovers(id,company_code,house_code,production_date,scope_id,handover_ref,content_hash,creation_hash,payload,created_by)
        SELECT $1,company_code,house_code,$2,scope_id,$3,content_hash,creation_hash,'{"warehouseCode":"WH-A"}','fixture' FROM production_physical_handovers WHERE id=$4`,
        [randomUUID(),date,ref,handover.id]);
    }
    expect((await blockers().expect(200)).body.data).toEqual([{reference:'REVIEW-MISSING-SOURCE',reason:'SOURCE_MISMATCH'}]);
    await closeAction().expect(409);
    const [ambiguous]=await db.query("SELECT id FROM production_physical_handovers WHERE handover_ref='REVIEW-MISSING-SOURCE'");
    await api(2,'post',`/handovers/${ambiguous.id}/cancel`).send({version:1,reason:'Reconciled unmatched fixture handover'}).expect(201);
    if(ordinary){
      const [closing,creating]=await Promise.all([closeAction(),api(1,'post','').send(draft())]);
      expect([closing.status,creating.status].sort()).toEqual([201,409]);
      if(creating.status===201){
        expect(closing.body.blockers).toContainEqual({reference:creating.body.document_no,reason:'OPEN_DOCUMENT'});
        await api(1,'post',`/${creating.body.id}/cancel`).send({version:creating.body.version}).expect(201);
      } else expect(creating.body.code).toBe('FLOCK_HANDOVER_CLOSED');
    }
    expect((await closeAction().expect(201)).body.data.status).toBe('POSTED');
    expect((await db.query("SELECT closed_on::text AS day FROM brd_flock_balances WHERE flock_no='FLOCK-A'"))[0].day).toBe(singaporeBusinessDate());
    const newDocument=await api(1,'post','').send(draft()).expect(409);
    expect(newDocument.body.code).toBe('FLOCK_HANDOVER_CLOSED');
    const [source]=await db.query('SELECT id FROM brd_daily_logs ORDER BY id');
    const file=(await upload(1).expect(201)).body.fileId;
    const newHandover=await api(1,'post','/handovers').send({companyCode:'COMP-A',houseCode:'HOUSE-A',eggDate:day,
      warehouseCode:'WH-A',handoverRef:randomUUID(),segments:[{dailyLogId:source.id,gradeCode:'GRADE_1',quantity:1,evidenceFileId:file}]}).expect(409);
    expect(newHandover.body.code).toBe('FLOCK_HANDOVER_CLOSED');
    if(ordinary)expect((await api(1,'post','').send(ordinary.p).expect(201)).body.id).toBe(ordinary.ready.id);
    await db.query("UPDATE brd_flocks SET status='LAYING',current_qty=1000 WHERE flock_no='FLOCK-A'");
  });
  it('settles outstanding handovers of the same flock at a previously occupied house',async()=>{
    const {ready,handover}=await signedDraft();
    async function postFlock(input:Record<string,unknown>){
      const doc=await approvedFlockDocument(input);
      await lifecycle(1,'post',`/documents/${doc.id}/post`).send({version:doc.version}).expect(201);
    }
    try {
      for(const kind of ['CLEAN_START','CLEAN_ACCEPT'])await postFlock({kind,houseCode:'HOUSE-A2',expectedHouseVersion:0,expectedVersion:0,evidence:['FILE-close-A2']});
      await postFlock({kind:'TRANSFER',targetHouseCode:'HOUSE-A2',expectedVersion:0});
      const [newHouse]=await db.query("SELECT id FROM brd_flock_occupancies WHERE flock_no='FLOCK-A' AND ended_on IS NULL");
      const outstanding=(await lifecycle(1,'get',`/occupancies/${newHouse.id}/close-blockers?businessDate=${singaporeBusinessDate()}`).expect(200)).body.data;
      expect(outstanding).toContainEqual({reference:handover.handover_ref,reason:'AWAITING_POSTING'});
      await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201);
      expect((await lifecycle(1,'get',`/occupancies/${newHouse.id}/close-blockers?businessDate=${singaporeBusinessDate()}`).expect(200)).body.data).toEqual([]);
    } finally {
      await db.query("UPDATE brd_flocks SET house_code='HOUSE-A',farm_code='FARM-A',site_code='SITE-A' WHERE flock_no='FLOCK-A'");
    }
  });
  let conversionPdf:Buffer;
  const conversionEndpoint='/api/v2/inventory/conversions';
  const conversionApi=(id:number,path='',method:'get'|'post'='post')=>request(app.getHttpServer())[method](conversionEndpoint+path).auth(token(id),{type:'bearer'});
  const conversionUpload=(id:number,warehouse='WH-A',company='COMP-A')=>request(app.getHttpServer()).post('/api/upload/contract').auth(token(id),{type:'bearer'})
    .field('moduleCode','PRODUCTION_CONVERSION').field('ownerType','WAREHOUSE').field('ownerId',warehouse).field('companyCode',company)
    .attach('file',conversionPdf,{filename:'synthetic-conversion.pdf',contentType:'application/pdf'});
  async function conversionDraft(segmentId?:string){
    const input=await signedRaw(),raw=(await rawApi(1).send(input).expect(201)).body;
    const frozen=(await rawApi(1,`/${raw.id}/ready`).send({version:0,submitKey:randomUUID()}).expect(201)).body;
    await rawApi(2,`/${raw.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash}).expect(201);
    const uuid=segmentId?jest.spyOn(crypto,'randomUUID').mockReturnValueOnce(segmentId as ReturnType<typeof randomUUID>):undefined;
    try{await rawApi(1,`/${raw.id}/post`).send({submitKey:frozen.submit_key,contentHash:frozen.content_hash}).expect(201);}finally{uuid?.mockRestore();}
    const [segment]=await db.query('SELECT id FROM production_raw_receipt_segments WHERE receipt_id=$1',[raw.id]);
    const proof=(await conversionUpload(1).expect(201)).body.fileId,financeFile=(await upload(2).expect(201)).body.fileId;
    await api(2,'post','/posting-period').send({companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth:singaporeBusinessDate().slice(0,7),state:'OPEN',
      expectedVersion:0,evidenceFileId:financeFile,reason:'Owned actual conversion posting period'}).expect(201);
    return {companyCode:'COMP-A',warehouseCode:'WH-A',productCode:'PRD-EGG-RAW',operationKind:'GRADING',operationDate:singaporeBusinessDate(),
      physicalGroupRef:randomUUID(),intentKey:randomUUID(),inputs:[{rawSegmentId:segment.id,quantity:100}],
      outputs:[{outputKind:'WIP',gradeCode:'GRADE_1',quantity:100,skuCode:'SKU-GRADE_1',locationCode:'LOC-A',evidenceFileId:proof}]};
  }
  async function processingCount(warehouse='WH-A',house='HOUSE-A'){
    const file=(await cutoverUpload(1,warehouse).expect(201)).body.fileId,boundary={...cutoverBoundary(),warehouseCode:warehouse,houses:[{houseCode:house,firstProductionDate:day}]};
    const inspected=(await cutoverApi(1,'/inspect').send(boundary).expect(201)).body;
    return {inspected,payload:{...emptyCount(file),boundary,
      physicalTotals:[{productCode:'PRD-EGG-RAW',quantity:inspected.snapshot.batches.filter((b:any)=>b.warehouse_code===warehouse).reduce((n:number,b:any)=>n+Number(b.qty),0)}],
      decisions:inspected.snapshot.batches.map((b:any)=>({batchNo:b.batch_no,disposition:'CARRY_FORWARD',evidenceFileId:file,reason:'Synthetic actual existing custody'})),
      referenceDecisions:inspected.references.map((r:any)=>({table:r.table,rowSha256:r.rowSha256,classification:'RESOLVED',evidenceFileId:file,reason:'Synthetic original terminal fact'})),
      rawCounts:inspected.snapshot.processing.rawBalances.filter((r:any)=>r.warehouseCode===warehouse&&Number(r.remainingQuantity)>0)
        .map((r:any)=>({rawSegmentId:r.rawSegmentId,quantity:Number(r.remainingQuantity),evidenceFileId:file,reason:'Synthetic separate physical raw count'}))}};
  }
  async function postConversion(input:any){
    const response=await conversionApi(1).send(input);if(response.status!==201)throw new Error('Owned conversion create failed: '+JSON.stringify(response.body));const d=response.body;
    const frozen=(await conversionApi(1,`/${d.id}/ready`).send({version:0,submitKey:randomUUID()}).expect(201)).body;
    await conversionApi(2,`/${d.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash}).expect(201);
    return (await conversionApi(1,`/${d.id}/post`).send({submitKey:frozen.submit_key,contentHash:frozen.content_hash}).expect(201)).body;
  }
  async function processingDomain(product='PRD-EGG-RAW',warehouse='WH-A2'){
    const id=randomUUID();await db.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
      flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,'COMP-A','HOUSE-A2',1,'2026-11-18','DRAFT',$2,'FLOCK-A2','PROFILE-A2',repeat('b',64),'{}','fixture')`,[id,warehouse]);
    await db.query("INSERT INTO production_inventory_domains VALUES($1,'COMP-A',$2,$3)",[id,warehouse,product]);
    await db.query("UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now() WHERE id=$1",[id]);return id;
  }
  async function alternateProcessing(){
    await db.query(`INSERT INTO packaging_specs(spec_code,status,base_unit,display_unit,qty_per_unit) VALUES('ALT-LOOSE','ACTIVE','枚','枚',1) ON CONFLICT DO NOTHING;
      INSERT INTO mst_products(product_code,status,unit,unit_zh,variety_code) VALUES('PRD-EGG-ALT','ACTIVE','枚','枚','EGG_RED') ON CONFLICT DO NOTHING;
      INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,status,variety_code) VALUES('SKU-ALT','PRD-EGG-ALT','GRADE_1','ALT-LOOSE','ACTIVE','EGG_RED') ON CONFLICT DO NOTHING;
      INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code,sale_enabled,stock_enabled) SELECT 'SKU-ALT','COMPANY','COMP-A',true,true
        WHERE NOT EXISTS(SELECT 1 FROM md_sku_org_scope WHERE sku_code='SKU-ALT' AND scope_type='COMPANY' AND scope_code='COMP-A');`);
    await processingDomain('PRD-EGG-ALT','WH-A');
  }
  async function secondRaw(product='PRD-STD'){
    const scopeId=await processingDomain(product,'WH-A');
    await db.query(`INSERT INTO brd_flocks(flock_no,house_code,farm_code,breed_code,status,placement_date,start_date,company_code,site_code)
        VALUES('FLOCK-A2','HOUSE-A2','FARM-A','TEST_RED','LAYING','2026-01-01','2026-01-01','COMP-A','SITE-A') ON CONFLICT DO NOTHING;
      INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,business_date,payload,status,created_by)
        VALUES('HTTP-BASELINE-A2','HTTP-SYNTHETIC-A2',repeat('b',64),'BASELINE','COMP-A','FARM-A','HOUSE-A2','2026-11-17','{}','POSTED','fixture');
      INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,capacity_snapshot,opened_document_id)
        VALUES('HTTP-OCC-A2','FLOCK-A2','HOUSE-A2','COMP-A','FARM-A','SITE-A','2026-11-17',5000,'HTTP-BASELINE-A2');
      INSERT INTO brd_flock_events(id,document_id,line_no,flock_no,occupancy_id,company_code,farm_code,site_code,house_code,business_date,kind,quantity_delta,actor,approved_by)
        VALUES('HTTP-BASELINE-EVENT-A2','HTTP-BASELINE-A2',1,'FLOCK-A2','HTTP-OCC-A2','COMP-A','FARM-A','SITE-A','HOUSE-A2','2026-11-17','BASELINE',1000,'fixture','fixture-reviewer');
      INSERT INTO brd_flock_balances(flock_no,company_code,farm_code,site_code,house_code,quantity,baseline_on,last_business_date)
        VALUES('FLOCK-A2','COMP-A','FARM-A','SITE-A','HOUSE-A2',1000,'2026-11-17','2026-11-17');
      INSERT INTO brd_flock_daily_balances VALUES('FLOCK-A2','2026-11-17',0,1000,0,0);
      INSERT INTO brd_flock_house_states(house_code,state,document_id,last_occupied_on) VALUES('HOUSE-A2','OCCUPIED','HTTP-BASELINE-A2','2026-11-17');
      INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id,company_code,farm_code,site_code)
        VALUES('HOUSE-A2','FLOCK-A2','2026-11-18','DAILY','{"GRADE_0":0,"GRADE_1":50,"GRADE_2":0,"GRADE_3":0,"GRADE_4":0,"GRADE_5":0,"DIRTY":0,"BROKEN":0}','HTTP-OCC-A2','COMP-A','FARM-A','SITE-A');
      INSERT INTO pkg_work_shifts VALUES(2,'FARM-A','2026-11-18',false);
      INSERT INTO pkg_source_batches(id,house_code,flock_code,received_qty,production_date,lay_date,is_test,batch_code,source_inbound_no,shift_id,total_qty,batch_status)
        VALUES(2,'HOUSE-A2','FLOCK-A2',50,'2026-11-18','2026-11-18',false,'SYNTHETIC-HTTP-RAW-A2','SYNTHETIC-HTTP-RAW-A2',2,50,'RECEIVED');`);
    const file=(await upload(1,'HOUSE-A2').expect(201)).body.fileId,[report]=await db.query("SELECT id FROM brd_daily_logs WHERE house_code='HOUSE-A2'");
    const handover=(await api(1,'post','/handovers').send({companyCode:'COMP-A',houseCode:'HOUSE-A2',eggDate:day,warehouseCode:'WH-A',handoverRef:randomUUID(),rawCollectionSourceId:'2',
      segments:[{dailyLogId:report.id,gradeCode:'GRADE_1',quantity:50,evidenceFileId:file}]}).expect(201)).body;
    await api(3,'post',`/handovers/${handover.id}/confirm`).send({version:handover.version,contentHash:handover.content_hash}).expect(201);
    const raw=(await rawApi(1).send({companyCode:'COMP-A',houseCode:'HOUSE-A2',productionDate:day,warehouseCode:'WH-A',sourceBatchId:'2',handoverId:handover.id,intentKey:randomUUID()}).expect(201)).body;
    const frozen=(await rawApi(1,`/${raw.id}/ready`).send({version:0,submitKey:randomUUID()}).expect(201)).body;
    await rawApi(2,`/${raw.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash}).expect(201);
    await rawApi(1,`/${raw.id}/post`).send({submitKey:frozen.submit_key,contentHash:frozen.content_hash}).expect(201);
    return {scopeId,rawId:raw.id,segmentId:(await db.query('SELECT id FROM production_raw_receipt_segments WHERE receipt_id=$1',[raw.id]))[0].id};
  }
  it('cutover excludes actual unrelated STANDARD RAW and its WIP in the same warehouse',async()=>{
    const base=await conversionDraft(),other=await secondRaw();
    const converted=await postConversion({...base,intentKey:randomUUID(),physicalGroupRef:randomUUID(),productCode:'PRD-STD',
      inputs:[{rawSegmentId:other.segmentId,quantity:20}],outputs:[{...base.outputs[0],skuCode:'SKU-STD',quantity:20}]});
    const {inspected,payload}=await processingCount();expect(inspected.snapshot.warnings).toEqual([]);
    expect(inspected.snapshot.processing.rawBalances.map((r:any)=>r.rawSegmentId)).toEqual([base.inputs[0].rawSegmentId]);
    expect(inspected.snapshot.batches.map((b:any)=>b.batch_no)).not.toContain(converted.batches[0].batchNo);
    const d=(await cutoverApi(1).send(payload).expect(201)).body;await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201);
  });
  it('cutover includes another same-variety house RAW and stops new signatures after that source scope pauses',async()=>{
    await conversionDraft();await db.query("UPDATE md_egg_source_profiles SET product_mode='VARIANT',variety_code='EGG_RED' WHERE profile_code='PROFILE-A2'");
    const other=await secondRaw('PRD-EGG-RAW'),{inspected,payload}=await processingCount();
    expect(inspected.snapshot.processing.rawBalances).toHaveLength(2);expect(inspected.snapshot.cutovers.map((r:any)=>r.id)).toContain(other.scopeId);
    const d=(await cutoverApi(1).send(payload).expect(201)).body,frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED' WHERE id=$1",[other.scopeId]);
    const file=(await cutoverUpload(2).expect(201)).body.fileId;
    await cutoverApi(2,`/${d.id}/sign`).send({role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:file,reason:'Synthetic paused related source must stop'}).expect(409);
    expect(await db.query('SELECT 1 FROM production_cutover_signatures WHERE manifest_id=$1',[d.id])).toHaveLength(0);
  });
  it('cutover finds another same-variety product pending conversion through its persisted raw request before actual inputs exist',async()=>{
    const base=await conversionDraft('abcdef00-0000-4000-a000-000000000001');await alternateProcessing();
    const pending=(await conversionApi(1).send({...base,productCode:'PRD-EGG-ALT',inputs:[{...base.inputs[0],quantity:10}],
      outputs:[{...base.outputs[0],skuCode:'SKU-ALT',quantity:10}]}).expect(201)).body;
    const original=base.inputs[0].rawSegmentId.toUpperCase();
    await db.query(`UPDATE production_conversion_documents SET payload=jsonb_set(payload,'{request,inputs,0,rawSegmentId}',to_jsonb($2::text)),version=version+1 WHERE id=$1`,[pending.id,original]);
    expect((await processingCount()).inspected.snapshot.processing.documents.map((r:any)=>r.id)).toContain(pending.id);
    const ready=(await conversionApi(1,`/${pending.id}/ready`).send({version:1,submitKey:randomUUID()}).expect(201)).body;
    await conversionApi(2,`/${pending.id}/approve`).send({version:ready.version,contentHash:ready.content_hash}).expect(201);
    const {inspected,payload}=await processingCount();expect(inspected.snapshot.processing.documents.map((r:any)=>r.id)).toContain(pending.id);
    const d=(await cutoverApi(1).send(payload).expect(201)).body;await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(409);
  });
  it('cutover refuses a second signature after another same-variety product consumes the counted RAW',async()=>{
    const base=await conversionDraft();await alternateProcessing();const {payload}=await processingCount(),d=(await cutoverApi(1).send(payload).expect(201)).body;
    const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
    const businessFile=(await cutoverUpload(2).expect(201)).body.fileId;
    await cutoverApi(2,`/${d.id}/sign`).send({role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:businessFile,reason:'Synthetic first source count'}).expect(201);
    await postConversion({...base,intentKey:randomUUID(),physicalGroupRef:randomUUID(),productCode:'PRD-EGG-ALT',inputs:[{...base.inputs[0],quantity:10}],
      outputs:[{...base.outputs[0],skuCode:'SKU-ALT',quantity:10}]});
    const financeFile=(await cutoverUpload(11).expect(201)).body.fileId;
    await cutoverApi(11,`/${d.id}/sign`).send({role:'FINANCE',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:financeFile,reason:'Synthetic stale count must stop'}).expect(409);
    expect((await db.query('SELECT count(*)::int AS n FROM production_cutover_signatures WHERE manifest_id=$1',[d.id]))[0].n).toBe(1);
  });
  it('cutover blocks a new empty domain member while a signature holds the product evidence boundary',async()=>{
    const proof=(await cutoverUpload(1).expect(201)).body.fileId,d=(await cutoverApi(1).send(emptyCount(proof)).expect(201)).body;
    const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body,file=(await cutoverUpload(2).expect(201)).body.fileId;
    const service=app.get(ProductionCutoverService) as any,original=service.proofs.bind(service);let attempted=false;
    service.proofs=async(...args:any[])=>{if(!attempted){attempted=true;await expect(db.query(`INSERT INTO production_inventory_domain_states(id,company_code,warehouse_code,product_code,state,version,created_by)
      VALUES($1,'COMP-A','WH-A','PRD-EGG-RAW','DRAFT',0,'fixture')`,[randomUUID()])).rejects.toThrow('OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY');}return original(...args);};
    try{await cutoverApi(2,`/${d.id}/sign`).send({role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:file,reason:'Synthetic empty domain concurrency'}).expect(201);}finally{service.proofs=original;}
    expect(attempted).toBe(true);expect((await db.query('SELECT count(*)::int AS n FROM production_inventory_domain_states'))[0].n).toBe(0);
  });
  it('cutover keeps unrelated product domain membership outside its frozen signature boundary',async()=>{
    const other=randomUUID();await db.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,
      flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by) VALUES($1,'COMP-A','HOUSE-A2',1,'2026-11-18','DRAFT','WH-A','FLOCK-A2','PROFILE-A2',repeat('b',64),'{}','fixture')`,[other]);
    const proof=(await cutoverUpload(1).expect(201)).body.fileId,d=(await cutoverApi(1).send(emptyCount(proof)).expect(201)).body;
    const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body,file=(await cutoverUpload(2).expect(201)).body.fileId;
    const service=app.get(ProductionCutoverService) as any,original=service.proofs.bind(service);let attempted=false;
    service.proofs=async(...args:any[])=>{if(!attempted){attempted=true;await db.query(`INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code)
      VALUES($1,'COMP-A','WH-A','PRD-STD')`,[other]);}return original(...args);};
    try{await cutoverApi(2,`/${d.id}/sign`).send({role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:file,reason:'Synthetic independent product remains open'}).expect(201);}finally{service.proofs=original;}
    expect(attempted).toBe(true);expect((await cutoverApi(1,`/${d.id}`,'get').expect(200)).body.snapshot.domains.every((r:any)=>r.product_code==='PRD-EGG-RAW')).toBe(true);
  });
  it('cutover prevents a new SKU member after the signature reread and retains the original measured snapshot',async()=>{
    const proof=(await cutoverUpload(1).expect(201)).body.fileId,d=(await cutoverApi(1).send(emptyCount(proof)).expect(201)).body;
    const frozen=(await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201)).body,file=(await cutoverUpload(2).expect(201)).body.fileId;
    const service=app.get(ProductionCutoverService) as any,original=service.proofs.bind(service);let attempted=false;
    service.proofs=async(...args:any[])=>{if(!attempted){attempted=true;await expect(db.query(`INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,status,variety_code)
      VALUES('SYNTHETIC-CONCURRENT-SKU','PRD-EGG-RAW','GRADE_1','LOOSE','ACTIVE','EGG_RED')`)).rejects.toThrow('OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY');}return original(...args);};
    try{await cutoverApi(2,`/${d.id}/sign`).send({role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:file,reason:'Synthetic product membership remains frozen'}).expect(201);}finally{service.proofs=original;}
    expect(attempted).toBe(true);expect(await db.query("SELECT 1 FROM product_skus WHERE sku_code='SYNTHETIC-CONCURRENT-SKU'")).toHaveLength(0);
  });
  it('evidence barriers reverse empty OFF state but refuse old isolation snapshots and any frozen v2 manifest',async()=>{
    const q=db.createQueryRunner();await q.connect();const migration=new ProductionCutoverEvidenceBarriers1795025712607();
    try{
      await migration.down(q);await migration.up(q);
      await q.startTransaction('REPEATABLE READ');await q.query('SELECT count(*) FROM production_cutover_manifests');
      await expect(migration.down(q)).rejects.toThrow('OFFICIAL_MIGRATION_ISOLATION_HOLD');await q.rollbackTransaction();
      const file=(await cutoverUpload(1).expect(201)).body.fileId,d=(await cutoverApi(1).send(emptyCount(file)).expect(201)).body;
      await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201);
      await expect(migration.down(q)).rejects.toThrow('CUTOVER_V2_SNAPSHOT_FACTS_HOLD');
      expect((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='trg_cutover_evidence_barrier' AND tgrelid IN(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema())"))[0].n).toBe(7);
    }finally{if(q.isTransactionActive)await q.rollbackTransaction();await q.release();}
  });
  it('conversion canonicalizes UUID case before source deduplication',async()=>{
    const base=await conversionDraft('abcdef00-0000-4000-a000-000000000001');
    await conversionApi(1).send({...base,inputs:[{...base.inputs[0],quantity:50},{rawSegmentId:base.inputs[0].rawSegmentId.toUpperCase(),quantity:50}]}).expect(400);
    expect(await db.query('SELECT 1 FROM production_conversion_documents')).toHaveLength(0);
  });
  it('cutover refuses a zero count whose declared product has no actual master record',async()=>{
    const file=(await cutoverUpload(1).expect(201)).body.fileId,p={...emptyCount(file),boundary:{...cutoverBoundary(),productCodes:['MISSING-PRODUCT']},
      physicalTotals:[{productCode:'MISSING-PRODUCT',quantity:0}]};
    expect((await cutoverApi(1,'/inspect').send(p.boundary).expect(201)).body.snapshot.warnings).toContain('PRODUCT_MASTER_IDENTITY_UNRESOLVED');
    const d=(await cutoverApi(1).send(p).expect(201)).body;await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(409);
  });
  it('cutover exposes real damaged WIP children and requires the actual discrepancy to finish instead of accepting TEST',async()=>{
    const base=await conversionDraft(),posted=await postConversion(base);await processingDomain();let transfer='';
    await asInventoryActor(1,async cls=>{
      const wms=new WmsService(db.manager,cls),created=await wms.createTransfer({from_warehouse:'WH-A',to_warehouse:'WH-A2',items:[{batch_no:posted.batches[0].batchNo,qty:20}]},{username:'maker'});
      transfer=created.transfer_no;await wms.dispatchTransfer(transfer,{username:'maker'});
      await wms.receiveTransfer(transfer,{items:[{batch_no:posted.batches[0].batchNo,received_qty:15,damaged_qty:5}]},{username:'maker'});
    });
    const {inspected,payload}=await processingCount('WH-A2','HOUSE-A2'),[line]=await db.query('SELECT * FROM wms_transfer_items WHERE transfer_no=$1',[transfer]);
    expect(line.damaged_batch_no).toBeTruthy();expect(inspected.snapshot.batches.map((b:any)=>b.batch_no)).toContain(line.damaged_batch_no);
    const masked={...payload,referenceDecisions:payload.referenceDecisions.map((r:any)=>r.table.startsWith('wms_transfer')?{...r,classification:'TEST'}:r)};
    const fake=(await cutoverApi(1).send(masked).expect(201)).body;await cutoverApi(1,`/${fake.id}/freeze`).send({version:0}).expect(409);
    const pending=(await cutoverApi(1).send({...payload,intentKey:randomUUID()}).expect(201)).body;await cutoverApi(1,`/${pending.id}/freeze`).send({version:0}).expect(409);
    const [difference]=await db.query('SELECT id FROM wms_transfer_discrepancies WHERE transfer_no=$1',[transfer]);
    await asInventoryActor(1,cls=>new WmsService(db.manager,cls).completeTransfer(transfer,{resolutions:[{id:difference.id,resolution_type:'ADJUSTMENT',resolution_ref:'SYNTHETIC-RETAINED-DAMAGE-CUSTODY'}]},{username:'maker'}));
    const final=await processingCount('WH-A2','HOUSE-A2'),valid=(await cutoverApi(1).send(final.payload).expect(201)).body;
    await cutoverApi(1,`/${valid.id}/freeze`).send({version:0}).expect(201);
    await cutoverApi(7,`/${valid.id}`,'get').expect(409);await cutoverApi(7).send(final.payload).expect(409);
  });
  it('cutover supports real STANDARD RAW with explicitly null variety and keeps its physical count outside stock',async()=>{
    await db.query("UPDATE md_egg_source_profiles SET product_mode='STANDARD',variety_code=NULL WHERE profile_code='PROFILE-A'");
    await conversionDraft();const file=(await cutoverUpload(1).expect(201)).body.fileId,boundary={...cutoverBoundary(),productCodes:['PRD-STD']};
    const e=(await cutoverApi(1,'/inspect').send(boundary).expect(201)).body;expect(e.snapshot.warnings).toEqual([]);
    expect(e.snapshot.processing.rawBalances).toHaveLength(1);const balance=e.snapshot.processing.rawBalances[0];
    const payload={...emptyCount(file),boundary,physicalTotals:[{productCode:'PRD-STD',quantity:0}],
      rawCounts:[{rawSegmentId:balance.rawSegmentId,quantity:100,evidenceFileId:file,reason:'Synthetic explicit STANDARD raw count'}],
      referenceDecisions:e.references.map((r:any)=>({table:r.table,rowSha256:r.rowSha256,classification:'RESOLVED',evidenceFileId:file,reason:'Synthetic original completed STANDARD receipt'}))};
    const d=(await cutoverApi(1).send(payload).expect(201)).body;await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201);
    expect((await db.query('SELECT count(*)::int AS n FROM inv_batches'))[0].n).toBe(0);
    await db.query("UPDATE md_egg_source_profiles SET product_mode='VARIANT',variety_code='EGG_RED' WHERE profile_code='PROFILE-A'");
  });
  it('cutover never returns another company profile attached to the same soft-linked house key',async()=>{
    await conversionDraft();await db.query(`INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,product_mode,variety_code,effective_date)
      VALUES('SYNTHETIC-FOREIGN-PROFILE','COMP-B','FARM-B','SITE-B','HOUSE-A','VARIANT','EGG_RED','2026-01-01')`);
    const {inspected,payload}=await processingCount();expect(JSON.stringify(inspected)).not.toContain('SYNTHETIC-FOREIGN-PROFILE');
    const d=(await cutoverApi(1).send(payload).expect(201)).body;await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201);
    expect(JSON.stringify((await cutoverApi(1,`/${d.id}`,'get').expect(200)).body)).not.toContain('SYNTHETIC-FOREIGN-PROFILE');
  });
  it('cutover original maker alone edits measured counts while another editor can freeze the saved original',async()=>{
    const file=(await cutoverUpload(1).expect(201)).body.fileId,p=emptyCount(file),d=(await cutoverApi(1).send(p).expect(201)).body;
    await cutoverApi(2,`/${d.id}`,'patch').send({...p,version:0}).expect(403);
    const edited=(await cutoverApi(1,`/${d.id}`,'patch').send({...p,version:0}).expect(200)).body;
    await cutoverApi(1,`/${d.id}`,'patch').send({...p,version:0}).expect(409);
    await cutoverApi(3,`/${d.id}/freeze`).send({version:edited.version}).expect(201);
  });
  it('cutover RAW count stays independent of zero stock opening and cannot be silently omitted or marked TEST',async()=>{
    await conversionDraft();const {inspected,payload}=await processingCount();expect(inspected.snapshot.processing.rawBalances).toHaveLength(1);
    expect(payload.rawCounts[0].quantity).toBe(100);expect(payload.physicalTotals[0].quantity).toBe(0);
    for(const rawCounts of [[],[{...payload.rawCounts[0],quantity:99}]]){
      const d=(await cutoverApi(1).send({...payload,intentKey:randomUUID(),rawCounts}).expect(201)).body;
      await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(409);
    }
    const forged=(await cutoverApi(1).send({...payload,intentKey:randomUUID(),referenceDecisions:payload.referenceDecisions.map((r:any)=>({...r,classification:'TEST'}))}).expect(201)).body;
    await cutoverApi(1,`/${forged.id}/freeze`).send({version:0}).expect(409);
    const valid=(await cutoverApi(1).send({...payload,intentKey:randomUUID()}).expect(201)).body;
    await cutoverApi(1,`/${valid.id}/freeze`).send({version:0}).expect(201);
    expect((await db.query('SELECT count(*)::int AS n FROM inv_batches'))[0].n).toBe(0);
  });
  it('cutover keeps RAW 60 after actual 40 WIP and its 40-unit reprocessing and admits both real RAW-only descendants',async()=>{
    const base=await conversionDraft(),first=await postConversion({...base,inputs:[{...base.inputs[0],quantity:40}],outputs:[{...base.outputs[0],quantity:40}]});
    await postConversion({...base,intentKey:randomUUID(),physicalGroupRef:randomUUID(),operationKind:'REPACKING',
      inputs:[{parentBatchNo:first.batches[0].batchNo,quantity:40}],outputs:[{...base.outputs[0],quantity:40,outputKind:'STOCK'}]});
    const {inspected,payload}=await processingCount();expect(inspected.snapshot.processing.documents).toHaveLength(2);
    expect(payload.rawCounts[0].quantity).toBe(60);expect(payload.physicalTotals[0].quantity).toBe(40);
    expect(inspected.snapshot.processing.rawBalances[0]).toMatchObject({receivedQuantity:'100',consumedQuantity:'40',remainingQuantity:'60'});
    const d=(await cutoverApi(1).send(payload).expect(201)).body;await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(201);
  });
  it('cutover discovers unposted physical conversions and refuses to classify their uncompleted custody as resolved',async()=>{
    const base=await conversionDraft(),d=(await conversionApi(1).send(base).expect(201)).body;
    const {inspected,payload}=await processingCount();expect(inspected.snapshot.processing.documents.map((r:any)=>r.id)).toContain(d.id);
    const count=(await cutoverApi(1).send(payload).expect(201)).body;await cutoverApi(1,`/${count.id}/freeze`).send({version:0}).expect(409);
  });
  it('cutover rechecks all local facts before READY after a source changes following the read-only capture',async()=>{
    await conversionDraft();const {payload}=await processingCount(),d=(await cutoverApi(1).send(payload).expect(201)).body;
    const original=db.transaction.bind(db);let armed=true;
    (db as any).transaction=async(...args:any[])=>{const result=await (original as any)(...args);
      if(armed&&args[0]==='REPEATABLE READ'){armed=false;await db.query("UPDATE product_skus SET status='INACTIVE' WHERE sku_code='SKU-GRADE_1'");}return result;};
    try{await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(409);}finally{db.transaction=original;}
    expect(armed).toBe(false);expect((await db.query('SELECT state FROM production_cutover_manifests WHERE id=$1',[d.id]))[0].state).toBe('DRAFT');
  });
  it('conversion actual HTTP binds uploaded warehouse proof, scoped source selection, independent approval and original receipt recovery',async()=>{
    const input=await conversionDraft(),query='?companyCode=COMP-A&warehouseCode=WH-A&productCode=PRD-EGG-RAW';
    const sources=(await conversionApi(1,'/sources'+query,'get').expect(200)).body;expect(sources.available).toBe(true);expect(sources.raw).toHaveLength(1);expect(sources.inventory).toEqual([]);
    await conversionApi(7,'/sources'+query,'get').expect(403);await conversionApi(6,'/sources'+query,'get').expect(403);
    await conversionApi(1).send({...input,capability:true}).expect(400);await conversionApi(1).send({...input,inputs:[{...input.inputs[0],quantity:1.5}]}).expect(400);
    for(const quantity of [true,'100'])await conversionApi(1).send({...input,inputs:[{...input.inputs[0],quantity}]}).expect(400);
    const skuChoices=()=>request(app.getHttpServer()).get('/api/product-master/skus?status=ACTIVE&usage=stock&company_code=COMP-A&product_code=PRD-EGG-RAW').auth(token(1),{type:'bearer'}).expect(200);
    expect((await skuChoices()).body.some((s:any)=>s.sku_code==='SKU-GRADE_1')).toBe(true);
    await db.query("UPDATE md_sku_org_scope SET stock_enabled=false WHERE sku_code='SKU-GRADE_1' AND scope_code='COMP-A'");
    expect((await skuChoices()).body.some((s:any)=>s.sku_code==='SKU-GRADE_1')).toBe(false);
    await db.query("UPDATE md_sku_org_scope SET stock_enabled=true WHERE sku_code='SKU-GRADE_1' AND scope_code='COMP-A'");
    const d=(await conversionApi(1).send(input).expect(201)).body;
    await conversionApi(4).send({...input,intentKey:randomUUID()}).expect(403);
    expect((await conversionApi(4,'/recover?companyCode=COMP-A&warehouseCode=WH-A&intentKey='+input.intentKey,'get').expect(200)).body.map((r:any)=>r.id)).toEqual([d.id]);
    await conversionApi(4,`/${d.id}/evidence/${input.outputs[0].evidenceFileId}`,'get').expect(200).expect('Content-Type',/application\/pdf/);
    await conversionApi(6,`/${d.id}`,'get').expect(403);await conversionApi(7,`/${d.id}`,'get').expect(403);
    await conversionApi(2,`/${d.id}/edit`).send({...input,version:0}).expect(403);
    await conversionApi(7,`/${d.id}/edit`).send({...input,version:0}).expect(403);
    await conversionApi(1,`/${d.id}/edit`).send({...input,physicalGroupRef:randomUUID(),version:0}).expect(409);
    const edited=(await conversionApi(1,`/${d.id}/edit`).send({...input,version:0}).expect(201)).body;
    expect(edited.version).toBe(1);await conversionApi(1,`/${d.id}/edit`).send({...input,version:0}).expect(409);
    const frozen=(await conversionApi(3,`/${d.id}/ready`).send({version:edited.version,submitKey:randomUUID()}).expect(201)).body;
    await conversionApi(1,`/${d.id}/edit`).send({...input,version:frozen.version}).expect(409);
    await conversionApi(1,`/${d.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash}).expect(403);
    await db.query("UPDATE fixture_permissions SET permission='MENU_PROD_INBOUND:V,C,E,A' WHERE role_code='MAKER' AND permission LIKE 'MENU_PROD_INBOUND:%'");
    await conversionApi(1,`/${d.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash}).expect(409);
    await db.query("UPDATE fixture_permissions SET permission='MENU_PROD_INBOUND:V,C,E' WHERE role_code='MAKER' AND permission LIKE 'MENU_PROD_INBOUND:%'");
    await conversionApi(2,`/${d.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash}).expect(201);
    await conversionApi(4,`/${d.id}/post`).send({submitKey:frozen.submit_key,contentHash:frozen.content_hash}).expect(403);
    const receipt=(await conversionApi(1,`/${d.id}/post`).send({submitKey:frozen.submit_key,contentHash:frozen.content_hash}).expect(201)).body;
    expect(receipt).toMatchObject({inputQuantity:100,outputQuantity:100,lossQuantity:0,costStatus:'PENDING_ALLOCATION'});
    const remaining=(await conversionApi(1,'/sources'+query,'get').expect(200)).body;expect(remaining.raw).toEqual([]);expect(remaining.inventory).toHaveLength(1);
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED';UPDATE product_skus SET status='INACTIVE'");
    expect((await conversionApi(4,`/${d.id}/post`).send({submitKey:frozen.submit_key,contentHash:frozen.content_hash}).expect(201)).body).toEqual(receipt);
    expect((await conversionApi(4,query,'get').expect(200)).body.map((r:any)=>r.id)).toEqual([d.id]);
  });
  it('conversion uploads reject warehouse/company confusion and unrelated finance permissions',async()=>{
    const uploadFiles=()=>existsSync(join(process.cwd(),'uploads','contracts'))?readdirSync(join(process.cwd(),'uploads','contracts')).sort():[];
    const filesBefore=uploadFiles(),parse=jest.spyOn(PDFDocument,'load');
    try{
      await conversionUpload(1,'WH-B','COMP-A').expect(400);await conversionUpload(7).expect(400);await conversionUpload(11).expect(400);
      expect(parse).not.toHaveBeenCalled();expect(uploadFiles()).toEqual(filesBefore);
    }finally{parse.mockRestore();}
    expect((await conversionUpload(1).expect(201)).body.fileId).toBeTruthy();
    const repo=db.getRepository(FileMetadataEntity),save=repo.save.bind(repo),before=new Set((await db.query('SELECT file_id FROM file_metadata')).map((r:any)=>r.file_id));
    const lost=jest.spyOn(repo,'save').mockImplementationOnce(async(entity:any)=>{await save(entity);throw new Error('Owned save acknowledgement lost after commit');});
    try{await conversionUpload(1).expect(500);}finally{lost.mockRestore();}
    const committed=(await db.query("SELECT file_id,storage_path FROM file_metadata WHERE module_code='PRODUCTION_CONVERSION'")).filter((r:any)=>!before.has(r.file_id));
    expect(committed).toHaveLength(1);expect(existsSync(committed[0].storage_path)).toBe(true);
    const unresolvedBefore=uploadFiles(),metadataCount=Number((await db.query('SELECT count(*) AS n FROM file_metadata'))[0].n);
    const pending=jest.spyOn(repo,'save').mockRejectedValueOnce(new Error('Owned unresolved persistence outcome'));
    try{await conversionUpload(1).expect(500);}finally{pending.mockRestore();}
    expect(uploadFiles().filter(file=>!unresolvedBefore.includes(file))).toHaveLength(1);
    expect(Number((await db.query('SELECT count(*) AS n FROM file_metadata'))[0].n)).toBe(metadataCount);
  });
  it('conversion evidence uses detected PDF type even when multipart supplies an opaque MIME',async()=>{
    for(const bytes of [Buffer.from('%PDF-1.7'),Buffer.from('89504e470d0a1a0a','hex'),Buffer.from('ffd8ff','hex')]){
      await request(app.getHttpServer()).post('/api/upload/contract').auth(token(1),{type:'bearer'})
        .field('moduleCode','PRODUCTION_CONVERSION').field('ownerType','WAREHOUSE').field('ownerId','WH-A').field('companyCode','COMP-A')
        .attach('file',bytes,{filename:'damaged.pdf',contentType:'application/octet-stream'}).expect(400);
    }
    const image=await sharp({create:{width:12,height:12,channels:3,background:'white'}}).png().toBuffer();
    const png=(await request(app.getHttpServer()).post('/api/upload/contract').auth(token(1),{type:'bearer'})
      .field('moduleCode','PRODUCTION_CONVERSION').field('ownerType','WAREHOUSE').field('ownerId','WH-A').field('companyCode','COMP-A')
      .attach('file',image,{filename:'measurement.png',contentType:'application/octet-stream'}).expect(201)).body;
    expect((await db.query('SELECT mime_type FROM file_metadata WHERE file_id=$1',[png.fileId]))[0].mime_type).toBe('image/png');
    const result=await request(app.getHttpServer()).post('/api/upload/contract').auth(token(1),{type:'bearer'})
      .field('moduleCode','PRODUCTION_CONVERSION').field('ownerType','WAREHOUSE').field('ownerId','WH-A').field('companyCode','COMP-A')
      .attach('file',conversionPdf,{filename:'opaque.pdf',contentType:'application/octet-stream'}).expect(201);
    expect(result.body.mimeType).toBe('application/pdf');
    const input=await conversionDraft();input.outputs[0].evidenceFileId=result.body.fileId;
    const doc=(await conversionApi(1).send(input).expect(201)).body;
    await conversionApi(4,`/${doc.id}/evidence/${result.body.fileId}`,'get').expect(200).expect('Content-Type',/application\/pdf/);
    await request(app.getHttpServer()).post('/api/upload/contract').auth(token(1),{type:'bearer'})
      .field('moduleCode','PRODUCTION_CONVERSION').field('ownerType','WAREHOUSE').field('ownerId','WH-A').field('companyCode','COMP-A')
      .attach('file',Buffer.from('<html>not a PDF</html>'),{filename:'fake.pdf',contentType:'application/pdf'}).expect(400);
  });
  it('RAW actual HTTP validates DTO, separates maker/approval, enforces company/warehouse scope and replays the original receipt with view permission',async()=>{
    const input=await signedRaw();await rawApi(1).send({...input,sourceBatchId:'0'}).expect(400);
    await rawApi(1).send({...input,sourceType:'PACKAGING'}).expect(400);
    for(const sourceBatchId of [1,true])await rawApi(1).send({...input,sourceBatchId}).expect(400);
    const d=(await rawApi(1).send(input).expect(201)).body;
    await rawApi(6,`/${d.id}`,'get').expect(403);await rawApi(7,`/${d.id}`,'get').expect(403);
    await rawApi(8,`/${d.id}/ready`).send({version:0,submitKey:randomUUID()}).expect(403);
    const frozen=(await rawApi(1,`/${d.id}/ready`).send({version:0,submitKey:randomUUID()}).expect(201)).body;
    await rawApi(1,`/${d.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash}).expect(403);
    const approved=(await rawApi(2,`/${d.id}/approve`).send({version:frozen.version,contentHash:frozen.content_hash}).expect(201)).body;
    const posting={submitKey:approved.submit_key,contentHash:approved.content_hash};
    await rawApi(4,`/${d.id}/post`).send(posting).expect(403);
    const receipt=(await rawApi(1,`/${d.id}/post`).send(posting).expect(201)).body;
    expect(receipt).toMatchObject({documentId:d.id,quantity:100,inventoryCreated:false});
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED';UPDATE md_egg_source_profiles SET status='INACTIVE'");
    expect((await rawApi(4,`/${d.id}/post`).send(posting).expect(201)).body).toEqual(receipt);
    expect((await rawApi(4,`/${d.id}`,'get').expect(200)).body.segments).toHaveLength(1);
    expect((await db.query('SELECT count(*)::int AS n FROM inv_batches'))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM inv_ledger'))[0].n).toBe(0);
  });
  it('lets a B-only maker freeze twenty received units with zero new opening, protects A private facts and revalidates each new signer',async()=>{
    const {root,child}=await crossCompanyReceipt(),{payload,inspected}=await companyBCount();
    expect(inspected.snapshot.batches.map((b:any)=>b.batch_no)).toEqual([child]);
    expect(child).toMatch(/^XFR-[a-f0-9]{32}$/);expect(JSON.stringify(inspected)).not.toContain(root);
    expect(JSON.stringify(inspected)).not.toContain('HOUSE-A');expect(JSON.stringify(inspected)).not.toContain('source_snapshot');
    expect(inspected.snapshot.qualification[0]).not.toHaveProperty('evidence_sha256');
    const d=(await cutoverApi(6,'').send(payload).expect(201)).body;
    const frozen=(await cutoverApi(6,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
    expect(frozen.payload.openingLines).toEqual([]);expect(frozen.payload.physicalTotals).toEqual([{productCode:'PRD-EGG-RAW',quantity:20}]);
    const file=(await cutoverUpload(16,'WH-B','COMP-B').expect(201)).body.fileId;
    const signature={role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:file,reason:'Synthetic B-only independent confirmation'};
    await cutoverApi(16,`/${d.id}/sign`).send(signature).expect(201);
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");
    await cutoverApi(16,`/${d.id}/sign`).send({...signature,role:'FINANCE'}).expect(409);
    await db.query("UPDATE production_cutover_scopes SET state='ACTIVE'");
    await expect(db.query("UPDATE wms_transfer_items SET received_qty=19 WHERE transfer_no='SYNTHETIC-B-RECEIPT'"))
      .rejects.toThrow('OFFICIAL_CONVERSION_BUSINESS_BINDING_IMMUTABLE');
    expect((await db.query("SELECT received_qty FROM wms_transfer_items WHERE transfer_no='SYNTHETIC-B-RECEIPT'"))[0].received_qty).toBe('20.000');
    const order=async(id:number,qty:number)=>{
      const quantity=await db.transaction(m=>resolveQuantity(m,{qty,skuCode:'SKU-GRADE_1',quantityBasis:'BASE'}));
      await db.query(`INSERT INTO sal_sales_orders(id,order_no,status,company_code,fulfillment_warehouse_code)
        VALUES($1,$2,'APPROVED','COMP-A','WH-A')`,[id,`SYNTHETIC-A-ORDER-${id}`]);
      await db.query(`INSERT INTO sal_order_items(id,sales_order_id,product_code,grade_code,sku_code,qty,amount,quantity_snapshot)
        VALUES($1,$1,'PRD-EGG-RAW','GRADE_1','SKU-GRADE_1',$2::numeric,$2::numeric*2,$3)`,[id,qty,JSON.stringify(quantity)]);return quantity;
    };
    await order(987,75);
    await asInventoryActor(1,()=>app.get(EggInventoryService).reserveInventory('987','SYNTHETIC-A-ORDER-987','COMP-A',undefined,'WH-A'));
    const next=await signedDraft();await api(1,'post',`/${next.ready.id}/post`).send({submitKey:next.ready.submit_key,contentHash:next.ready.content_hash}).expect(201);
    const quantity=await order(988,10);
    await asInventoryActor(1,async cls=>{
      const inventory=app.get(EggInventoryService);await inventory.reserveInventory('988','SYNTHETIC-A-ORDER-988','COMP-A',undefined,'WH-A');
      await db.query(`INSERT INTO sal_delivery_orders(id,delivery_no,status,company_code,fulfillment_warehouse_code)
          VALUES(988,'SYNTHETIC-A-MIXED-SALE','PLANNED','COMP-A','WH-A');
        INSERT INTO sal_delivery_order_items(id,delivery_order_id,sales_order_id,planned_qty,sales_order_no,status)
          VALUES(988,988,988,10,'SYNTHETIC-A-ORDER-988','PENDING');UPDATE sal_sales_orders SET status='ALLOCATED' WHERE id=988`);
      const deliveries=new DeliveryOrdersService(db,cls,inventory,new SalesOrderLifecycleService(db));
      await deliveries.startLoading('988',{});await deliveries.finishLoading('988',{});
      expect((await db.query('SELECT outbound_qty::text FROM sal_order_item_batch_allocations WHERE sales_order_item_id=988 ORDER BY id')).map((a:any)=>a.outbound_qty)).toEqual(['5','5']);
      await db.query(`INSERT INTO sal_return_items(id,return_order_id,sales_order_item_id,restock_status,product_code,grade_code,sku_code,accepted_qty,damaged_qty,quantity_snapshot)
        VALUES(988,988,988,'PENDING','PRD-EGG-RAW','GRADE_1','SKU-GRADE_1',10,0,$1)`,[JSON.stringify(quantity)]);
      await inventory.processReturnInventory('988','SYNTHETIC-A-MIXED-RETURN','COMP-A','WH-A','ZONE-A','LOC-A',day);
    });
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_roots WHERE batch_no=$1',['RET-SYNTHETIC-A-MIXED-RETURN-988']))[0].n).toBe(2);
    const after=(await cutoverApi(6,'/inspect').send(companyBBoundary()).expect(201)).body;
    expect(after.snapshotSha256).toBe(inspected.snapshotSha256);
    await cutoverApi(16,`/${d.id}/sign`).send({...signature,role:'FINANCE'}).expect(201);
    const original=(await cutoverApi(6,`/${d.id}`,'get').expect(200)).body;
    expect(original.state).toBe('APPROVED');expect(original.activationAuthorized).toBe(false);expect(JSON.stringify(original)).not.toContain(root);
    expect((await db.query("SELECT count(*)::int AS n FROM production_cutover_scopes WHERE company_code='COMP-B'"))[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM production_opening_receipts'))[0].n).toBe(0);
    // Owned historical-shape fixture: an old receiving ID embedded the sender's batch ID. No alias is invented for it.
    const legacy=`${root}-T-OLD`;
    await db.transaction(async m=>{
      await m.query("SET LOCAL session_replication_role='replica'");
      for(const table of ['inv_batches','inv_ledger','production_batch_qualifications','production_batch_roots','inv_flock_source_links'])
        await m.query(`UPDATE ${table} SET batch_no=$2 WHERE batch_no=$1`,[child,legacy]);
      await m.query('UPDATE wms_transfer_items SET target_batch_no=$2 WHERE target_batch_no=$1',[child,legacy]);
      await m.query("SET LOCAL session_replication_role='origin'");
    });
    const held=await cutoverApi(6,'/inspect').send(companyBBoundary()).expect(409);expect(JSON.stringify(held.body)).not.toContain(root);
  });
  it('holds new signatures when the first foreign receipt arrives after an empty freeze even if its proof signer is unavailable',async()=>{
    const file=(await cutoverUpload(6,'WH-B','COMP-B').expect(201)).body.fileId;
    const d=(await cutoverApi(6,'').send({...emptyCount(file),boundary:companyBBoundary()}).expect(201)).body;
    const frozen=(await cutoverApi(6,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
    expect(frozen.snapshot.crossCompanyProofs).toEqual([]);await crossCompanyReceipt();
    const signFile=(await cutoverUpload(16,'WH-B','COMP-B').expect(201)).body.fileId;
    const signature={role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:signFile,reason:'Synthetic stale empty boundary'};
    const signer=app.get(CUTOVER_PROVENANCE_SIGNER);signer.key='';
    try{await cutoverApi(16,`/${d.id}/sign`).send(signature).expect(409);}
    finally{signer.key='SYNTHETIC-OWNED-CUTOVER-TRANSFER-PROOF-KEY';}
    await cutoverApi(16,`/${d.id}/sign`).send(signature).expect(409);
    expect((await db.query('SELECT count(*)::int AS n FROM production_cutover_signatures WHERE manifest_id=$1',[d.id]))[0].n).toBe(0);
  });
  it('rechecks the received source under locks before READY if it is paused after the read-only capture',async()=>{
    await crossCompanyReceipt();const {payload}=await companyBCount();
    const d=(await cutoverApi(6,'').send(payload).expect(201)).body;
    const original=db.transaction.bind(db);let armed=true;
    (db as any).transaction=async(...args:any[])=>{
      const result=await (original as any)(...args);
      if(armed&&args[0]==='REPEATABLE READ'){armed=false;await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED'");}
      return result;
    };
    try{await cutoverApi(6,`/${d.id}/freeze`).send({version:0}).expect(409);}
    finally{db.transaction=original;await db.query("UPDATE production_cutover_scopes SET state='ACTIVE'");}
    expect(armed).toBe(false);
    expect((await db.query('SELECT state,version FROM production_cutover_manifests WHERE id=$1',[d.id]))[0]).toEqual({state:'DRAFT',version:0});
  });
  it('keeps a first foreign receipt out until the final signature commits, including an empty receiving boundary',async()=>{
    const {ready}=await signedDraft(),posted=(await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body;
    const file=(await cutoverUpload(6,'WH-B','COMP-B').expect(201)).body.fileId;
    const d=(await cutoverApi(6,'').send({...emptyCount(file),boundary:companyBBoundary()}).expect(201)).body;
    const frozen=(await cutoverApi(6,`/${d.id}/freeze`).send({version:0}).expect(201)).body;
    const signFile=(await cutoverUpload(16,'WH-B','COMP-B').expect(201)).body.fileId;
    const signature={role:'BUSINESS',contentHash:frozen.content_hash,snapshotSha256:frozen.snapshot_sha256,evidenceFileId:signFile,reason:'Synthetic concurrent receipt boundary'};
    await cutoverApi(16,`/${d.id}/sign`).send(signature).expect(201);
    const transfer=()=>asInventoryActor(15,async cls=>new WmsService(db.manager,cls).confirmTransfer({transfer_no:'SYNTHETIC-CONCURRENT-FIRST-RECEIPT',
      from_warehouse:'WH-A',to_warehouse:'WH-B',items:[{batch_no:posted.batches[0].batchNo,qty:20}]},{username:'cross_company_operator'}));
    const service=app.get(ProductionCutoverService) as any,original=service.proofs.bind(service);let attempted=false;
    service.proofs=async(...args:any[])=>{
      const facts=await original(...args);
      if(!attempted){attempted=true;await expect(transfer()).rejects.toThrow('OFFICIAL_INVENTORY_PRODUCT_BUSY');
        expect((await db.query("SELECT count(*)::int AS n FROM inv_batches WHERE warehouse_code='WH-B'"))[0].n).toBe(0);
        expect(Number((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[posted.batches[0].batchNo]))[0].qty)).toBe(100);}
      return facts;
    };
    try{await cutoverApi(16,`/${d.id}/sign`).send({...signature,role:'FINANCE'}).expect(201);}
    finally{service.proofs=original;}
    expect(attempted).toBe(true);expect((await cutoverApi(6,`/${d.id}`,'get').expect(200)).body.state).toBe('APPROVED');
    await transfer();expect(Number((await db.query("SELECT qty FROM inv_batches WHERE warehouse_code='WH-B'"))[0].qty)).toBe(20);
    expect((await cutoverApi(6,`/${d.id}`,'get').expect(200)).body.snapshot.crossCompanyProofs).toEqual([]);
  });
  it('holds a missing physical source before a B-only caller can read its retained foreign lineage',async()=>{
    const {root}=await crossCompanyReceipt();
    await db.transaction(async m=>{await m.query("SET LOCAL session_replication_role='replica'");await m.query('DELETE FROM inv_batches WHERE batch_no=$1',[root]);});
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_qualifications WHERE batch_no=$1',[root]))[0].n).toBe(1);
    const held=await cutoverApi(6,'/inspect').send(companyBBoundary()).expect(409);
    expect(JSON.stringify(held.body)).not.toContain(root);expect(JSON.stringify(held.body)).not.toContain('HOUSE-A');
    const file=(await cutoverUpload(6,'WH-B','COMP-B').expect(201)).body.fileId;
    const rejected=await cutoverApi(6,'').send({...emptyCount(file),boundary:companyBBoundary()}).expect(409);
    expect(JSON.stringify(rejected.body)).not.toContain(root);
  });
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
    for(const quantity of [true,'0'])await cutoverApi(1,'').send({...p,physicalTotals:[{productCode:'PRD-EGG-RAW',quantity}]}).expect(400);
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
      INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,reserved_qty,outbound_qty,released_qty) VALUES(3,2,'SYNTHETIC-LEGACY-COUNT',10,0,10);
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
  it('rejects stale inventory after a consistent read-only capture if a sale commits before locked freeze',async()=>{
    const file=(await cutoverUpload(1,'WH-A2').expect(201)).body.fileId,p=await legacyCountStock(file,100);
    await db.query("INSERT INTO inv_ledger(batch_no,qty_change,change_type,ref_no) VALUES('SYNTHETIC-LEGACY-COUNT',100,'PURCHASE_INBOUND','SYNTHETIC-OLD-COUNT')");
    const d=(await cutoverApi(1,'').send(p).expect(201)).body;
    const original=db.createQueryRunner.bind(db);let committed=false;
    const spy=jest.spyOn(db,'createQueryRunner').mockImplementation((...args:any[])=>{
      const q=original(...args as []),query=q.query.bind(q);
      q.query=(async(sql:string,...parameters:any[])=>{const result=await (query as any)(sql,...parameters);
        if(!committed&&q.isTransactionActive&&sql.includes(' AS fact FROM inv_batches b')){
          committed=true;await db.transaction(async m=>{
            await m.query("UPDATE inv_batches SET qty=60,qty_available=60 WHERE batch_no='SYNTHETIC-LEGACY-COUNT'");
            await m.query("INSERT INTO inv_ledger(batch_no,qty_change,change_type,ref_no) VALUES('SYNTHETIC-LEGACY-COUNT',-40,'FIFO_OUT','SYNTHETIC-CONCURRENT-SALE')");
          });
        }return result;}) as any;return q;
    });
    try{
      await cutoverApi(1,`/${d.id}/freeze`).send({version:0}).expect(409);
      expect(committed).toBe(true);expect((await db.query('SELECT state,version FROM production_cutover_manifests WHERE id=$1',[d.id]))[0]).toEqual({state:'DRAFT',version:0});
      expect((await db.query("SELECT qty FROM inv_batches WHERE batch_no='SYNTHETIC-LEGACY-COUNT'"))[0].qty).toBe('60');
    }finally{spy.mockRestore();}
  });
  const groupApi=(id:number,query='')=>request(app.getHttpServer()).get('/api/v2/analytics/group'+query).auth(token(id),{type:'bearer'});
  async function asInventoryActor<T>(id:number,work:(cls:ClsService)=>Promise<T>):Promise<T>{
    const [user]=await db.query('SELECT * FROM sys_user WHERE user_id=$1 AND status=1',[id]);
    const cls=app.get(ClsService);
    return cls.run(async()=>{
      cls.set('user',{userId:String(id),username:user.username,roles:[user.role_code]});
      cls.set('dataScope',await scopes.resolve(String(id),[user.role_code],'MENU_PROD_INBOUND'));
      return work(cls);
    });
  }
  async function managedSalesOrder(){
    const {ready}=await signedDraft();const posted=(await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body;
    const quantity=await db.transaction(m=>resolveQuantity(m,{qty:40,skuCode:'SKU-GRADE_1',quantityBasis:'BASE'}));
    await db.query(`INSERT INTO sal_sales_orders(id,order_no,status,company_code,currency_code,total_amount,fulfillment_warehouse_code)
      VALUES(1,'SYNTHETIC-MANAGED-ORDER','APPROVED','COMP-A','CNY',80,'WH-A')`);
    await db.query(`INSERT INTO sal_order_items(id,sales_order_id,product_code,grade_code,sku_code,qty,amount,quantity_snapshot)
      VALUES(1,1,'PRD-EGG-RAW','GRADE_1','SKU-GRADE_1',40,80,$1)`,[JSON.stringify(quantity)]);
    return {ready,posted,quantity,inventory:app.get(EggInventoryService)};
  }
  it('quarantines an actual converted sale return against original dispatch, without reopening production or duplicating credit',async()=>{
    const draft=await conversionDraft();
    const converted=await postConversion({...draft,outputs:[{...draft.outputs[0],outputKind:'STOCK'}]});
    const parent=converted.batches[0].batchNo;
    const snapshot=await db.transaction(m=>resolveQuantity(m,{qty:40,skuCode:'SKU-GRADE_1',quantityBasis:'BASE'}));
    await db.query(`INSERT INTO sal_sales_orders(id,order_no,status,company_code,currency_code,fulfillment_warehouse_code)
      VALUES(1,'SYNTHETIC-CONVERTED-SALE','APPROVED','COMP-A','LAK','WH-A')`);
    await db.query(`INSERT INTO sal_order_items(id,sales_order_id,product_code,grade_code,sku_code,qty,amount,quantity_snapshot,unit_price)
      VALUES(1,1,'PRD-EGG-RAW','GRADE_1','SKU-GRADE_1',40,80,$1,2)`,[JSON.stringify(snapshot)]);
    await asInventoryActor(1,async cls=>{
      const inventory=app.get(EggInventoryService),lifecycle=new SalesOrderLifecycleService(db);
      expect(await inventory.reserveInventory('1','SYNTHETIC-CONVERTED-SALE','COMP-A',undefined,'WH-A')).toBe(true);
      await db.query(`INSERT INTO sal_delivery_orders(id,delivery_no,status,company_code,fulfillment_warehouse_code)
          VALUES(1,'SYNTHETIC-CONVERTED-DELIVERY','PLANNED','COMP-A','WH-A');
        INSERT INTO sal_delivery_order_items(id,delivery_order_id,sales_order_id,planned_qty,sales_order_no,status)
          VALUES(1,1,1,40,'SYNTHETIC-CONVERTED-SALE','PENDING');
        UPDATE sal_sales_orders SET status='ALLOCATED' WHERE id=1`);
      const deliveries=new DeliveryOrdersService(db,cls,inventory,lifecycle);
      await deliveries.startLoading('1',{});
      expect((await deliveries.finishLoading('1',{})).status).toBe('LOADED');
      const returnApi=(actor:number,path='')=>request(app.getHttpServer()).post('/api/v2/sales/returns'+path).auth(token(actor),{type:'bearer'});
      const original={salesOrderId:'1',deliveryOrderId:'1',companyCode:'COMP-A',returnType:'CUSTOMER_RETURN',
        items:[{salesOrderItemId:'1',productCode:'PRD-EGG-RAW',returnedQty:15,unitPrice:2}]};
      const created=(await returnApi(1).send(original).expect(201)).body;
      const id=String(created.id),item=String(created.items[0].id),batchNo=`RET-${created.return_no}-${item}`;
      const local={targetWarehouseCode:'WH-A',targetZoneCode:'ZONE-A',targetLocationCode:'LOC-A'};
      expect((await returnApi(1,`/${id}/submit`).expect(201)).body.status).toBe('INSPECTING');
      const inspection={itemId:item,acceptedQty:15,damagedQty:0};
      await returnApi(1,`/${id}/complete-inspection`).send({results:[inspection,inspection]}).expect(400);
      expect((await db.query('SELECT status,inspected_at FROM sal_return_orders WHERE id=$1',[id]))[0]).toEqual({status:'INSPECTING',inspected_at:null});
      expect((await returnApi(3,`/${id}/complete-inspection`).send({results:[inspection]}).expect(201)).body.status).toBe('RESTOCKING');
      const restock=(actor=3)=>returnApi(actor,`/${id}/complete-restock`);
      await restock(4).send(local).expect(403);
      await restock(6).send(local).expect(404);
      await restock().send({targetWarehouseCode:'WH-A2',targetZoneCode:'ZONE-A2',targetLocationCode:'LOC-A2'}).expect(409);
      await db.query("UPDATE sal_sales_orders SET currency_code='CNY' WHERE id=1");
      await restock().send(local).expect(409);
      await db.query("UPDATE sal_sales_orders SET currency_code='LAK' WHERE id=1");
      await db.query("UPDATE sal_order_item_batch_allocation_actions SET qty=39 WHERE action_type='OUTBOUND'");
      await restock().send(local).expect(409);
      await db.query("UPDATE sal_order_item_batch_allocation_actions SET qty=40 WHERE action_type='OUTBOUND'");
      const failure=jest.spyOn(app.get(FinanceCreditNoteAdapter),'createCreditNote').mockRejectedValueOnce(new Error('Owned credit posting failure'));
      try{await restock().send(local).expect(500);}finally{failure.mockRestore();}
      expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[batchNo]))).toEqual([]);
      expect((await db.query('SELECT status,restocked_at FROM sal_return_orders WHERE id=$1',[id]))[0]).toEqual({status:'RESTOCKING',restocked_at:null});
      const concurrent=await Promise.all([restock().send(local),restock().send(local)]);
      expect(concurrent.map(response=>response.status).sort()).toEqual([201,409]);
      expect(concurrent.find(response=>response.status===201)?.body.status).toBe('COMPLETED');
      const [receipt]=await db.query(`SELECT r.source_batch_no,r.quantity,b.status,b.qty::text,b.qty_available::text,b.sku_code,b.grade_code_std,
        b.egg_date::text,b.expire_date::text,b.variety_code,q.cost_status,l.change_type,l.qty_change::text,l.cost_change
        FROM production_conversion_return_receipts r JOIN inv_batches b ON b.batch_no=r.batch_no
        JOIN inv_ledger l ON l.id=r.ledger_id JOIN production_batch_qualifications q ON q.batch_no=r.batch_no WHERE r.batch_no=$1`,[batchNo]);
      expect(receipt).toMatchObject({source_batch_no:parent,quantity:15,status:'QUARANTINE',qty:'15',qty_available:'0',
        sku_code:'SKU-GRADE_1',grade_code_std:'GRADE_1',variety_code:'EGG_RED',cost_status:'UNKNOWN',change_type:'SALE_RETURN',qty_change:'15',cost_change:null});
      const trace=(await api(4,'get',`/stock-batches?companyCode=COMP-A&houseCode=HOUSE-A&eggDate=${day}&warehouseCode=WH-A&view=source&batchNo=${batchNo}`).expect(200)).body;
      expect(trace.items).toMatchObject([{batchNo,attributableQty:15,batchQty:15,availableQty:0,status:'QUARANTINE',sources:[{kind:'RAW'}]}]);
      expect((await db.query('SELECT egg_date::text,expire_date::text,qty::text FROM inv_batches WHERE batch_no=$1',[parent]))[0])
        .toEqual({egg_date:receipt.egg_date,expire_date:receipt.expire_date,qty:'60'});
      expect((await db.query('SELECT (amount_original)::text AS amount FROM fin_ar_invoices WHERE source_id=$1 AND source_type=$2',[id,'SALES_RETURN'])))
        .toEqual([{amount:'-30'}]);
      expect((await db.query('SELECT r.raw_segment_id,p.parent_batch_no FROM production_batch_raw_roots r JOIN production_batch_derivation_parents p USING(batch_no) WHERE r.batch_no=$1',[batchNo]))[0])
        .toEqual({raw_segment_id:draft.inputs[0].rawSegmentId,parent_batch_no:parent});
      expect((await db.query('SELECT count(*)::int AS n FROM production_inbound_allocations'))[0].n).toBe(0);
      await expect(db.query('UPDATE production_conversion_return_receipts SET quantity=16 WHERE return_item_id=$1',[item]))
        .rejects.toThrow('IMMUTABLE');
      await expect(db.query("DELETE FROM sal_order_item_batch_allocation_actions WHERE action_type='OUTBOUND'"))
        .rejects.toThrow('OFFICIAL_CONVERSION_RETURN_DISPATCH_IMMUTABLE');
      await returnApi(1).send({...original,items:[{...original.items[0],returnedQty:26}]}).expect(409);
      const partial=(await returnApi(1).send({...original,items:[{...original.items[0],returnedQty:6}]}).expect(201)).body;
      await returnApi(1,`/${partial.id}/submit`).expect(201);
      await returnApi(3,`/${partial.id}/complete-inspection`).send({results:[
        {itemId:String(partial.items[0].id),acceptedQty:5,damagedQty:1},
      ]}).expect(201);
      await returnApi(3,`/${partial.id}/complete-restock`).send(local).expect(409);
      expect((await db.query('SELECT count(*)::int AS n FROM production_conversion_return_receipts'))[0].n).toBe(1);

    });
  });
  it('reserves and actually dispatches approved managed stock while retaining original production receipts and unknown cost',async()=>{
    const {ready,posted,quantity,inventory}=await managedSalesOrder();
    await asInventoryActor(1,async cls=>{
      await expect(inventory.allocateByFIFO({productCode:'PRD-EGG-RAW',skuCode:'SKU-GRADE_1',companyCode:'COMP-A',fulfillmentWarehouseCode:'WH-A',
        qty:40,refNo:'SYNTHETIC-MANAGED-ORDER',note:'Untrusted direct caller',quantitySnapshot:quantity})).rejects.toThrow('公司上下文');
      expect(await inventory.reserveInventory('1','SYNTHETIC-MANAGED-ORDER','COMP-A',undefined,'WH-A')).toBe(true);
      expect(await inventory.reserveInventory('1','SYNTHETIC-MANAGED-ORDER','COMP-A',undefined,'WH-A')).toBe(false);
      await expect(inventory.confirmOutbound('1','SYNTHETIC-MANAGED-ORDER','COMP-A','SYNTHETIC-DELIVERY','1',40)).rejects.toThrow('旧销售出库禁止');
      await db.query(`INSERT INTO sal_delivery_orders(id,delivery_no,status,company_code,fulfillment_warehouse_code)
          VALUES(1,'SYNTHETIC-DELIVERY','PLANNED','COMP-A','WH-A2');
        INSERT INTO sal_delivery_order_items(id,delivery_order_id,sales_order_id,planned_qty,sales_order_no,status)
          VALUES(1,1,1,40,'SYNTHETIC-MANAGED-ORDER','PENDING');UPDATE sal_sales_orders SET status='ALLOCATED' WHERE id=1`);
      const deliveries=new DeliveryOrdersService(db,cls,inventory,new SalesOrderLifecycleService(db));
      expect((await deliveries.startLoading('1',{})).status).toBe('LOADING');
      expect((await db.query('SELECT status FROM sal_delivery_order_items WHERE id=1'))[0].status).toBe('LOADED');
      await expect(deliveries.finishLoading('1',{})).rejects.toThrow('旧销售出库禁止');
      await db.query("UPDATE sal_delivery_orders SET fulfillment_warehouse_code='WH-A' WHERE id=1");
      expect((await deliveries.finishLoading('1',{})).status).toBe('LOADED');
      expect((await db.query('SELECT loaded_qty,outbound_qty FROM sal_delivery_order_items WHERE id=1'))[0]).toEqual({loaded_qty:'40',outbound_qty:'40'});
      await expect(deliveries.finishLoading('1',{})).rejects.toThrow('不可重复完成装车');
    });
    expect((await db.query('SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1',[posted.batches[0].batchNo]))[0]).toEqual({qty:'60',qty_available:'60'});
    expect((await db.query("SELECT cost_change FROM inv_ledger WHERE change_type='FIFO_OUT'"))[0].cost_change).toBeNull();
    expect((await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body.totalInbound).toBe(100);
  });
  it('rejects managed order substitution, foreign scope, disabled company scope and mismatched snapshots before any reservation',async()=>{
    const {inventory}=await managedSalesOrder();
    await expect(asInventoryActor(6,()=>inventory.reserveInventory('1','SYNTHETIC-MANAGED-ORDER','COMP-A',undefined,'WH-A'))).rejects.toThrow();
    await expect(asInventoryActor(1,()=>inventory.reserveInventory('1','FORGED-ORDER','COMP-A',undefined,'WH-A'))).rejects.toThrow('公司上下文');
    await expect(asInventoryActor(1,()=>inventory.reserveInventory('1','SYNTHETIC-MANAGED-ORDER','COMP-A',undefined,'WH-A2'))).rejects.toThrow('公司上下文');
    await db.query("UPDATE md_sku_org_scope SET stock_enabled=false WHERE sku_code='SKU-GRADE_1' AND scope_code='COMP-A'");
    try{await expect(asInventoryActor(1,()=>inventory.reserveInventory('1','SYNTHETIC-MANAGED-ORDER','COMP-A',undefined,'WH-A'))).rejects.toThrow('用途被禁用');}
    finally{await db.query("UPDATE md_sku_org_scope SET stock_enabled=true WHERE sku_code='SKU-GRADE_1' AND scope_code='COMP-A'");}
    await db.query("UPDATE sal_order_items SET sku_code='SKU-GRADE_2' WHERE id=1");
    await expect(asInventoryActor(1,()=>inventory.reserveInventory('1','SYNTHETIC-MANAGED-ORDER','COMP-A',undefined,'WH-A'))).rejects.toThrow('快照身份不一致');
    expect((await db.query('SELECT count(*)::int AS n FROM sal_order_item_batch_allocations'))[0].n).toBe(0);
    expect((await db.query('SELECT qty_available FROM inv_batches'))[0].qty_available).toBe('100');
  });
  it('keeps an otherwise authorized company OFF instead of enabling its managed legacy stock by this rollout',async()=>{
    const {inventory,quantity}=await managedSalesOrder();
    await db.query(`INSERT INTO sal_sales_orders(id,order_no,status,company_code,fulfillment_warehouse_code)
        VALUES(2,'SYNTHETIC-OFF-COMPANY','APPROVED','COMP-B','WH-B');
      INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,grade_code_std,spec_code,unit,
          base_quantity_version,status,qty,qty_available,source_type,source_no,expire_date)
        VALUES('SYNTHETIC-OFF-MANAGED','COMP-B','WH-B','PRD-EGG-RAW','SKU-GRADE_1','GRADE_1','LOOSE','枚',1,'AVAILABLE',100,100,'PURCHASE','SYNTHETIC-OFF',CURRENT_DATE+10)`);
    await db.query(`INSERT INTO sal_order_items(id,sales_order_id,product_code,grade_code,sku_code,qty,amount,quantity_snapshot)
      VALUES(2,2,'PRD-EGG-RAW','GRADE_1','SKU-GRADE_1',40,80,$1)`,[JSON.stringify(quantity)]);
    await expect(asInventoryActor(6,()=>inventory.reserveInventory('2','SYNTHETIC-OFF-COMPANY','COMP-B',undefined,'WH-B'))).rejects.toThrow('公司上下文');
    expect((await db.query("SELECT qty_available FROM inv_batches WHERE batch_no='SYNTHETIC-OFF-MANAGED'"))[0].qty_available).toBe('100');
  });
  it('completes a real membership-bound POS cash sale of managed production stock and replays without double deduction',async()=>{
    const {posted}=await managedSalesOrder();
    const quantity=await db.transaction(m=>resolveQuantity(m,{qty:10,skuCode:'SKU-GRADE_1',quantityBasis:'BASE'}));
    const priceQuantity=await db.transaction(m=>resolveQuantity(m,{qty:1,skuCode:'SKU-GRADE_1',quantityBasis:'BASE'}));
    await db.query(`INSERT INTO store_master(id,store_code,store_name,company_code,status) VALUES(1,'STORE-A','Synthetic store','COMP-A','ACTIVE');
      INSERT INTO mst_stores VALUES('STORE-A','Synthetic store','Synthetic store','Synthetic store');
      INSERT INTO store_memberships(store_id,user_id,role,status) VALUES(1,1,'CASHIER','ACTIVE');
      INSERT INTO store_warehouse_bindings(store_id,warehouse_code,purpose,status) VALUES(1,'WH-A','SALES','ACTIVE'),(1,'WH-A2','SALES','ACTIVE');
      INSERT INTO sal_store_shift_closings(id,store_code,company_code,status) VALUES(1,'STORE-A','COMP-A','OPEN');
      INSERT INTO sal_store_sales(id,sale_no,status,store_code,store_name,company_code,currency_code,total_amount)
        VALUES(1,'SYNTHETIC-MANAGED-POS','OPEN','STORE-A','Synthetic store','COMP-A','CNY',20);
      INSERT INTO fin_cash_accounts(id,account_code,account_name,company_code,current_balance,currency_code,status)
        VALUES(1,'SYNTHETIC-CASH','Synthetic cashier','COMP-A',0,'CNY','ACTIVE');
      INSERT INTO sal_price_books(id,price_book_no,company_code,status,priority,store_code,publish_version)
        VALUES(1,'SYNTHETIC-PRICE','COMP-A','ACTIVE',1,'STORE-A',1)`);
    await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,grade_code_std,spec_code,unit,
        base_quantity_version,status,qty,qty_available,source_type,source_no,expire_date)
      VALUES('SYNTHETIC-OFF-POS-WAREHOUSE','COMP-A','WH-A2','PRD-EGG-RAW','SKU-GRADE_1','GRADE_1','LOOSE','枚',1,'AVAILABLE',100,100,'PURCHASE','SYNTHETIC-OFF-POS',CURRENT_DATE+1)`);
    await db.query(`INSERT INTO sal_store_sale_items(id,sale_id,product_code,product_name,grade_code,sku_code,qty,unit_price,amount,sort_order,
      quantity_snapshot,price_item_id,price_publish_version) VALUES(1,1,'PRD-EGG-RAW','Synthetic eggs','GRADE_1','SKU-GRADE_1',10,2,20,1,$1,1,1)`,[JSON.stringify(quantity)]);
    await db.query(`INSERT INTO sal_price_items(id,price_book_id,sku_code,product_code,grade_code_std,spec_code,status,quantity_snapshot,unit_price,currency_code)
      VALUES(1,1,'SKU-GRADE_1','PRD-EGG-RAW','GRADE_1','LOOSE','ACTIVE',$1,2,'CNY')`,[JSON.stringify(priceQuantity)]);
    await asInventoryActor(1,async cls=>{
      const policy=new StoreScopePolicy(db,cls),pos=new StorePosService(db,cls,policy,new PriceRuntimeService(db,cls));
      const payment={cashAccountId:1,paidAmount:20,idempotencyKey:'SYNTHETIC-MANAGED-POS-ONCE'};
      const original=policy.assertSaleScoped.bind(policy);
      policy.assertSaleScoped=async(id,purpose)=>{const actual=await original(id,purpose);
        await db.query("UPDATE store_warehouse_bindings SET status='INACTIVE'");return actual;};
      try{await expect(pos.completeCashSale(1,payment)).rejects.toThrow('绑定已失效');}
      finally{policy.assertSaleScoped=original;await db.query("UPDATE store_warehouse_bindings SET status='ACTIVE'");}
      await db.query("UPDATE md_sku_org_scope SET stock_enabled=false WHERE sku_code='SKU-GRADE_1' AND scope_code='COMP-A'");
      try{await expect(pos.completeCashSale(1,payment)).rejects.toThrow('用途被禁用');}
      finally{await db.query("UPDATE md_sku_org_scope SET stock_enabled=true WHERE sku_code='SKU-GRADE_1' AND scope_code='COMP-A'");}
      expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[posted.batches[0].batchNo]))[0].qty).toBe('100');
      expect((await db.query('SELECT count(*)::int AS n FROM fin_cash_transactions'))[0].n).toBe(0);
      expect((await pos.completeCashSale(1,payment)).status).toBe('COMPLETED');
      expect((await pos.completeCashSale(1,payment)).status).toBe('COMPLETED');
    });
    expect((await db.query('SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1',[posted.batches[0].batchNo]))[0]).toEqual({qty:'90',qty_available:'90'});
    expect((await db.query("SELECT qty,qty_available FROM inv_batches WHERE batch_no='SYNTHETIC-OFF-POS-WAREHOUSE'"))[0]).toEqual({qty:'100',qty_available:'100'});
    expect((await db.query("SELECT cost_change FROM inv_ledger WHERE change_type='FIFO_OUT'"))[0].cost_change).toBeNull();
    expect((await db.query('SELECT current_balance FROM fin_cash_accounts WHERE id=1'))[0].current_balance).toBe('20');
    expect((await db.query('SELECT count(*)::int AS n FROM fin_cash_transactions'))[0].n).toBe(1);
  });
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
      INSERT INTO fin_cash_accounts(company_code,current_balance,status) VALUES('COMP-A',31,'ACTIVE'),('COMP-B',901,'ACTIVE');
      INSERT INTO fin_ar_invoices(company_code,balance_amount_original,collection_status) VALUES('COMP-A',7,'UNPAID'),('COMP-B',700,'UNPAID');
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
      INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,reserved_qty,outbound_qty,released_qty) VALUES(2,1,'SYNTHETIC-GROUP-COST-2',4,0,0)`);
    expect((await groupApi(12).expect(200)).body.grossProfit).toBe(72);
    await db.query("INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,reserved_qty,outbound_qty,released_qty) VALUES(3,1,'SYNTHETIC-OTHER-WAREHOUSE',1,0,1)");
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
  it('pages and exports the same authorized physical stock and signed origins over HTTP',async()=>{
    const ids:string[]=[];
    for(const qty of [30,70]){
      const {ready}=await signedDraft(qty);
      const receipt=(await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body;
      ids.push(receipt.batches[0].batchNo);
    }
    const query=`companyCode=COMP-A&houseCode=HOUSE-A&eggDate=${day}&warehouseCode=WH-A&view=source&gradeCode=GRADE_1`;
    const page=(suffix='')=>api(4,'get','/stock-batches?'+query+suffix);
    const first=(await page('&limit=1').expect(200)).body;
    expect(first).toMatchObject({stockBasisVersion:2,nextCursor:ids[0],items:[{batchNo:ids[0],batchQty:30,attributableQty:30}]});
    const last=(await page('&limit=1&after='+encodeURIComponent(first.nextCursor)).expect(200)).body;
    expect(last).toMatchObject({nextCursor:null,items:[{batchNo:ids[1],attributableQty:70,sources:[{kind:'INBOUND',houseCode:'HOUSE-A'}]}]});
    await page('&limit=201').expect(400);
    const csv=await api(4,'get','/stock-batches/export?'+query+'&limit=1&after='+encodeURIComponent(first.nextCursor)).expect(200).expect('Content-Type',/text\/csv/);
    const lines=csv.text.trimEnd().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"'+ids[0]+'"');
    expect(lines[2]).toContain('"70","70","70","EXACT"');
    for(const path of ['/stock-batches?','/stock-batches/export?']){
      await api(6,'get',path+query).expect(403);
      await api(7,'get',path+query).expect(403);
    }
  });
  it('does not treat a qualified unknown production cost or failed cost query as a zero-margin result',async()=>{
    const {ready}=await signedDraft();const posted=(await api(1,'post',`/${ready.id}/post`).send({submitKey:ready.submit_key,contentHash:ready.content_hash}).expect(201)).body;
    const batch=posted.batches[0].batchNo;
    await db.query(`INSERT INTO sal_sales_orders(id,order_no,status,company_code,currency_code,total_amount) VALUES(1,'SYNTHETIC-UNKNOWN-COST','APPROVED','COMP-A','CNY',100);
      INSERT INTO sal_order_items(id,sales_order_id,qty,amount) VALUES(1,1,10,100)`);
    await db.query('INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,reserved_qty,outbound_qty,released_qty) VALUES(1,1,$1,10,0,0)',[batch]);
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
    for(const quantity of [true,'100'])await api(1,'post','').send({...draft(),items:[{gradeCode:'GRADE_1',quantity}]}).expect(400);
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
