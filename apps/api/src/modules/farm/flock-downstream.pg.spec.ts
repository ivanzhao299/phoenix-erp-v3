import {sharedBatches,QuantitySnapshot} from '../product-master/services/quantity-contract';
import {EggWithdrawalReview1795478400000} from '../../database/migrations/1795478400000-EggWithdrawalReview';
import {EggWithdrawalReviewService} from './egg-withdrawal-review.service';
import {freezeOwnedFlockClock} from '../../test-fixtures/flock-business-clock';
import {ImmuneService} from './immune.service';
import {MedicationRecordService} from './medication-record.service';
import {FlockLifecycleService} from './flock-lifecycle.service';
import {inheritFlockProductionSources,recordFlockProductionSources} from './flock-production-source';
import {FlockActivitySources1794902000000} from '../../database/migrations/1794902000000-FlockActivitySources';
import 'reflect-metadata';
import {DataSource} from 'typeorm';
import {readFileSync} from 'fs';
import {resolve} from 'path';
import {WmsService} from '../wms/wms.service';
import {TraceabilityService} from '../traceability/traceability.service';
import {FlockBaseSchema1794899000000} from '../../database/migrations/1794899000000-FlockBaseSchema';
import {FlockLifecycleLedger1794900000000} from '../../database/migrations/1794900000000-FlockLifecycleLedger';
import {FlockProductionProvenance1794901000000} from '../../database/migrations/1794901000000-FlockProductionProvenance';
import {OfficialInventoryCutover1794971000000} from '../../database/migrations/1794971000000-OfficialInventoryCutover';
const url=process.env.FLOCK_DOWNSTREAM_PG_URL;const suite=url?describe:describe.skip;
suite('actual WMS transfer and trace on owned PostgreSQL',()=>{
 let releaseBusinessClock:(()=>void)|undefined;
 let db:DataSource,wms:WmsService,trace:TraceabilityService;
 const scope=(farm:string)=>({isGlobal:false,allowedCompanyCodes:['CB'],allowedWarehouseCodes:['WB'],allowedBreedingFarmCodes:[farm],allowedBreedingSiteCodes:[],allowedBreedingCompanyCodes:[]}) as any;
 beforeAll(async()=>{
  const u=new URL(url!);if(u.hostname!=='127.0.0.1'||u.pathname!=='/phoenix_flock_downstream')throw Error('Owned loopback downstream fixture required');
  db=await new DataSource({type:'postgres',url,synchronize:false,migrationsRun:false,installExtensions:false}).initialize();
  releaseBusinessClock=freezeOwnedFlockClock(url!);
  const dict=readFileSync(resolve(__dirname,'../../../ddl/19_seed_sys_dict.sql'),'utf8');const at=dict.indexOf('CREATE TABLE IF NOT EXISTS sys_dict');await db.query(dict.slice(at,dict.indexOf(');',at)+2));await db.query('CREATE UNIQUE INDEX IF NOT EXISTS downstream_dict_key ON sys_dict(dict_type,dict_code)');
  const q=db.createQueryRunner();await new FlockBaseSchema1794899000000().up(q);await new FlockLifecycleLedger1794900000000().up(q);await new FlockProductionProvenance1794901000000().up(q);await new FlockActivitySources1794902000000().up(q);await q.release();
  await db.query(`CREATE TABLE IF NOT EXISTS inv_batches(batch_no text PRIMARY KEY,product_code text,sku_code text,material_code text,item_type text,material_type text,unit text,qty numeric,qty_available numeric,status text,inventory_class text,warehouse_code text,location_code text,expire_date date,store_code text,company_code text,inbound_date date,grade_code_std text,spec_code text,quality_grade text,packaging_spec text,egg_date date,legacy_source text,base_quantity_version int,packaging_batch_ref text,collection_batch_ref text,variety_code text,source_profile_code text,source_profile_snapshot jsonb,source_type text,source_no text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
   CREATE TABLE IF NOT EXISTS inv_ledger(id bigserial PRIMARY KEY,batch_no text,change_type text,qty_change numeric,operator text,store_code text,ref_no text,note text,quality_grade text,company_code text,sku_code text,material_code text,warehouse_code text,business_type text,unit text,created_at timestamptz DEFAULT now());
   CREATE TABLE IF NOT EXISTS wms_warehouses(warehouse_code text PRIMARY KEY,company_code text,domain text,owner_store_id int);
   CREATE TABLE IF NOT EXISTS store_master(id int PRIMARY KEY,store_code text,status text);
   CREATE TABLE IF NOT EXISTS wms_transfer(transfer_no text PRIMARY KEY,status text,from_warehouse text,to_warehouse text,to_location text,in_transit_qty numeric,received_qty numeric,difference_qty numeric,dispatched_at timestamptz,dispatched_by text,received_at timestamptz,received_by text,completed_at timestamptz,updated_at timestamptz DEFAULT now());
   CREATE TABLE IF NOT EXISTS wms_transfer_items(id bigserial PRIMARY KEY,transfer_no text,source_batch_no text,expected_qty numeric,source_snapshot jsonb,target_batch_no text,received_qty numeric,damaged_qty numeric,difference_qty numeric,updated_at timestamptz DEFAULT now());
   CREATE TABLE IF NOT EXISTS wms_transfer_discrepancies(id bigserial PRIMARY KEY,transfer_no text,transfer_item_id bigint,discrepancy_type text,qty numeric,note text,created_by text);
   CREATE TABLE IF NOT EXISTS product_skus(sku_code text PRIMARY KEY,product_code text,grade_code text,spec_code text,variety_code text,status text,effective_date date,expire_date date);
   CREATE TABLE IF NOT EXISTS mst_products(product_code text PRIMARY KEY,variety_code text,status text);
   CREATE TABLE IF NOT EXISTS product_grades(grade_code text PRIMARY KEY,status text,is_saleable boolean,is_storable boolean);
   CREATE TABLE IF NOT EXISTS packaging_specs(spec_code text PRIMARY KEY,status text,base_unit text);
   CREATE TABLE IF NOT EXISTS md_product_varieties(variety_code text PRIMARY KEY,status text,effective_date date,expire_date date);
   CREATE TABLE IF NOT EXISTS sys_organizations(org_code text PRIMARY KEY,org_type text,status text,company_code text);
   CREATE TABLE IF NOT EXISTS md_sku_org_scope(sku_code text,scope_type text,scope_code text,status text,sale_enabled boolean,stock_enabled boolean,effective_date date,expire_date date);
   CREATE TABLE IF NOT EXISTS pkg_packing_records(code text PRIMARY KEY,is_test boolean,production_date date,grading_code text,grading_codes_json jsonb,batches_json jsonb,total_boxes int,total_eggs int,shift_id int,status text,void_reason text);
   CREATE TABLE IF NOT EXISTS pkg_work_shifts(id int PRIMARY KEY,shift_code text,site_id text,line_id text,operator_name text,supervisor_name text,production_date date,is_test boolean);
   CREATE TABLE IF NOT EXISTS pkg_grading_records(id int PRIMARY KEY,code text,source_batch_code text,production_date date,outputs_json jsonb,total_output int,status text,is_test boolean,created_at timestamptz DEFAULT now());
   CREATE TABLE IF NOT EXISTS pkg_source_batches(id int PRIMARY KEY,batch_code text,house_code text,flock_code text,lay_date date,production_date date,received_qty int,batch_status text,is_test boolean,created_at timestamptz DEFAULT now());
   CREATE TABLE IF NOT EXISTS pkg_grading_source_links(grading_id int,source_batch_id int);`);
  const mvp=readFileSync(resolve(__dirname,'../../database/migrations/1789600400000-AddProductionManagementMvpSchema.ts'),'utf8');
  for(const table of ['brd_medications','brd_vaccinations','brd_medication_records','brd_medication_issue_lines']){const begin=mvp.indexOf('CREATE TABLE IF NOT EXISTS '+table+' (');const end=mvp.indexOf('`);',begin);await db.query(mvp.slice(begin,end));}
  const vaccineLines=readFileSync(resolve(__dirname,'../../database/migrations/1794402000000-AddImmuneIssueLines.ts'),'utf8');const begin=vaccineLines.indexOf('CREATE TABLE IF NOT EXISTS brd_vaccination_issue_lines (');await db.query(vaccineLines.slice(begin,vaccineLines.indexOf('`);',begin)));
  await db.query(`ALTER TABLE store_master ADD COLUMN IF NOT EXISTS company_code text;
   ALTER TABLE brd_medications ADD COLUMN IF NOT EXISTS product_type text,ADD COLUMN IF NOT EXISTS unit_code text,ADD COLUMN IF NOT EXISTS default_withdraw_days int;
   ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS next_due_date date,ADD COLUMN IF NOT EXISTS inventory_batch_no text;
   ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS status text,ADD COLUMN IF NOT EXISTS type text,ADD COLUMN IF NOT EXISTS site_code text;
   ALTER TABLE inv_batches ADD COLUMN IF NOT EXISTS manufacturer_batch_no text;
   ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS log_date date,ADD COLUMN IF NOT EXISTS house_code text;
   CREATE TABLE IF NOT EXISTS file_metadata(file_id text PRIMARY KEY,status text,deleted_at timestamptz,visibility text,mime_type text,module_code text,owner_type text,owner_id text,company_code text,store_code text,uploaded_by text);`);
  const cutover=db.createQueryRunner();
  try { await new OfficialInventoryCutover1794971000000().up(cutover); }
  finally { await cutover.release(); }
  wms=new WmsService(db.manager,{get:()=>({isGlobal:true,allowedWarehouseCodes:[]})} as never);trace=new TraceabilityService(db,{} as never);
 });
 beforeEach(async()=>{
  await db.query(`TRUNCATE file_metadata,brd_vaccination_issue_lines,brd_medication_issue_lines,brd_vaccinations,brd_medication_records,brd_medications,brd_flock_activity_sources,brd_flock_sales_settlements,brd_flock_admission_receipts,brd_flock_held_balances,brd_flock_document_audits,brd_flock_balances,brd_flock_daily_balances,brd_flock_house_states,inv_flock_source_links,brd_egg_source_receipts,brd_egg_day_routes,brd_flock_events,brd_flock_occupancies,brd_flock_documents,brd_daily_logs,brd_flocks,brd_houses,brd_farms,inv_batches,inv_ledger,wms_transfer_items,wms_transfer_discrepancies,wms_transfer,wms_warehouses,store_master,md_sku_org_scope,product_skus,mst_products,product_grades,packaging_specs,md_product_varieties,sys_organizations,pkg_packing_records,pkg_work_shifts,pkg_grading_records,pkg_source_batches,pkg_grading_source_links CASCADE;
   INSERT INTO brd_farms(farm_code,farm_name,company_code,mapped_site_code,status) VALUES('A','original farm','CA','SA','ACTIVE'),('X','current other farm','CA','SX','ACTIVE');
   INSERT INTO brd_houses(house_code,farm_code,max_capacity,status) VALUES('HA','A',100,'ACTIVE'),('HX','X',100,'ACTIVE');
   INSERT INTO brd_flocks(flock_no,house_code,farm_code,company_code,breed_code,current_qty,status) VALUES('FA','HX','X','CA','BREED',70,'LAYING');
   INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,flock_no,business_date,payload,status,created_by) VALUES('D','COUNT','fixture','BASELINE','CA','A','HA','FA','2026-11-10','{}','POSTED','keeper');
   INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,ended_on,opened_document_id,capacity_snapshot) VALUES('O','FA','HA','CA','A','SA','2026-11-10','2026-11-12','D',100);
   INSERT INTO brd_daily_logs(id,flock_no,house_code,farm_code,company_code,site_code,log_date,shift,occupancy_id,eggs_produced,eggs_by_grade) VALUES(1,'FA','HA','A','CA','SA','2026-11-11','DAILY','O',10,'{"GRADE_1":10}');
   INSERT INTO wms_warehouses(warehouse_code,company_code,domain,owner_store_id) VALUES('WA','CA','OPERATIONAL',NULL),('WB','CB','OPERATIONAL',NULL);
   INSERT INTO mst_products VALUES('P','VARIANT-1','ACTIVE');INSERT INTO product_grades VALUES('GRADE_1','ACTIVE',true,true),('BROKEN','ACTIVE',true,true);INSERT INTO packaging_specs VALUES('SP','ACTIVE','枚');
   INSERT INTO md_product_varieties VALUES('VARIANT-1','ACTIVE',NULL,NULL);INSERT INTO sys_organizations VALUES('CA','COMPANY','ACTIVE','CA'),('CB','COMPANY','ACTIVE','CB');
   INSERT INTO product_skus VALUES('SKU-A','P','GRADE_1','SP','VARIANT-1','ACTIVE',NULL,NULL),('SKU-BROKEN','P','BROKEN','SP','VARIANT-1','ACTIVE',NULL,NULL);
   INSERT INTO md_sku_org_scope(sku_code,scope_type,scope_code,status,sale_enabled,stock_enabled) SELECT s,'COMPANY',c,'ACTIVE',true,true FROM unnest(ARRAY['SKU-A','SKU-BROKEN']) s CROSS JOIN unnest(ARRAY['CA','CB']) c;
   INSERT INTO inv_batches(batch_no,product_code,sku_code,unit,qty,qty_available,status,inventory_class,warehouse_code,company_code,store_code,grade_code_std,quality_grade,spec_code,packaging_spec,egg_date,base_quantity_version,variety_code,source_profile_code,source_profile_snapshot) VALUES('SOURCE','P','SKU-A','枚',10,10,'AVAILABLE','NORMAL','WA','CA','ALL','GRADE_1','GRADE_1','SP','SP','2026-11-11',1,'VARIANT-1','PROFILE-A','{"sourceKind":"VARIANT","profile":"PROFILE-A"}');
   INSERT INTO inv_flock_source_links(id,batch_no,daily_log_id,occupancy_id,flock_no,house_code,company_code,production_date,source_key,source_input_qty,batch_output_qty,allocated_output_qty,precision,source_profile_snapshot,origin_batch_no) VALUES('LINK','SOURCE',1,'O','FA','HA','CA','2026-11-11','TEMP:SOURCE',10,10,10,'EXACT','{"profile":"PROFILE-A"}','SOURCE');
   INSERT INTO wms_transfer(transfer_no,status,from_warehouse,to_warehouse) VALUES('TR','PENDING','WA','WB');INSERT INTO wms_transfer_items(transfer_no,source_batch_no,expected_qty) VALUES('TR','SOURCE',10);SELECT setval(pg_get_serial_sequence('brd_daily_logs','id'),1,true);`);
 });
 afterAll(async()=>{if(db?.isInitialized)await db.destroy();releaseBusinessClock?.();});
 it('dispatches then signs real normal and BROKEN batches, preserving exact source while conserving stock and using the BROKEN SKU',async()=>{
  await wms.dispatchTransfer('TR',{username:'dispatcher'});await wms.receiveTransfer('TR',{items:[{batch_no:'SOURCE',received_qty:8,damaged_qty:2,note:'Actual signed transit damage'}]},{username:'receiver'});
  const rows=await db.query("SELECT * FROM inv_batches WHERE warehouse_code='WB' ORDER BY quality_grade");expect(rows).toHaveLength(2);expect(rows.map((r:any)=>Number(r.qty_available)).reduce((a:number,b:number)=>a+b,0)).toBe(10);
  const broken=rows.find((r:any)=>r.quality_grade==='BROKEN');const normal=rows.find((r:any)=>r.quality_grade==='GRADE_1');expect(broken).toMatchObject({sku_code:'SKU-BROKEN',grade_code_std:'BROKEN',inventory_class:'DEFECT_SALE',status:'AVAILABLE',company_code:'CB',variety_code:'VARIANT-1',source_profile_code:'PROFILE-A',spec_code:'SP',packaging_spec:'SP',base_quantity_version:1});expect(normal).toMatchObject({sku_code:'SKU-A',quality_grade:'GRADE_1',company_code:'CB'});
  for(const row of rows){expect(row.source_profile_snapshot).toEqual({sourceKind:'VARIANT',profile:'PROFILE-A'});const [link]=await db.query('SELECT * FROM inv_flock_source_links WHERE batch_no=$1',[row.batch_no]);expect(link).toMatchObject({flock_no:'FA',house_code:'HA',company_code:'CA',occupancy_id:'O',origin_batch_no:'SOURCE',precision:'INHERITED',allocated_output_qty:null});}
  const [source]=await db.query("SELECT qty_available FROM inv_batches WHERE batch_no='SOURCE'");expect(Number(source.qty_available)).toBe(0);expect((await db.query('SELECT SUM(qty_change) AS n FROM inv_ledger'))[0].n).toBe('0');
  const visible=await trace.traceByBatch(normal.batch_no,['CB'],scope('A'));expect(visible.production).toMatchObject({provenanceStatus:'VERIFIED_OCCUPANCY',allocationPrecision:'RELATED_INPUT_OR_INHERITED'});expect(visible.production.flocks[0]).toEqual({flock_no:'FA',breed_type:null,breed_code:'BREED'});expect(visible.production.dailyLogs[0].log_date).toBe('2026-11-11');expect(visible.production.houses).toEqual([{house_code:'HA',farm_code:'A'}]);
  const denied=await trace.traceByBatch(normal.batch_no,['CB'],scope('X'));expect(denied.production).toMatchObject({provenanceStatus:'RESTRICTED_SOURCE',provenance:[],dailyLogs:[],flocks:[],houses:[]});
 });
 it('rolls back normal receipt and every inherited source if the BROKEN SKU is unavailable',async()=>{
  await wms.dispatchTransfer('TR',{username:'dispatcher'});await db.query("UPDATE product_skus SET status='INACTIVE' WHERE sku_code='SKU-BROKEN'");await expect(wms.receiveTransfer('TR',{items:[{batch_no:'SOURCE',received_qty:8,damaged_qty:2}]},{username:'receiver'})).rejects.toThrow('BROKEN SKU');expect((await db.query("SELECT COUNT(*)::int AS n FROM inv_batches WHERE warehouse_code='WB'"))[0].n).toBe(0);expect((await db.query('SELECT COUNT(*)::int AS n FROM inv_flock_source_links'))[0].n).toBe(1);expect((await db.query("SELECT status FROM wms_transfer WHERE transfer_no='TR'"))[0].status).toBe('IN_TRANSIT');
 });
 it('carries real medication withdrawal and a pending vaccine plan through actual whole transfer, using current caretaker and preserving original positions',async()=>{
  await db.query(`INSERT INTO brd_farms(farm_code,farm_name,company_code,mapped_site_code,status) VALUES('Y','next farm','CA','SY','ACTIVE');INSERT INTO brd_houses(house_code,farm_code,max_capacity,status) VALUES('HY','Y',100,'ACTIVE');
   INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,site_code,house_code,flock_no,business_date,payload,status,created_by) VALUES('D2','COUNT2','fixture2','BASELINE','CA','X','SX','HX','FA','2026-11-12','{}','POSTED','keeper');
   INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,opened_document_id,capacity_snapshot) VALUES('O2','FA','HX','CA','X','SX','2026-11-12','D2',100);
   INSERT INTO brd_flock_events(id,document_id,line_no,flock_no,occupancy_id,company_code,farm_code,site_code,house_code,business_date,kind,quantity_delta,actor,approved_by) VALUES('EV2','D2',1,'FA','O2','CA','X','SX','HX','2026-11-12','BASELINE',70,'keeper','reviewer');
   INSERT INTO brd_flock_balances(flock_no,company_code,farm_code,site_code,house_code,quantity,baseline_on,last_business_date) VALUES('FA','CA','X','SX','HX',70,'2026-11-12','2026-11-12');
   INSERT INTO brd_flock_house_states(house_code,state,document_id) VALUES('HX','OCCUPIED','D2');
   INSERT INTO file_metadata VALUES('FILE-X','ACTIVE',NULL,'PROTECTED','application/pdf','FLOCK_LIFECYCLE','HOUSE','HX','CA','SX','keeper'),('FILE-Y','ACTIVE',NULL,'PROTECTED','application/pdf','FLOCK_LIFECYCLE','HOUSE','HY','CA','SY','keeper');
   INSERT INTO brd_medications(medication_code,medication_name,status,store_code,product_type,unit_code,default_withdraw_days) VALUES('VAC','approved vaccine','ACTIVE','ALL','VACCINE','UNIT',0),('MED','approved medicine','ACTIVE','ALL','MEDICATION','UNIT',3);
   INSERT INTO wms_warehouses(warehouse_code,company_code,domain,status,type,site_code) VALUES('WX','CA','OPERATIONAL','ACTIVE','MEDICINE','SX'),('WY','CA','OPERATIONAL','ACTIVE','MEDICINE','SY');
   INSERT INTO inv_batches(batch_no,product_code,qty,qty_available,status,warehouse_code,company_code,store_code,expire_date) VALUES('MED-STOCK','MED',10,10,'AVAILABLE','WX','CA','SX','2027-11-01'),('VAC-STOCK','VAC',10,10,'AVAILABLE','WY','CA','SY','2027-11-01');`);
  const actorScope=(farm:string,site:string,wh:string)=>({get:()=>({isGlobal:false,allowedCompanyCodes:['CA'],allowedFarmCodes:[farm],allowedSiteCodes:[site],allowedWarehouseCodes:[wh],allowedBreedingFarmCodes:[farm],allowedBreedingSiteCodes:[],allowedBreedingCompanyCodes:[]})}) as any;
  const immuneX=new ImmuneService(db,actorScope('X','SX','WX'));const medicine=new MedicationRecordService(db,actorScope('X','SX','WX'));
  const plan=await immuneX.create({flock_no:'FA',house_code:'HX',farm_code:'X',site_code:'SX',company_code:'CA',vaccine_code:'VAC',plan_date:'2026-11-17',planned_heads:5,dose_value:1},'keeper');
  const med=await medicine.create({flock_no:'FA',house_code:'HX',farm_code:'X',site_code:'SX',company_code:'CA',medication_code:'MED',start_date:'2026-11-17',end_date:'2026-11-17',withdraw_days:3,actual_qty:1,inventory_batch_no:'MED-STOCK'},'keeper');expect(med.id).toBeTruthy();
  const lifecycle=new FlockLifecycleService(db.manager);const global={isGlobal:true,farmCode:null,siteCode:null};let n=0;
  const post=async(body:any)=>{let d=await lifecycle.create({sourceKey:'HEALTH-'+(++n),houseCode:'HY',businessDate:'2026-11-17',expectedVersion:0,reason:'real fixture caretaker transfer',responsible:'keeper',evidence:[body.houseCode==='HX'?'FILE-X':'FILE-Y'],...body},global,{id:'keeper',admin:true});d=await lifecycle.transition(d.id,'submit',0,global,{id:'keeper',admin:true});d=await lifecycle.transition(d.id,'approve',d.version,global,{id:'reviewer',admin:true});return lifecycle.transition(d.id,'post',d.version,global,{id:'keeper',admin:true});};
  await post({kind:'CLEAN_START',expectedHouseVersion:0});await post({kind:'CLEAN_ACCEPT',expectedHouseVersion:0});await post({kind:'TRANSFER',houseCode:'HX',flockNo:'FA',targetHouseCode:'HY'});
  await expect(medicine.cancel(med.id,'old-caretaker')).rejects.toThrow('无权');
  await expect(immuneX.execute(plan.id,{actual_heads:5,inventory_batch_no:'VAC-STOCK'},'old-caretaker')).rejects.toThrow('无权');
  const immuneY=new ImmuneService(db,actorScope('Y','SY','WY'));await immuneY.execute(plan.id,{actual_heads:5,inventory_batch_no:'VAC-STOCK'},'new-caretaker');await immuneY.execute(plan.id,{actual_heads:5,inventory_batch_no:'VAC-STOCK'},'new-caretaker');
  expect((await db.query('SELECT house_code,farm_code,status FROM brd_vaccinations WHERE id=$1',[plan.id]))[0]).toEqual({house_code:'HX',farm_code:'X',status:'EXECUTED'});
  const links=await db.query('SELECT activity_type,house_code FROM brd_flock_activity_sources ORDER BY activity_type');expect(links).toEqual([{activity_type:'IMMUNE_EXECUTION',house_code:'HY'},{activity_type:'IMMUNE_PLAN',house_code:'HX'},{activity_type:'MEDICATION',house_code:'HX'}]);
  expect(Number((await db.query("SELECT qty_available FROM inv_batches WHERE batch_no='VAC-STOCK'"))[0].qty_available)).toBe(5);expect(Number((await db.query("SELECT qty_available FROM inv_batches WHERE batch_no='MED-STOCK'"))[0].qty_available)).toBe(9);
  const care=await lifecycle.care({isGlobal:false,farmCode:'Y',siteCode:null,farmCodes:['Y'],companyCodes:[]});expect(care.medications[0]).toMatchObject({house_code:'HX',current_house_code:'HY',withdraw_until:'2026-11-20'});
  const [o]=await db.query("SELECT id FROM brd_flock_occupancies WHERE house_code='HY' AND ended_on IS NULL");await db.query(`INSERT INTO brd_daily_logs(flock_no,house_code,farm_code,company_code,log_date,shift,occupancy_id,eggs_by_grade,eggs_produced) VALUES('FA','HY','Y','CA','2026-11-17','DAILY',$1,'{"GRADE_1":5}',5)`,[o.id]);
  await expect(db.transaction(m=>recordFlockProductionSources(m,{companyCode:'CA',eggDate:'2026-11-17',qty:5,qualityGrade:'GRADE_1',sourceType:'TEMP_PRODUCTION'},'WITHDRAWAL-BLOCK',[{houseCode:'HY',profileCode:'PROFILE-A'}],global))).rejects.toThrow('休药隔离期');expect((await db.query('SELECT COUNT(*)::int AS n FROM brd_egg_day_routes'))[0].n).toBe(0);
 });
 it('keeps transferred caretaker lists scoped to the new location and historical snapshots intact', async () => {
  await db.query(`INSERT INTO brd_flock_balances(flock_no,company_code,farm_code,site_code,house_code,quantity,baseline_on,last_business_date)
    VALUES('FA','CA','X','SX','HX',70,'2026-11-12','2026-11-12');
    INSERT INTO brd_medication_records(flock_no,house_code,farm_code,company_code,site_code,start_date,status)
      VALUES('FA','HA','A','CA','SA','2026-11-11','USING');
    INSERT INTO brd_vaccinations(flock_no,house_code,farm_code,company_code,site_code,plan_date,status)
      VALUES('FA','HA','A','CA','SA','2026-11-18','PLANNED')`);
  const cls = {get:()=>scope('X')} as never;
  const care = new MedicationRecordService(db,cls);
  expect(await care.withdrawals({farm_code:'X'})).toEqual([expect.objectContaining({house_code:'HA',current_house_code:'HX',effective_status:'USING'})]);
  expect(await new ImmuneService(db,cls).list({farm_code:'X'})).toEqual([expect.objectContaining({house_code:'HA',current_house_code:'HX'})]);
  expect(await care.list({farm_code:'A'})).toEqual([]);
  expect(await new MedicationRecordService(db,{get:()=>scope('Y')} as never).withdrawals()).toEqual([]);
 });
 it('requires independent signed clearance for each cancelled course and original laying day before downstream use',async()=>{
  const runner=db.createQueryRunner();
  await runner.startTransaction();
  try {
    const m=runner.manager;
    await m.query(`CREATE TABLE production_raw_receipts(id int PRIMARY KEY,production_date date);
      CREATE TABLE production_raw_receipt_segments(id int PRIMARY KEY,receipt_id int,flock_no text);
      CREATE TABLE production_conversion_inputs(id int,raw_segment_id int);
      CREATE TABLE pkg_handover_records(packing_code text);
      CREATE TABLE wms_stocktake(stocktake_no text,status text,auditor text,warehouse_code text,updated_at timestamptz);
      CREATE TABLE sal_order_item_batch_allocations(batch_no text,reserved_qty numeric,outbound_qty numeric,released_qty numeric);
      CREATE TABLE production_inbound_documents(id int,kind text,state text,document_no text,approved_by text,created_by text,approved_hash text,content_hash text);
      CREATE TABLE production_inbound_allocations(id int,original_allocation_id int,document_id int,line_no int,quantity numeric,direction int);
      CREATE TABLE production_inbound_lines(document_id int,line_no int,inventory_ledger_id int,batch_no text,quantity numeric);
      UPDATE brd_daily_logs SET shift='AM' WHERE id=1;
      ALTER TABLE file_metadata ADD COLUMN checksum text;
      INSERT INTO production_raw_receipts VALUES(1,'2026-11-11');
      INSERT INTO production_raw_receipt_segments VALUES(1,1,'FA');`);
    const migration=new EggWithdrawalReview1795478400000();
    await migration.up(runner);
    await migration.down(runner);
    await migration.up(runner);
    const review=new EggWithdrawalReviewService(m);
    const global={isGlobal:true,farmCode:null,siteCode:null}, outside={isGlobal:false,farmCode:'Y',siteCode:null};
    const vet={id:'fixture-vet',accountId:'11'}, qa={id:'fixture-qa',accountId:'22'};
    const reader=db.createQueryRunner();
    await reader.startTransaction();
    try {
      await reader.query("SELECT pg_advisory_xact_lock_shared(hashtext('vet:egg-flock'),hashtext('FA'))");
      await expect(m.transaction(tx=>tx.query("INSERT INTO brd_medication_records(flock_no,start_date,status) VALUES('FA','2026-11-10','USING')"))).rejects.toThrow('请重试');
      await expect(m.transaction(tx=>tx.query("UPDATE brd_daily_logs SET eggs_produced=11 WHERE id=1"))).rejects.toThrow('请重试');
    } finally {await reader.rollbackTransaction();await reader.release();}
    await m.query(`INSERT INTO pkg_source_batches(id,batch_code,house_code,flock_code,lay_date,production_date,is_test,batch_status)
      VALUES(7,'OLD-EGGS','HA','FA','2026-11-11','2026-11-14',false,'RECEIVED'),(8,'OLD-CONFLICT','HA','FB','2026-11-11','2026-11-14',false,'RECEIVED');
      INSERT INTO pkg_grading_records(id,code,is_test) VALUES(7,'G-OLD',false),(8,'G-CONFLICT',false);
      INSERT INTO pkg_grading_source_links VALUES(7,7),(8,8);
      INSERT INTO pkg_packing_records(code,is_test,grading_code) VALUES('P-OLD',false,'G-OLD'),('P-CONFLICT',false,'G-CONFLICT');
      INSERT INTO inv_batches(batch_no,packaging_batch_ref,qty,qty_available,status)
        VALUES('LEGACY-PACK','P-OLD',4,4,'AVAILABLE'),('LEGACY-MISSING','UNKNOWN',3,3,'AVAILABLE'),('WRONG-FLOCK','P-CONFLICT',3,3,'AVAILABLE')`);
    expect((await m.query("SELECT vet_egg_batch_held('LEGACY-PACK') AS held,vet_egg_batch_held('LEGACY-MISSING') AS unresolved,vet_egg_batch_held('WRONG-FLOCK') AS conflict"))[0])
      .toEqual({held:false,unresolved:true,conflict:true});
    const [course]=await m.query(`INSERT INTO brd_medication_records(flock_no,house_code,medication_code,start_date,end_date,withdraw_until,status)
      VALUES('FA','HA','TEST','2026-11-10','2026-11-10','2026-11-12','CLEARED') RETURNING id`);
    expect((await m.query("SELECT vet_egg_batch_held('LEGACY-PACK') AS held"))[0].held).toBe(true);
    await expect(m.transaction(tx=>tx.query("UPDATE inv_batches SET qty=3,qty_available=3 WHERE batch_no='LEGACY-PACK'"))).rejects.toThrow('休药隔离期');
    await m.query("INSERT INTO inv_batches(batch_no,qty,qty_available,source_type,status,warehouse_code) VALUES('OLD-RETURN',2,0,'RETURN','QUARANTINE','WA')");
    await inheritFlockProductionSources(m,'LEGACY-PACK','OLD-RETURN',2);
    await expect(m.transaction(tx=>tx.query("UPDATE inv_batches SET status='AVAILABLE',qty_available=2 WHERE batch_no='OLD-RETURN'"))).rejects.toThrow('休药隔离期');
    const held=async(day:string)=>(await m.query("SELECT vet_egg_day_held('FA',$1) AS held",[day]))[0].held;
    expect(await held('2026-11-09')).toBe(false);expect(await held('2026-11-12')).toBe(true);expect(await held('2026-11-13')).toBe(false);
    const debit=()=>m.transaction(tx=>tx.query("UPDATE inv_batches SET qty=qty-1,qty_available=qty_available-1 WHERE batch_no='SOURCE'"));
    await expect(debit()).rejects.toThrow('休药隔离期');
    expect((await m.query("SELECT vet_egg_batch_held('SOURCE') AS held"))[0].held).toBe(true);
    await m.query(`INSERT INTO inv_batches(batch_no,product_code,grade_code_std,unit,base_quantity_version,qty,qty_available,company_code,warehouse_code,status)
      VALUES('UNAFFECTED','P','GRADE_1','枚',1,5,5,'CA','WA','AVAILABLE')`);
    const stock=await sharedBatches(m,'CA',['WA'],{productCode:'P',gradeCode:'GRADE_1',baseUnit:'枚'} as QuantitySnapshot);
    expect(stock.map((b:{batch_no:string})=>b.batch_no)).toEqual(['UNAFFECTED']);
    await expect(m.transaction(tx=>tx.query('INSERT INTO production_conversion_inputs VALUES(1,1)'))).rejects.toThrow('休药隔离期');
    await expect(m.transaction(tx=>tx.query("INSERT INTO production_raw_receipt_segments VALUES(2,1,'FA')"))).rejects.toThrow('休药隔离期');
    await m.query(`INSERT INTO pkg_source_batches(id,batch_code,house_code,flock_code,lay_date,production_date,is_test,batch_status)
      VALUES(5,'QC-EGG','HA','FA','2026-11-11','2026-11-14',false,'RECEIVED')`);
    await expect(m.transaction(tx=>tx.query('INSERT INTO pkg_grading_source_links VALUES(1,5)'))).rejects.toThrow('休药隔离期');
    expect(await review.list(outside,'2026-11-11',false)).toEqual([]);
    await expect(review.requestReview(outside,vet,course.id,'1','source checked','11111111-1111-4111-8111-111111111111')).rejects.toThrow('不可见');
    const id=await review.requestReview(global,vet,course.id,'1','source checked','11111111-1111-4111-8111-111111111111');
    expect(await review.requestReview(global,vet,course.id,'1','source checked','11111111-1111-4111-8111-111111111111')).toBe(id);
    expect(await review.list(global,'2026-11-11',true)).toEqual([expect.objectContaining({held:true,review_id:id,house_code:'HA'})]);
    await m.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
      VALUES('E1','ACTIVE','PROTECTED','application/pdf','EGG_WITHDRAWAL','EGG_REVIEW',$1,'CA','SA','fixture-qa','fixture-hash')`,[id]);
    await expect(review.decide(global,vet,id,'RELEASE','E1')).rejects.toThrow('另一实名');
    await expect(review.decide(global,{...qa,impersonatedBy:{id:'root',username:'admin'}},id,'RELEASE','E1')).rejects.toThrow('本人');
    await expect(review.decide(global,qa,id,'RELEASE','E1')).rejects.toThrow('有效用药');
    await expect(review.decide(outside,qa,id,'RETAIN','E1')).rejects.toThrow('不可见');
    await m.query("UPDATE brd_medication_records SET status='CANCELLED' WHERE id=$1",[course.id]);
    await expect(debit()).rejects.toThrow('休药隔离期');
    await expect(review.decide(global,qa,id,'RELEASE','wrong')).rejects.toThrow('凭证');
    await review.decide(global,qa,id,'RELEASE','E1');
    expect(await review.decide(global,qa,id,'RELEASE','E1')).toMatchObject({review_id:id});
    expect(await held('2026-11-11')).toBe(false);expect(await held('2026-11-12')).toBe(true);
    await m.query(`INSERT INTO brd_daily_logs(id,flock_no,house_code,company_code,farm_code,site_code,log_date,shift,occupancy_id,eggs_produced,eggs_by_grade)
      VALUES (2,'FA','HA','CA','A','SA','2026-11-11','PM','O',3,'{"GRADE_1":3}')`);
    expect(await held('2026-11-11')).toBe(true);
    const pm=await review.requestReview(global,vet,course.id,'2','PM checked','22222222-2222-4222-8222-222222222222');
    const proof=async(ref:string,doc:string)=>m.query(`INSERT INTO file_metadata(file_id,status,visibility,mime_type,module_code,owner_type,owner_id,company_code,store_code,uploaded_by,checksum)
      VALUES($1,'ACTIVE','PROTECTED','application/pdf','EGG_WITHDRAWAL','EGG_REVIEW',$2,'CA','SA','fixture-qa','fixture-hash')`,[ref,doc]);
    await proof('PM1',pm);
    await review.decide(global,qa,pm,'RETAIN','PM1');
    expect(await review.requestReview(global,vet,course.id,'2','PM checked',pm)).toBe(pm);
    const pm2=await review.requestReview(global,vet,course.id,'2','PM rechecked','33333333-3333-4333-8333-333333333333');
    await proof('PM2',pm2);await review.decide(global,qa,pm2,'RELEASE','PM2');
    expect(await held('2026-11-11')).toBe(false);
    await debit();
    await m.query('SET CONSTRAINTS vet_verify_disposition IMMEDIATE');
    await m.query('SET CONSTRAINTS vet_verify_disposition DEFERRED');
    const [extra]=await m.query(`INSERT INTO brd_medication_records(flock_no,house_code,start_date,status)
      VALUES('FA','HX','2026-11-11','USING') RETURNING id`);
    await m.query("INSERT INTO inv_batches(batch_no,source_type,status,qty,qty_available,warehouse_code) VALUES('RET-TEST','RETURN','DAMAGED',3,0,'WA')");
    await m.query(`INSERT INTO inv_flock_source_links(id,batch_no,daily_log_id,occupancy_id,flock_no,house_code,company_code,production_date,source_key,source_input_qty,
      batch_output_qty,precision,source_profile_snapshot,origin_batch_no)
      SELECT 'RET-LINK','RET-TEST',daily_log_id,occupancy_id,flock_no,house_code,company_code,production_date,source_key,source_input_qty,3,'INHERITED',source_profile_snapshot,'SOURCE'
      FROM inv_flock_source_links WHERE batch_no='SOURCE'`);
    await expect(m.transaction(tx=>tx.query("UPDATE inv_batches SET status='AVAILABLE',qty_available=3 WHERE batch_no='RET-TEST'"))).rejects.toThrow('休药隔离期');
    for(const [logId,key] of [['1','44444444-4444-4444-8444-444444444444'],['2','55555555-5555-4555-8555-555555555555']]){
      const doc=await review.requestReview(global,vet,extra.id,logId,'dispose source',key);
      await proof('DISPOSE-'+logId,doc);await review.decide(global,qa,doc,'DISPOSE','DISPOSE-'+logId);
    }
    await m.query("INSERT INTO wms_stocktake VALUES('LR-FIXTURE','DONE',NULL,'WA'),('LR-CUSTODY','DONE',NULL,'WA')");
    const scopedWms=new WmsService(m,{get:()=>({isGlobal:true,allowedWarehouseCodes:[]})} as never);
    await scopedWms.approveLoss({loss_no:'LR-FIXTURE',batch_no:'RET-TEST',loss_qty:2,reason:'fixture disposal'},{username:'fixture-keeper'});
    await scopedWms.approveLoss({loss_no:'LR-CUSTODY',batch_no:'OLD-RETURN',loss_qty:1,reason:'fixture quarantine disposal'},{username:'fixture-keeper'});
    expect((await m.query("SELECT qty::int AS qty,qty_available::int AS available,status FROM inv_batches WHERE batch_no='OLD-RETURN'"))[0])
      .toEqual({qty:1,available:0,status:'QUARANTINE'});
    await m.query('SET CONSTRAINTS vet_verify_disposition IMMEDIATE');
    expect((await m.query("SELECT qty::int AS qty,qty_available::int AS available,status FROM inv_batches WHERE batch_no='RET-TEST'"))[0])
      .toEqual({qty:1,available:0,status:'DAMAGED'});
    expect((await m.query("SELECT qty::int AS qty,kind FROM brd_egg_disposition_receipts WHERE batch_no='RET-TEST'"))[0]).toEqual({qty:2,kind:'SCRAP'});
    expect((await m.query("SELECT qty_change::int AS delta FROM inv_ledger WHERE ref_no='LR-FIXTURE'"))[0].delta).toBe(-2);
    await m.query('SET CONSTRAINTS vet_verify_disposition DEFERRED');
    await m.query("SELECT set_config('phoenix.egg_disposition','REVERSAL',true)");
    await m.query("UPDATE inv_batches SET qty=qty-1,qty_available=qty_available-1 WHERE batch_no='SOURCE'");
    await m.query("SELECT set_config('phoenix.egg_disposition','',true)");
    const [reversal]=await m.query(`INSERT INTO inv_ledger(batch_no,change_type,business_type,qty_change,ref_no,operator)
      VALUES('SOURCE','PRODUCTION_INBOUND_REVERSAL','FORMAL_PRODUCTION_REVERSAL',-1,'REV-FIXTURE','fixture-keeper') RETURNING id`);
    await m.query("INSERT INTO production_inbound_documents VALUES(5,'REVERSAL','POSTED','REV-FIXTURE','independent','creator','verified','verified')");
    await m.query("INSERT INTO production_inbound_lines VALUES(5,1,$1,'SOURCE',1)",[reversal.id]);
    await m.query('SET CONSTRAINTS vet_verify_disposition IMMEDIATE');
    expect((await m.query("SELECT kind FROM brd_egg_disposition_receipts WHERE ledger_id=$1",[reversal.id]))[0].kind).toBe('FORMAL_PRODUCTION_REVERSAL');
    expect(await held('2026-11-11')).toBe(true);await expect(debit()).rejects.toThrow('休药隔离期');
  } finally {await runner.rollbackTransaction();await runner.release();}
 });
 it('masks both mixed and empty unverified historical packaging for restricted users',async()=>{
  await db.query(`INSERT INTO pkg_packing_records VALUES('OLD',false,'2026-11-01','G','["G"]','[]',1,10,NULL,'COMPLETED',NULL),('EMPTY',false,'2026-11-01','NONE','["NONE"]','[]',1,10,NULL,'COMPLETED',NULL);
   INSERT INTO pkg_grading_records(id,code,source_batch_code,production_date,total_output,status,is_test) VALUES(1,'G','MIX','2026-11-01',10,'ACTIVE',false);
   INSERT INTO pkg_source_batches(id,batch_code,house_code,flock_code,lay_date,production_date,received_qty,batch_status,is_test) VALUES(1,'A-EGGS','HA','FA','2026-11-01','2026-11-01',5,'RECEIVED',false),(2,'X-EGGS','HX','FX','2026-11-01','2026-11-01',5,'RECEIVED',false);INSERT INTO pkg_grading_source_links VALUES(1,1),(1,2);
   INSERT INTO inv_batches(batch_no,company_code,qty,qty_available,egg_date,packaging_batch_ref) VALUES('LEGACY-MIX','CB',10,10,'2026-11-01','OLD'),('LEGACY-EMPTY','CB',10,10,'2026-11-01','EMPTY');`);
  for(const key of ['LEGACY-MIX','LEGACY-EMPTY']){const t=await trace.traceByBatch(key,['CB'],scope('A'));expect(t.production).toMatchObject({provenanceStatus:'RESTRICTED_SOURCE',provenance:[],source:[],houses:[],flocks:[],dailyLogs:[]});expect(t.packaging).toBeNull();}
  expect((await trace.traceByBatch('SOURCE',[],scope('A'))).denied).toBe(true);
 });
});
