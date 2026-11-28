import {DataScopeService} from '../org/services/data-scope.service';
import {Test} from '@nestjs/testing';
import {TypeOrmModule} from '@nestjs/typeorm';
import {ConfigModule} from '@nestjs/config';
import {ThrottlerModule} from '@nestjs/throttler';
import {ClsModule} from 'nestjs-cls';
import {ClsService} from 'nestjs-cls';
import {DataSource} from 'typeorm';
import {randomBytes,randomUUID} from 'crypto';
import * as bcrypt from 'bcrypt';
import {OrgModule} from '../org/org.module';
import {PackagingHistoryController} from './packaging-history.controller';
import {PackagingTerminalBffController} from './bff.controller';
import {PackagingHistoryService} from './packaging-history.service';
import {PackagingWorkQueueService} from './packaging-work-queue.service';
import {PackagingHandoverService} from './packaging-handover.service';
import {PackagingBoxService} from './packaging-box.service';
import {PackagingWorkflowPolicy} from './packaging-workflow-policy';
import {PackagingInventoryIntegrationService} from '../sales-v2/services/packaging-inventory-integration.service';
import {EggInventoryService} from '../sales-v2/services/egg-inventory.service';
import {InventorySourceModeService} from '../sales-v2/services/inventory-source-mode.service';
import {SkuAvailabilityService} from '../product-master/services/sku-availability.service';
import {packingHistoryFixture} from './packaging-history.fixture';
import {hydrateMenuRegistry} from '../../common/guards/menu-registry.service';
import {resolve} from 'path';
import {TraceabilityModule} from '../traceability/traceability.module';
import {AnalyticsModule} from '../analytics/analytics.module';
import {InventoryController,StocktakeController} from '../wms/inventory.controller';
import {WmsService} from '../wms/wms.service';
import {WarehouseDailyCloseService} from '../wms/warehouse-daily-close.service';
import {ProductionFinanceReviewController} from '../sales-v2/controllers/production-finance-review.controller';
import {FileAccessService} from '../file/file-access.service';


(process.env.PACKAGING_HISTORY_PG==='1'?describe:describe.skip)('real HTTP JWT/MenuGuard/DataScope PG18 ordinary accounts',()=>{
 let app:any,ds:DataSource,base:string,f:any,hidden:any,otherWarehouse:string;const accounts=new Map<string,{token:string;id:string}>();
 const enabledFixtures=new Set<string>();
 const testPolicy=new PackagingWorkflowPolicy(),normalPolicy=testPolicy.get.bind(testPolicy);
 testPolicy.get=(...args:Parameters<PackagingWorkflowPolicy['get']>)=>enabledFixtures.has(JSON.stringify(args.slice(0,2)))
   ? {version:'HTTP-TEST',R:true,B:true,P:true,V:true,H:true,Q:true,encodingVersion:'TEST-NON-BUSINESS-v1',receiptMode:'C'}
   : normalPolicy(...args);
 beforeAll(async()=>{
 process.env.JWT_SECRET=randomBytes(32).toString('hex');process.env.ENABLE_DEV_LOGIN='false';
 const {AuthModule}=await import('../../auth/auth.module');
 const module=await Test.createTestingModule({imports:[ConfigModule.forRoot({isGlobal:true,ignoreEnvFile:true}),ClsModule.forRoot({global:true,middleware:{mount:true}}),
 TypeOrmModule.forRoot({type:'postgres',host:'127.0.0.1',port:55432,username:'postgres',database:'packaging_history_test',entities:[resolve(__dirname,'../../**/*.entity.ts')],autoLoadEntities:true,synchronize:false,logging:false}),
 ThrottlerModule.forRoot([{name:'login',ttl:900000,limit:100}]),AuthModule,OrgModule,TraceabilityModule,AnalyticsModule],
 controllers:[PackagingHistoryController,PackagingTerminalBffController,InventoryController,StocktakeController,ProductionFinanceReviewController],
 providers:[PackagingHistoryService,PackagingWorkQueueService,PackagingHandoverService,PackagingBoxService,WarehouseDailyCloseService,WmsService,
 {provide:FileAccessService,useValue:{}},
 {provide:PackagingWorkflowPolicy,useValue:testPolicy},
 {provide:PackagingInventoryIntegrationService,useFactory:(source:DataSource,cls:ClsService)=>new PackagingInventoryIntegrationService(source,cls,
   new EggInventoryService(source,cls,new SkuAvailabilityService(source)),new InventorySourceModeService(source,cls)),inject:[DataSource,ClsService]}]}).compile();
 app=module.createNestApplication({logger:false});await app.init();ds=app.get(DataSource);await hydrateMenuRegistry(ds.manager);
 f=await packingHistoryFixture(ds);hidden=await packingHistoryFixture(ds);
 const [org]=await ds.query(`SELECT id FROM sys_organizations WHERE org_code=$1 AND org_type='COMPANY'`,[f.company]);
 const siteCode=f.prefix+'-P4-SITE';
 otherWarehouse=f.prefix+'-P4-OTHER-WH';
 const [siteOrg]=await ds.query(`INSERT INTO sys_organizations(org_code,org_name,org_type,parent_id,company_code,status)
   VALUES($1,$1,'SITE',$2,$3,'ACTIVE') RETURNING id`,[siteCode,org.id,f.company]);
 const [foreignOrg]=await ds.query(`SELECT id FROM sys_organizations WHERE org_code=$1 AND org_type='COMPANY'`,[hidden.company]);
 await ds.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,site_code,type,domain,status)
   VALUES($1,$1,$2,$3,'GENERAL','OPERATIONAL','INACTIVE')`,[otherWarehouse,f.company,siteCode]);
 for(const [name,menu,perms,scope] of [['OP_V','MENU_PKG_OP','V',true],['OP_E','MENU_PKG_OP','V,E',true],['OP_E2','MENU_PKG_OP','V,E',true],['MGR_V','MENU_PKG_MGR','V',true],['MGR_E','MENU_PKG_MGR','E',true],['NO_SCOPE','MENU_PKG_OP','V',false],['GLOBAL_OP','MENU_PKG_OP','V','GLOBAL'],['OP_PROD','MENU_PKG_OP','V',true],
   ['P4_OTHER_WAREHOUSE','MENU_TRACEABILITY_VIEW','V','SITE'],['P4_FOREIGN','MENU_TRACEABILITY_VIEW','V','FOREIGN']]){
  const username='TEST-'+name+'-'+randomUUID().slice(0,6),password=randomBytes(18).toString('hex');
  const [u]=await ds.query(`INSERT INTO sys_user(username,real_name,password_hash,status) VALUES($1,$1,$2,1) RETURNING user_id::text`,[username,await bcrypt.hash(password,4)]);
  const [role]=await ds.query(`INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id`,[username]);
  await ds.query('INSERT INTO sys_user_role(user_id,role_id,is_primary) VALUES($1,$2,true)',[u.user_id,role.role_id]);
  await ds.query(`INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,$2 FROM sys_menu WHERE menu_code=$3`,[role.role_id,perms,menu]);
  if(name==='OP_PROD')await ds.query("INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes) SELECT $1,menu_id,'V' FROM sys_menu WHERE menu_code='MENU_PROD_INBOUND'",[role.role_id]);
  if(['OP_V','NO_SCOPE','P4_OTHER_WAREHOUSE','P4_FOREIGN'].includes(String(name))) {
    await ds.query(`INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes)
      SELECT $1,menu_id,CASE WHEN menu_code='MENU_FIN2_AR_LEDGER' THEN 'V,E' ELSE 'V' END FROM sys_menu
      WHERE menu_code IN ('MENU_TRACEABILITY_VIEW','MENU_WMS_INOUT','MENU_DASHBOARD','MENU_FIN2_AR_LEDGER','MENU_PROD_FIN_REVIEW')
      AND menu_code<>$2`,[role.role_id,menu]);
  }
  if(scope){
    const scopedOrg=scope==='SITE'?siteOrg.id:scope==='FOREIGN'?foreignOrg.id:org.id;
    await ds.query('INSERT INTO sys_user_orgs(user_id,org_id,data_scope_level) VALUES($1,$2,$3)',[u.user_id,scopedOrg,scope==='GLOBAL'?'GROUP':'COMPANY']);
    await ds.query('INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES($1,$2)',[u.user_id,scope==='FOREIGN'?hidden.farm:f.farm]);
    if(scope==='SITE')await ds.query('INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES($1,$2)',[u.user_id,otherWarehouse]);
  }
  if(!base){await app.listen(0,'127.0.0.1');base=await app.getUrl();}
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  const result:any=await response.json();if(!result.token)throw Error('ISOLATED_LOGIN_FAILED:'+response.status+':'+String(result.msg||result.message));
  accounts.set(String(name),{token:result.token,id:u.user_id});
 }
 },60000);
 afterEach(()=>enabledFixtures.clear());
 afterAll(async()=>{await app?.close();delete process.env.JWT_SECRET;});
 async function apiGet(path:string,account='OP_V'){
   const response=await fetch(base+'/api/'+path,{headers:accounts.has(account)?{Authorization:'Bearer '+accounts.get(account)!.token}:{}});
   return {status:response.status,body:await response.json() as any};
 }
 const get=(path:string,account='OP_V')=>apiGet('packaging/terminal/'+path,account);
 const traceLabel=(code:string,account='OP_V')=>apiGet('traceability/label/'+encodeURIComponent(code),account);
 async function post(path:string,body:any,account:string,key=randomUUID()){
   const response=await fetch(base+'/api/packaging/terminal/'+path,{method:'POST',headers:{Authorization:'Bearer '+accounts.get(account)!.token,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});
   return {status:response.status,body:await response.json() as any};
 }
 it('rejects unauthenticated HTTP',async()=>{expect((await get('history','NONE')).status).toBe(401);});
 it.each(['OP_V','OP_E','MGR_V'])('%s sees only its original and exact count',async account=>{const r=await get('history',account);expect(r.status).toBe(200);expect(r.body.data.totalMatching).toBe(1);expect(r.body.data.items[0].record.code).toBe(f.prefix);expect((await get('history/'+hidden.prefix,account)).status).toBe(404);});
 it('MGR:E alone has no read permission; empty scope does not become global',async()=>{expect((await get('history','MGR_E')).status).toBe(403);const r=await get('history','NO_SCOPE');expect(r.status).toBe(200);expect(r.body.data.totalMatching).toBe(0);});
 it('absent and inaccessible originals return identical nonleaking bodies',async()=>{const a=await get('history/'+hidden.prefix),b=await get('history/TEST-NOT-EXIST');expect(a.status).toBe(404);expect(a.body).toEqual(b.body);});
 it('V cannot bypass UI to register and E remains blocked by production-default flags',async()=>{for(const account of ['OP_V','OP_E']){const response=await fetch(base+'/api/packaging/terminal/history/'+f.prefix+'/box-registration',{method:'POST',headers:{Authorization:'Bearer '+accounts.get(account)!.token,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({expectedRevision:'a'.repeat(64),registrationKind:'FIRST_LABEL_CONFIRMED',reason:'TEST',items:[{outputOrdinal:0,boxOrdinal:1,declaration:'TEST'}]})});expect(response.status).toBe(account==='OP_V'?403:409);}});
 it('candidate warehouses follow the original company',async()=>{const r=await get('history/'+f.prefix+'/candidates?kind=WAREHOUSE');expect(r.status).toBe(200);expect(r.body.data.map((x:any)=>x.code)).toEqual([f.warehouse]);});
 it('all detail sections and operations reject other-company original URLs',async()=>{
   for(const suffix of ['','/outputs','/sources','/boxes','/evidence','/candidates?kind=WAREHOUSE'])expect((await get('history/'+hidden.prefix+suffix)).status).toBe(404);
   expect((await get(`operations/${randomUUID()}?action=CONFIRM&packingCode=${hidden.prefix}`)).status).toBe(404);
 });
 it('my-operation recovery returns only this actor original action evidence and no request body/hash',async()=>{
   const key=randomUUID(),actor=accounts.get('OP_E')!.id;
   await ds.query(`INSERT INTO pkg_packing_operations(id,actor_id,action,idempotency_key,packing_id,payload_hash,state) VALUES($1,$2,'PRINT',$3,$4,repeat('a',64),'PENDING')`,[randomUUID(),actor,key,f.packingId]);
   const own=await get(`history/${f.prefix}/my-operation?action=PRINT`,'OP_E');
   expect(own.status).toBe(200);expect(own.body.data).toMatchObject({idempotencyKey:key,state:'PENDING'});
   expect(own.body.data).not.toHaveProperty('payload_hash');expect(own.body.data).not.toHaveProperty('body');
   expect((await get(`history/${f.prefix}/my-operation?action=PRINT`,'OP_V')).body.data).toEqual({state:'NOT_FOUND'});
   expect((await get(`history/${hidden.prefix}/my-operation?action=PRINT`,'OP_E')).status).toBe(404);
   expect((await get(`history/${f.prefix}/my-operation?action=PRINT_RESULT&requestId=bad`,'OP_E')).status).toBe(400);
 });
 it('foreign warehouse candidates never leak locations or receivers',async()=>{
   for(const kind of ['LOCATION','RECEIVER']){const r=await get(`history/${f.prefix}/candidates?kind=${kind}&warehouseCode=${hidden.warehouse}`);expect(r.status).toBe(200);expect(r.body.data).toEqual([]);}
 });
 it('source company drift hides the entire original and its count without partial rows',async()=>{
   await ds.query('UPDATE brd_houses SET farm_code=$2 WHERE house_code=$1',[f.house,hidden.farm]);
   try{expect((await get('history/'+f.prefix)).status).toBe(404);expect((await get('history')).body.data.totalMatching).toBe(0);}finally{await ds.query('UPDATE brd_houses SET farm_code=$2 WHERE house_code=$1',[f.house,f.farm]);}
 });
 it('unknown and foreign label lookups have identical nonleaking failures',async()=>{
   const a=await get(`boxes/resolve?packingCode=${f.prefix}&labelCode=TEST-UNKNOWN`),b=await get(`boxes/resolve?packingCode=${f.prefix}&labelCode=${hidden.prefix}`);expect(a.status).toBe(409);expect(a.body).toEqual(b.body);
 });
 it('real HTTP malformed dates and cursor get 400, not 500',async()=>{
   for(const q of ['dateFrom=2026-02-30','cursor=garbage','shiftStatus=bogus','packingCode=%20'])expect((await get('history?'+q)).status).toBe(400);
 });
 it('explicit GROUP scope is honored for an ordinary non-admin OP role',async()=>{
   const r=await get('history','GLOBAL_OP');expect(r.status).toBe(200);expect((await get('history/'+f.prefix,'GLOBAL_OP')).status).toBe(200);expect((await get('history/'+hidden.prefix,'GLOBAL_OP')).status).toBe(200);
 });
 it('work queue exposes only authorized closed-shift originals to normal HTTP accounts',async()=>{
   const myQueue=`work-queue?bucket=CARRYOVER&siteCode=${f.farm}&pageSize=25`;
   for(const account of ['OP_V','OP_E','MGR_V']){
     const r=await get(myQueue,account);
     expect(r.status).toBe(200);
     expect(r.body.data.items).toEqual([expect.objectContaining({kind:'PACKING',code:f.prefix,shiftId:f.shiftId,quantity:50})]);
   }
   expect((await get(myQueue,'MGR_E')).status).toBe(403);
   expect((await get(myQueue,'NONE')).status).toBe(401);
   const foreign=await get(`work-queue?bucket=CARRYOVER&siteCode=${hidden.farm}&pageSize=25`);
   const missing=await get('work-queue?bucket=CARRYOVER&siteCode=TEST-UNKNOWN&pageSize=25');
   expect(foreign).toEqual(missing);
   expect((await get(myQueue,'NO_SCOPE')).body.data.items).toEqual([]);
 });
 it('work queue leaves an original out when its source moves outside the authorized farm',async()=>{
   const path=`work-queue?bucket=CARRYOVER&siteCode=${f.farm}&pageSize=25`;
   await ds.query('UPDATE brd_houses SET farm_code=$2 WHERE house_code=$1',[f.house,hidden.farm]);
   try {
     const r=await get(path);
     expect(r.status).toBe(200);
     expect(r.body.data.items).toEqual([]);
   } finally {
     await ds.query('UPDATE brd_houses SET farm_code=$2 WHERE house_code=$1',[f.house,f.farm]);
   }
 });
 it('work queue site choices use the same read scope as the queue',async()=>{
   for(const account of ['OP_V','MGR_V']){
     const r=await get('work-queue/sites',account);
     expect(r.status).toBe(200);
     expect(r.body.data.map((site:any)=>site.siteCode)).toEqual([f.farm]);
   }
   expect((await get('work-queue/sites','NO_SCOPE')).body.data).toEqual([]);
   expect((await get('work-queue/sites','MGR_E')).status).toBe(403);
 });
 it('queues partial handover once and hides both the item and its count when evidence is in another warehouse',async()=>{
   const path=`work-queue?bucket=REVIEW&siteCode=${f.farm}&pageSize=25`;
   const receipt=f.prefix+'-PARTIAL';
   await ds.query("INSERT INTO pkg_handover_records(code,packing_code,box_count,location,production_date) VALUES($1,$2,1,$3,'2026-01-02')",[receipt,f.prefix,f.location]);
   try {
     const visible=await get(path);
     expect(visible.status).toBe(200);
     expect(visible.body.data.items).toContainEqual(expect.objectContaining({
       code:f.prefix,kind:'PACKING',action:'PARTIAL_HANDOVER',quantity:null,
     }));
     expect(visible.body.data.counts.PACKING).toBe(1);
     expect((await get(`work-queue?bucket=CARRYOVER&siteCode=${f.farm}&pageSize=25`)).body.data.items
       .some((x:any)=>x.code===f.prefix)).toBe(false);
     await ds.query('UPDATE pkg_handover_records SET location=$2 WHERE code=$1',[receipt,hidden.location]);
     const denied=await get(path);
     expect(denied.status).toBe(200);
     expect(denied.body.data.items.some((x:any)=>x.code===f.prefix)).toBe(false);
     expect(denied.body.data.counts.PACKING||0).toBe(0);
   } finally {
     await ds.query('DELETE FROM pkg_handover_records WHERE code=$1',[receipt]);
   }
 });
 it('legacy TEMP links preserve source range and require the downstream read grant',async()=>{
   const code=f.prefix+'-TEMP',mappedSite=f.farm+'-SITE',path=`work-queue?bucket=CURRENT&siteCode=${f.farm}&shiftId=${f.shiftId}&pageSize=25`;
   await ds.query("UPDATE pkg_work_shifts SET status='OPEN' WHERE id=$1",[f.shiftId]);
   await ds.query("UPDATE inv_source_mode SET mode='TEMP_PRODUCTION_INBOUND' WHERE scope_level='SITE' AND scope_code=$1",[f.farm]);
   const [warehouse]=await ds.query("SELECT type,site_code FROM wms_warehouses WHERE warehouse_code=$1",[f.warehouse]);
   await ds.query('UPDATE brd_farms SET mapped_site_code=$2 WHERE farm_code=$1',[f.farm,mappedSite]);
   await ds.query("UPDATE wms_warehouses SET type='EGG_FARM',site_code=$2 WHERE warehouse_code=$1",[f.warehouse,mappedSite]);
   await ds.query("INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status) VALUES($1,$2,$3,'2026-01-02',30,'RECEIVED')",[code,f.house,f.shiftId]);
   try {
     const allowed=await get(path,'OP_PROD'),denied=await get(path);
     expect(allowed.status).toBe(200);
     expect(denied.status).toBe(200);
     const row=allowed.body.data.items.find((x:any)=>x.code===code);
     expect(row).toMatchObject({kind:'SOURCE',action:'LEGACY_TEMP_INBOUND'});
     const destination=new URL(row.href,'http://localhost');
     expect(destination.pathname).toBe('/breeding/daily-inbound');
     expect(Object.fromEntries(destination.searchParams)).toMatchObject({
       companyCode:f.company,siteCode:mappedSite,houseCode:f.house,eggDate:'2026-01-02',queueAction:'LEGACY_TEMP_INBOUND',
     });
     expect(denied.body.data.items.find((x:any)=>x.code===code)).toMatchObject({href:null});
     expect(allowed.body.data.items.some((x:any)=>x.kind==='PACKING')).toBe(false);
   } finally {
     await ds.query('DELETE FROM pkg_source_batches WHERE batch_code=$1',[code]);
     await ds.query("UPDATE inv_source_mode SET mode='PACKAGING_INBOUND' WHERE scope_level='SITE' AND scope_code=$1",[f.farm]);
     await ds.query('UPDATE brd_farms SET mapped_site_code=$1 WHERE farm_code=$1',[f.farm]);
     await ds.query("UPDATE wms_warehouses SET type=$2,site_code=$3 WHERE warehouse_code=$1",[f.warehouse,warehouse.type,warehouse.site_code]);
     await ds.query("UPDATE pkg_work_shifts SET status='CLOSED' WHERE id=$1",[f.shiftId]);
   }
 });
 it('withholds packaging handover for same-day legacy TEMP stock with unknown origin',async()=>{
   const batch=f.prefix+'-LEGACY-UNKNOWN',otherHouse=f.house+'-OTHER';
   const carryover=`work-queue?bucket=CARRYOVER&siteCode=${f.farm}&pageSize=25`;
   const review=`work-queue?bucket=REVIEW&siteCode=${f.farm}&pageSize=25`;
   await ds.query("INSERT INTO brd_houses(house_code,farm_code,status) VALUES($1,$2,'ACTIVE')",[otherHouse,f.farm]);
   await ds.query(`INSERT INTO inv_batches(batch_no,product_code,company_code,warehouse_code,qty,qty_available,egg_date,source_type,source_no)
     VALUES($1,$2,$3,$4,12,12,'2026-01-02','TEMP_PRODUCTION','TEMP-2026-01-02-UNKNOWN')`,[batch,f.prefix,f.company,f.warehouse]);
   try {
     const excluded=await get(carryover),flagged=await get(review);
     expect(excluded.status).toBe(200);
     expect(excluded.body.data.items.some((x:any)=>x.code===f.prefix&&x.kind==='PACKING')).toBe(false);
     expect(flagged.body.data.items).toContainEqual(expect.objectContaining({code:f.prefix,kind:'SOURCE',action:'SOURCE_ALLOCATION_REVIEW',href:null}));
     await ds.query("UPDATE inv_batches SET collection_batch_ref='HOUSE-'||$2 WHERE batch_no=$1",[batch,otherHouse]);
     expect((await get(carryover)).body.data.items).toContainEqual(expect.objectContaining({code:f.prefix,kind:'PACKING'}));
   } finally {
     await ds.query('DELETE FROM inv_batches WHERE batch_no=$1',[batch]);
     await ds.query('DELETE FROM brd_houses WHERE house_code=$1',[otherHouse]);
   }
 });
 it('foreign warehouse inventory evidence hides the full chain and total',async()=>{
   const batch=f.prefix+'-FOREIGN-WH';
   await ds.query(`INSERT INTO inv_batches(batch_no,product_code,company_code,warehouse_code,qty,qty_available,packaging_batch_ref) VALUES($1,$2,$3,$4,30,30,$2)`,[batch,f.prefix,f.company,hidden.warehouse]);
   try{expect((await get('history/'+f.prefix)).status).toBe(404);expect((await get('history')).body.data.totalMatching).toBe(0);}finally{await ds.query('DELETE FROM inv_batches WHERE batch_no=$1',[batch]);}
 });
 // Added during workspace-only review. NOT executed against HTTP/PG in that session.
 it.each(['box-registration','verification-sessions','box-verifications','void','print','print-result'])('ordinary read-only roles cannot POST %s',async action=>{
   const id=randomUUID();const route=action==='void'?`history/${f.prefix}/labels/TEST-UNKNOWN/void`:action==='print'?'labels/print-requests':action==='print-result'?`labels/print-requests/${id}/events`:`history/${f.prefix}/${action}`;
   for(const account of ['OP_V','MGR_V','MGR_E','NO_SCOPE','GLOBAL_OP','NONE']){
     const response=await fetch(base+'/api/packaging/terminal/'+route,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID(),...(accounts.has(account)?{Authorization:'Bearer '+accounts.get(account)!.token}:{})},body:JSON.stringify({packingCode:f.prefix})});
     expect(response.status).toBe(account==='NONE'?401:403);
   }
 });
 it('batched recipient scope equals authoritative resolve for ordinary and GROUP accounts',async()=>{
   const scopes=app.get(DataScopeService),users=[];
   for(const account of accounts.values()){const roles=await ds.query(`SELECT r.role_code FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id WHERE ur.user_id=$1 AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE'`,[account.id]);users.push({code:account.id,roles:roles.map((r:any)=>r.role_code)});}
   const eligible=await scopes.eligibleWarehouseRecipients(users,'MENU_PKG_OP',f.company,f.warehouse);
   for(const u of users){const scope=await scopes.resolve(u.code,u.roles,'MENU_PKG_OP');expect(eligible.has(u.code)).toBe(scope.isGlobal||(scope.allowedCompanyCodes.includes(f.company)&&scope.allowedWarehouseCodes.includes(f.warehouse)));}
 });
 it.each(['SITE_ALLOWED','SITE_NO_GRANT','DEPT_ANCESTOR','REGION_SIBLING','GRANDCHILD'])('batched recipient %s equals fresh authoritative scope',async kind=>{
   const x=await packingHistoryFixture(ds),scopes=app.get(DataScopeService);
   const org=async(code:string,type:string,parent:any=null,company:any=null)=>{const [o]=await ds.query(`INSERT INTO sys_organizations(org_code,org_name,org_type,parent_id,company_code,status) VALUES($1,$1,$2,$3,$4,'ACTIVE') RETURNING id`,[code,type,parent,company]);return o.id;};
   const root=await org(x.prefix+'-ROOT','GROUP'),middle=await org(x.prefix+'-MID','DEPARTMENT',root);
   await ds.query('UPDATE sys_organizations SET parent_id=$2 WHERE org_code=$1',[x.company,middle]);
   const [ownedCompany]=await ds.query('SELECT id FROM sys_organizations WHERE org_code=$1',[x.company]),company=ownedCompany.id;
   let bound=company;const roles=[x.prefix];
   if(kind.startsWith('SITE')){const site=x.prefix+'-SITE';bound=await org(site,'SITE',company);await ds.query('UPDATE wms_warehouses SET site_code=$2 WHERE warehouse_code=$1',[x.warehouse,site]);if(kind==='SITE_ALLOWED')await ds.query('INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES($1,$2)',[x.actor,x.warehouse]);}
   if(kind==='DEPT_ANCESTOR')bound=await org(x.prefix+'-DEPT','DEPARTMENT',company);
   if(kind==='GRANDCHILD')bound=root;
   if(kind==='REGION_SIBLING'){bound=await org(x.prefix+'-SIB','COMPANY',middle,x.prefix+'-OTHER');await ds.query(`INSERT INTO sys_data_scopes(role_code,module_code,scope_type) VALUES($1,'MENU_PKG_OP','REGION')`,[roles[0]]);}
   await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2)',[x.actor,bound]);
   const scope=await scopes.resolve(x.actor,roles,'MENU_PKG_OP',1),actual=await scopes.eligibleWarehouseRecipients([{code:x.actor,roles}],'MENU_PKG_OP',x.company,x.warehouse);
   const expected=scope.isGlobal||(scope.allowedCompanyCodes.includes(x.company)&&scope.allowedWarehouseCodes.includes(x.warehouse));expect(expected).toBe(kind!=='SITE_NO_GRANT');expect(actual.has(x.actor)).toBe(expected);
 });
 it('receiver server search and pagination preserve scope and omit roles',async()=>{
   const prefix='TEST-REC-'+randomUUID().slice(0,6);
   const [org]=await ds.query(`SELECT id FROM sys_organizations WHERE company_code=$1 AND org_type='COMPANY' LIMIT 1`,[f.company]);
   const users=await ds.query(`INSERT INTO sys_user(username,real_name,password_hash,status) SELECT $1||'-'||n,$1||'-'||n,'TEST-NON-LOGIN',1 FROM generate_series(1,51)n RETURNING user_id`,[prefix]);
   for(const u of users)await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2)',[u.user_id,org.id]);
   const base=`history/${f.prefix}/candidates?kind=RECEIVER&warehouseCode=${f.warehouse}&paged=1&limit=25&search=${prefix}`;
   const first=await get(base);expect(first.body.data.items).toHaveLength(25);expect(first.body.data.nextCursor).toBeTruthy();expect(Object.keys(first.body.data.items[0]).sort()).toEqual(['code','label']);
   const second=await get(base+'&after='+first.body.data.nextCursor);expect(second.body.data.items).toHaveLength(25);expect(second.body.data.items[0].code).not.toBe(first.body.data.items[0].code);
   const last=await get(base+'&after='+second.body.data.nextCursor);expect(last.body.data.items).toHaveLength(1);expect(last.body.data.nextCursor).toBeNull();
 });
 it('recovers a committed handover after the client drops the response, then replays the same receipt exactly once',async()=>{
   // Isolated synthetic T3: two original SKU groups, three boxes, and a real
   // inventory integration service. No physical printer/device is involved.
   enabledFixtures.add(JSON.stringify([f.company,f.farm]));
   await ds.query("UPDATE wms_warehouses SET type='EGG_FARM' WHERE warehouse_code=$1",[f.warehouse]);
   const outputs=f.outputs.map((o:any,i:number)=>({...o,eggs:i===0?60:20,boxes:i===0?2:1}));
   await ds.query('UPDATE pkg_source_batches SET received_qty=80 WHERE batch_code=$1',[f.prefix]);
   await ds.query('UPDATE pkg_grading_records SET total_output=80 WHERE code=$1',[f.prefix]);
   await ds.query('UPDATE pkg_grading_source_links l SET input_qty=80 FROM pkg_grading_records g WHERE l.grading_id=g.id AND g.code=$1',[f.prefix]);
   await ds.query('UPDATE pkg_packing_records SET batches_json=$2,total_eggs=80,total_boxes=3 WHERE id=$1',[f.packingId,JSON.stringify(outputs)]);
   const url=(path:string)=>'history/'+f.prefix+'/'+path;
   const latest=async(account='OP_E2')=>{const r=await get('history/'+f.prefix,account);expect(r.status).toBe(200);return r.body.data;};
   const opaquePost=(path:string,body:unknown,account:string,key:string)=>fetch(base+'/api/packaging/terminal/'+path,{
     method:'POST',headers:{Authorization:'Bearer '+accounts.get(account)!.token,'Content-Type':'application/json','Idempotency-Key':key},
     body:JSON.stringify(body),
   });
   const data=async(path:string,body:unknown,account='OP_E',key=randomUUID())=>{
     const response=await post(path,body,account,key);
     if(response.status!==201)throw Error('HTTP_T3_FAILED:'+path+':'+JSON.stringify(response.body));
     return response.body.data;
   };
   const initial=await latest();
   const session=async(account:string,purpose:string,revision:string)=>{
     const r=await post(url('verification-sessions'),{expectedRevision:revision,purpose},account);expect(r.status).toBe(201);return r.body.data.eventId;
   };
   const registrations=[[0,1],[0,2],[1,1]].map(([outputOrdinal,boxOrdinal],i)=>({
     outputOrdinal,boxOrdinal,observedLabelCode:f.prefix+'-LEGACY-'+i,declaration:'Synthetic observed label',
   }));
   await data(url('box-registration'),{expectedRevision:initial.revision,registrationKind:'LEGACY_VERIFIED',reason:'Disposable T3 HTTP recovery fixture',items:registrations});
   const beforeVoid=await latest('OP_E');
   const pendingAlias=registrations[0].observedLabelCode;
   expect(await traceLabel(pendingAlias)).toMatchObject({status:200,body:{
     found:true,identity:{kind:'ALIAS'},packaging:{packingCode:f.prefix,receiptState:'NOT_RECORDED'},
     inventory:{mappingPrecision:'PACKING_RECORD_ONLY'},outputGroup:null,
   }});
   const oldThird=beforeVoid.boxes[2];
   const oldThirdCode=oldThird.labels.find((l:any)=>l.kind==='CANONICAL'&&l.status==='ACTIVE').code;
   const staleSession=await session('OP_E','LABEL_CHECK',beforeVoid.revision);
   await data(url('box-verifications'),{expectedRevision:beforeVoid.revision,boxId:oldThird.boxId,labelCode:oldThirdCode,
     purpose:'LABEL_CHECK',method:'MANUAL',sessionId:staleSession});
   const voided=await data(url('labels/'+encodeURIComponent(oldThirdCode)+'/void'),{expectedRevision:beforeVoid.revision,
     reason:'Synthetic ink check failed',dispositionDeclaration:'Synthetic old label was removed'});
   expect(voided.labelCode).not.toBe(oldThirdCode);

   const detail=await latest('OP_E');
   expect(detail.revision).not.toBe(beforeVoid.revision);
   expect(detail.verificationRecovery.rounds).toEqual({LABEL_CHECK:null,HANDOVER:null});
   expect((await get(`boxes/resolve?packingCode=${f.prefix}&labelCode=${oldThirdCode}`,'OP_E')).status).toBe(409);
   expect((await get(`boxes/resolve?packingCode=${f.prefix}&labelCode=${registrations[2].observedLabelCode}`,'OP_E')).status).toBe(409);
   const boxes=detail.boxes.map((b:any)=>({boxId:b.boxId,labelCode:b.labels.find((l:any)=>l.kind==='CANONICAL'&&l.status==='ACTIVE').code}));
   expect(boxes).toHaveLength(3);
   expect(boxes[2].labelCode).toBe(voided.labelCode);
   expect((await get(`boxes/resolve?packingCode=${f.prefix}&labelCode=${registrations[0].observedLabelCode}`,'OP_E')).body.data.id).toBe(boxes[0].boxId);

   // Printer bridge output is simulated. The normal requests on boxes 1 and
   // 3 retain their labels; box 2 exercises both lost responses and reprint.
   const printBody=(box:{boxId:string;labelCode:string})=>({expectedRevision:detail.revision,packingCode:f.prefix,
     ...box,printType:'NORMAL',copies:1,templateVersion:'TEST-T3'});
   for(const box of [boxes[0],boxes[2]]){
     const printed=await data('labels/print-requests',printBody(box));
     await data(`labels/print-requests/${printed.eventId}/events`,{packingCode:f.prefix,type:'DISPATCHED'});
   }
   const printKey=randomUUID(),source=printBody(boxes[1]);
   const suppressedPrint=await opaquePost('labels/print-requests',source,'OP_E',printKey);
   expect(suppressedPrint.status).toBe(201);
   await suppressedPrint.body?.cancel();
   const printOperation=`operations/${printKey}?action=PRINT&packingCode=${f.prefix}`;
   const discoveredPrint=(await get(printOperation,'OP_E')).body.data;
   const printedId=discoveredPrint.eventId;
   expect(discoveredPrint).toMatchObject({state:'COMMITTED',result:{labelCode:boxes[1].labelCode}});
   expect((await get(printOperation,'OP_E2')).body.data).toEqual({state:'NOT_FOUND'});
   expect((await data('labels/print-requests',source,'OP_E',printKey)).eventId).toBe(printedId);
   expect((await get(`${url('my-operation')}?action=PRINT&boxId=${boxes[1].boxId}`,'OP_E')).body.data).toMatchObject({state:'COMMITTED',idempotencyKey:printKey,eventId:printedId});

   const resultRoute=`labels/print-requests/${printedId}/events`,resultKey=randomUUID(),unknownResult={packingCode:f.prefix,type:'UNKNOWN'};
   const suppressedResult=await opaquePost(resultRoute,unknownResult,'OP_E',resultKey);
   expect(suppressedResult.status).toBe(201);
   await suppressedResult.body?.cancel();
   const resultPath=`operations/${resultKey}?action=PRINT_RESULT&packingCode=${f.prefix}`;
   const discoveredResult=(await get(resultPath,'OP_E')).body.data;
   expect(discoveredResult).toMatchObject({state:'COMMITTED',result:{requestId:printedId,type:'UNKNOWN'}});
   expect((await data(resultRoute,unknownResult,'OP_E',resultKey)).eventId).toBe(discoveredResult.eventId);
   const originalEvents=(await get(`labels/print-requests/${printedId}`,'OP_E')).body.data;
   expect(originalEvents).toHaveLength(2);
   const reprint={...source,printType:'REPRINT',reason:'Synthetic ink replacement'};
   expect((await post('labels/print-requests',reprint,'OP_E')).status).toBe(409);
   expect((await post(resultRoute,{packingCode:f.prefix,type:'DISPATCHED'},'OP_E')).status).toBe(409);
   expect((await post(resultRoute,{packingCode:f.prefix,type:'FAILED',physicalVerification:'CONFIRMED_PRESENT',reconciliationReason:'Inconsistent fixture'},'OP_E')).status).toBe(400);
   const resolvedResult=await data(resultRoute,{packingCode:f.prefix,type:'FAILED',physicalVerification:'CONFIRMED_ABSENT',reconciliationReason:'Synthetic check found no label'});
   expect(resolvedResult.physicalVerification).toBe('CONFIRMED_ABSENT');
   const retriedLabel=await data('labels/print-requests',reprint);
   expect(retriedLabel).toMatchObject({labelCode:boxes[1].labelCode,printType:'REPRINT'});
   await data(`labels/print-requests/${retriedLabel.eventId}/events`,{packingCode:f.prefix,type:'DISPATCHED'});
   const [printCounts]=await ds.query(`SELECT
     (SELECT count(*)::int FROM pkg_packing_events WHERE packing_id=$1 AND box_id=$2 AND event_type='PRINT_REQUEST') requests,
     (SELECT count(*)::int FROM pkg_packing_events WHERE packing_id=$1 AND event_type='PRINT_RESULT' AND payload->>'requestId'=$3) results`,
     [f.packingId,boxes[1].boxId,printedId]);
   expect(printCounts).toEqual({requests:2,results:2});

   const scans=async(account:string,purpose:string,sessionId:string,revision:string)=>{
     const ids:string[]=[];
     for(const [i,b] of boxes.entries()){
       const labelCode=i===0?registrations[0].observedLabelCode:b.labelCode;
       const scanned=await post(url('box-verifications'),{expectedRevision:revision,boxId:b.boxId,labelCode,purpose,method:'MANUAL',sessionId},account);
       expect(scanned.status).toBe(201);ids.push(scanned.body.data.eventId);
     }
     return ids.sort();
   };
   // Device A checked labels, but B's handover-only verification cannot reuse A's evidence.
   const aLabelSession=await session('OP_E','LABEL_CHECK',detail.revision);
   await scans('OP_E','LABEL_CHECK',aLabelSession,detail.revision);
   const bHandoverSession=await session('OP_E2','HANDOVER',detail.revision);
   const bHandoverScans=await scans('OP_E2','HANDOVER',bHandoverSession,detail.revision);
   const onlyHandover=await latest('OP_E2');
   expect(onlyHandover.verificationRecovery.rounds.LABEL_CHECK).toBeNull();
   expect(Object.keys(onlyHandover.verificationRecovery.rounds.HANDOVER.scans)).toHaveLength(3);
   const confirmation={contractVersion:2,packingCode:f.prefix,expectedRevision:detail.revision,productionDate:detail.record.productionDate,shiftId:f.shiftId,
     boxIds:boxes.map((b:any)=>b.boxId).sort(),verificationIds:bHandoverScans,warehouseCode:f.warehouse,locationCode:f.location,receiverUserId:accounts.get('OP_E2')!.id,palletCode:'T3-HTTP'};
   const premature=await post('warehouse/confirm',confirmation,'OP_E2');
   expect(premature.status).toBe(409);
   expect(JSON.stringify(premature.body)).toMatch(/LABEL_VERIFICATION_REQUIRED/);
   const bLabelSession=await session('OP_E2','LABEL_CHECK',detail.revision);
   await scans('OP_E2','LABEL_CHECK',bLabelSession,detail.revision);
   const reconnected=await latest('OP_E2');
   for(const purpose of ['HANDOVER','LABEL_CHECK'])expect(Object.keys(reconnected.verificationRecovery.rounds[purpose].scans).sort()).toEqual(confirmation.boxIds);

   const key=randomUUID(),confirmRoute='warehouse/confirm';
   const operationPath=`operations/${key}?action=CONFIRM&packingCode=${f.prefix}`;
   // Hold the real workflow lock until both HTTP callers have queued. An
   // operation lookup must report only committed evidence before that lock.
   const gate=ds.createQueryRunner();
   await gate.connect();
   await gate.startTransaction();
   let firstResponse:Promise<Response>|undefined,sameKeyInFlight:ReturnType<typeof post>|undefined;
   try {
     await gate.query("SELECT pg_advisory_xact_lock(hashtextextended('packaging-chain:false',0))");
     const [{pid}]=await gate.query('SELECT pg_backend_pid() pid');
     const waitForCallers=async(expected:number)=>{
       for(let attempt=0;attempt<60;attempt++){
         const [row]=await gate.query(`SELECT count(*)::int callers FROM pg_locks held
           JOIN pg_locks waiting USING(locktype,database,classid,objid,objsubid)
           WHERE held.pid=$1 AND held.locktype='advisory' AND held.granted AND NOT waiting.granted`,[pid]);
         if(row.callers>=expected)return;
         await new Promise(resolve=>setTimeout(resolve,20));
       }
       throw Error('CONFIRM_CALLERS_DID_NOT_QUEUE');
     };
     firstResponse=opaquePost(confirmRoute,confirmation,'OP_E2',key);
     await waitForCallers(1);
     expect((await get(operationPath,'OP_E2')).body.data).toEqual({state:'NOT_FOUND'});
     sameKeyInFlight=post(confirmRoute,confirmation,'OP_E2',key);
     await waitForCallers(2);
   } finally {
     await gate.rollbackTransaction();
     await gate.release();
   }
   // The client discards the original successful HTTP response body.
   const committedButHidden=await firstResponse!;
   expect(committedButHidden.status).toBe(201);
   await committedButHidden.body?.cancel();
   const recovered=await get(operationPath,'OP_E2');
   expect(recovered.status).toBe(200);
   expect(recovered.body.data.state).toBe('COMMITTED');
   expect(recovered.body.data.result).toMatchObject({committed:true,receiptState:'RECORDED',boxIds:confirmation.boxIds});
   expect(await sameKeyInFlight!).toMatchObject({status:201,body:{data:{eventId:recovered.body.data.eventId,handoverCode:recovered.body.data.result.handoverCode}}});
   const hiddenFromA=await get(operationPath,'OP_E');
   expect(hiddenFromA).toMatchObject({status:200,body:{data:{state:'NOT_FOUND'}}});
   const fromCleanDevice=await get(`${url('my-operation')}?action=CONFIRM`,'OP_E2');
   expect(fromCleanDevice.body.data).toMatchObject({state:'COMMITTED',idempotencyKey:key,eventId:recovered.body.data.eventId});
   const replay=await post(confirmRoute,confirmation,'OP_E2',key);
   expect(replay.status).toBe(201);
   expect(replay.body.data).toMatchObject({eventId:recovered.body.data.eventId,operationId:recovered.body.data.result.operationId,handoverCode:recovered.body.data.result.handoverCode});
   const incompatible=await post(confirmRoute,{...confirmation,palletCode:'T3-CHANGED'},'OP_E2',key);
   expect(incompatible.status).toBe(409);
   expect(JSON.stringify(incompatible.body)).toMatch(/IDEMPOTENCY_CONFLICT/);
   const [counts]=await ds.query(`SELECT
     (SELECT count(*)::int FROM inv_batches WHERE packaging_batch_ref=$1) batches,
     (SELECT count(*)::int FROM inv_ledger WHERE ref_no=$1 AND change_type='PACKAGING_INBOUND') ledger,
     (SELECT count(*)::int FROM pkg_handover_records WHERE packing_code=$1) handovers,
     (SELECT count(*)::int FROM pkg_packing_events WHERE packing_id=$2 AND event_type='COMMIT_RECEIPT') receipts,
     (SELECT count(*)::int FROM pkg_packing_operations WHERE packing_id=$2 AND action='CONFIRM' AND idempotency_key=$3) operations`,[f.prefix,f.packingId,key]);
   expect(counts).toEqual({batches:2,ledger:2,handovers:1,receipts:1,operations:1});
   const [handover]=await ds.query('SELECT code,box_count,boxes_json FROM pkg_handover_records WHERE packing_code=$1',[f.prefix]);
   expect(handover.code).toBe(recovered.body.data.result.handoverCode);
   expect(Number(handover.box_count)).toBe(3);
   expect([...handover.boxes_json].sort()).toEqual(confirmation.boxIds);
   const evidence=await ds.query(`SELECT b.batch_no,b.sku_code,b.spec_code,b.qty::int qty,l.id::text ledger_id,l.change_type,l.qty_change::int
     FROM inv_batches b JOIN inv_ledger l ON l.batch_no=b.batch_no AND l.ref_no=$1 AND l.change_type='PACKAGING_INBOUND'
     WHERE b.packaging_batch_ref=$1 ORDER BY b.sku_code`,[f.prefix]);
   expect(evidence).toHaveLength(2);
   expect(evidence.reduce((sum:number,row:any)=>sum+row.qty,0)).toBe(80);
   expect(evidence.every((row:any)=>row.change_type==='PACKAGING_INBOUND'&&row.qty===row.qty_change)).toBe(true);
   expect(recovered.body.data.result.groups.map((g:any)=>[g.batchNo,g.ledgerId,g.qty]).sort()).toEqual(evidence.map((r:any)=>[r.batch_no,r.ledger_id,r.qty]).sort());
   const afterReplay=await ds.query(`SELECT (SELECT count(*)::int FROM inv_batches WHERE packaging_batch_ref=$1) batches,
     (SELECT count(*)::int FROM inv_ledger WHERE ref_no=$1 AND change_type='PACKAGING_INBOUND') ledger,
     (SELECT count(*)::int FROM pkg_handover_records WHERE packing_code=$1) handovers,
     (SELECT count(*)::int FROM pkg_packing_events WHERE packing_id=$2 AND event_type='COMMIT_RECEIPT') receipts`,[f.prefix,f.packingId]);
   expect(afterReplay[0]).toEqual({batches:2,ledger:2,handovers:1,receipts:1});
   const firstGroup=recovered.body.data.result.groups.find((group:any)=>group.outputOrdinals.includes(0));
   const secondGroup=recovered.body.data.result.groups.find((group:any)=>group.outputOrdinals.includes(1));
   await ds.query("UPDATE wms_warehouses SET status='ACTIVE' WHERE warehouse_code=$1",[otherWarehouse]);
   const legacyOnly=f.prefix+'-LEGACY-ONLY',ambiguous=f.prefix+'-AMBIGUOUS';
   // All three legacy rows deliberately point at a valid other group; only the unregistered code may use it.
   for(const code of [pendingAlias,oldThirdCode,legacyOnly,ambiguous]){
     await ds.query('INSERT INTO lbl_records(label_no,batch_no,qty) VALUES($1,$2,$3)',[code,secondGroup.batchNo,secondGroup.qty]);
   }
   await ds.query("INSERT INTO pkg_packing_code_registry(normalized_code,state) VALUES($1,'AMBIGUOUS')",[ambiguous]);
   expect(await traceLabel(' '+pendingAlias+' ')).toMatchObject({status:200,body:{
     found:true, identity:{kind:'ALIAS'}, packaging:{packingCode:f.prefix,outputOrdinal:0,receiptState:'RECORDED'},
     outputGroup:{batchNo:firstGroup.batchNo,ledgerId:firstGroup.ledgerId,qty:60,outputOrdinals:[0]},
     inventory:{mappingPrecision:'OUTPUT_GROUP'}, downstream:{precision:'BATCH_ALLOCATION'},
   }});
   expect(await traceLabel(voided.labelCode)).toMatchObject({status:200,body:{
     found:true,identity:{kind:'CANONICAL'},outputGroup:{batchNo:secondGroup.batchNo,ledgerId:secondGroup.ledgerId},
   }});
   expect(await traceLabel(legacyOnly)).toMatchObject({status:200,body:{
     found:true,packaging:{precision:'LEGACY_BATCH_ONLY'},label:{batch_no:secondGroup.batchNo},
   }});
   expect(await traceLabel(oldThirdCode)).toEqual({status:200,body:{
     found:false,entry:'label',key:oldThirdCode,registryState:'RETIRED',
   }});
   expect(await traceLabel(ambiguous)).toEqual({status:200,body:{found:false,entry:'label',key:ambiguous}});
   expect((await traceLabel(pendingAlias,'NONE')).status).toBe(401);
   expect((await traceLabel(pendingAlias,'OP_E')).status).toBe(403);
   for(const account of ['P4_OTHER_WAREHOUSE','P4_FOREIGN','NO_SCOPE']){
     expect(await traceLabel(pendingAlias,account)).toEqual({status:200,body:{found:false,entry:'label',key:pendingAlias}});
     expect(await traceLabel(legacyOnly,account)).toEqual({status:200,body:{found:false,entry:'label',key:legacyOnly}});
     expect(await traceLabel(oldThirdCode,account)).toEqual({status:200,body:{found:false,entry:'label',key:oldThirdCode}});
   }

   const batchSummaryPath='inventory/batches/summary';
   expect(await apiGet(batchSummaryPath)).toMatchObject({status:200,body:{data:{
     recent:expect.arrayContaining([expect.objectContaining({batch_no:firstGroup.batchNo})]),
   }}});
   const inventoryPath='v2/analytics/inventory?'+new URLSearchParams({companyCode:f.company,warehouseCode:f.warehouse});
   expect(await apiGet(inventoryPath)).toMatchObject({status:200,body:{status:'AVAILABLE',costPendingQuantity:80,capitalOccupation:null}});
   const {day}= (await ds.query("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date)::text AS day"))[0];
   const closePath='stocktake/daily-close?'+new URLSearchParams({warehouse_code:f.warehouse,date:day});
   expect(await apiGet(closePath)).toMatchObject({status:200,body:{data:{company:f.company}}});
   const financePath='v2/inventory/production-finance-review?'+new URLSearchParams({view:'history',documentNo:f.prefix});
   expect(await apiGet(financePath)).toMatchObject({status:200,body:{rows:[],hasMore:false}});
   for(const account of ['P4_OTHER_WAREHOUSE','P4_FOREIGN','NO_SCOPE']){
     expect(await apiGet(batchSummaryPath,account)).toMatchObject({status:200,body:{data:{recent:[]}}});
     expect((await apiGet(inventoryPath,account)).status).toBe(403);
     expect((await apiGet(closePath,account)).status).toBe(403);
     const finance=await apiGet(financePath,account);
     expect(finance.status===403 || (finance.status===200 && finance.body.rows.length===0)).toBe(true);
   }

 });
 it('permission version revocation invalidates existing authentication',async()=>{await ds.query('UPDATE sys_user SET perms_version=perms_version+1 WHERE user_id=$1',[accounts.get('OP_V')!.id]);expect((await get('history')).status).toBe(401);});
});
