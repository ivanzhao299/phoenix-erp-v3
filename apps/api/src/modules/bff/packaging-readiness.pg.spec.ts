import { DataSource } from 'typeorm';
import { PackagingTerminalBffController } from './bff.controller';
import { PackagingInventoryIntegrationService } from '../sales-v2/services/packaging-inventory-integration.service';
import { EggInventoryService } from '../sales-v2/services/egg-inventory.service';
import { resolvePackagingIdentity, resolvePackagingSourceContext, listPackagingReadyCombinations } from './packaging-readiness';

const url = process.env.PACKAGING_TEST_DATABASE_URL;
(url ? describe : describe.skip)('packaging SKU and handover PostgreSQL18 transactions', () => {
  let ds: DataSource, controller: PackagingTerminalBffController, service: PackagingInventoryIntegrationService;
  let scope: any;
  const req = {user:{id:7,roles:['ROLE_PKG_OP']}};
  const body = {packingCode:'PKG-LOCAL',boxes:['B1'],location:'LOC',receiver:'receiver',productionDate:'2026-09-09'};
  const item = {grade:'GRADE_5',specId:'SPEC30',eggs:30,boxes:1};
  let schemaNumber=0;
  beforeEach(async()=>{
    const parsed=new URL(url!);
    if(process.env.NODE_ENV!=='test'||!['127.0.0.1','localhost'].includes(parsed.hostname)||!['/packaging_test','/phoenix_erp'].includes(parsed.pathname))throw Error('local test DB required');
    const schema=`sku_shift_${Date.now()}_${++schemaNumber}`;
    ds=new DataSource({type:'postgres',url,entities:[],extra:{options:`-c search_path=${schema}`}});
    await ds.initialize();await ds.query(`CREATE SCHEMA ${schema}`);
    expect(Number((await ds.query('SHOW server_version_num'))[0].server_version_num)).toBeGreaterThanOrEqual(180000);
    await ds.query(`
      CREATE TABLE mst_products(product_code text PRIMARY KEY,status text,unit text,unit_zh text);
      CREATE TABLE product_grades(grade_code text PRIMARY KEY,status text,is_saleable boolean,is_storable boolean,sort_order integer);
      CREATE TABLE packaging_specs(spec_code text PRIMARY KEY,spec_name text,status text,qty_per_unit integer,base_unit text,display_unit text);
      CREATE TABLE product_skus(sku_code text PRIMARY KEY,product_code text,grade_code text,spec_code text,status text,effective_date date,expire_date date);
      CREATE TABLE brd_farms(farm_code text PRIMARY KEY,company_code text,status text);
      CREATE TABLE brd_houses(house_code text PRIMARY KEY,farm_code text,status text);
      CREATE TABLE wms_warehouses(warehouse_code text PRIMARY KEY,company_code text,status text);
      CREATE TABLE wms_locations(location_code text PRIMARY KEY,warehouse_code text,status text);
      CREATE TABLE pkg_work_shifts(id serial PRIMARY KEY,shift_code text,site_id text,production_date date,status text,is_test boolean);
      CREATE TABLE pkg_source_batches(id serial PRIMARY KEY,house_code text,shift_id integer,production_date date,batch_status text,is_test boolean,received_qty integer,received_weight numeric);
      CREATE TABLE pkg_grading_records(id serial PRIMARY KEY,code text,shift_id integer,production_date date,status text,is_test boolean,outputs_json jsonb);
      CREATE TABLE pkg_grading_source_links(grading_id integer,source_batch_id integer);
      CREATE TABLE pkg_tasks(id serial PRIMARY KEY,task_no text,grade_results jsonb,house_code text,pack_spec text,packed_qty integer,output_qty integer,created_at timestamp,shift_id integer);
      CREATE TABLE pkg_packing_records(id serial PRIMARY KEY,code text UNIQUE,shift_id integer,production_date date,status text DEFAULT 'ACTIVE',is_test boolean DEFAULT false,
        batches_json jsonb,grading_code text,grading_codes_json jsonb,total_eggs integer,total_boxes integer,idempotency_key text UNIQUE,payload_hash text);
      CREATE TABLE pkg_handover_records(id serial PRIMARY KEY,code text UNIQUE,shift_id integer,packing_code text,boxes_json jsonb,box_count integer,pallet_code text,location text,receiver text,production_date date,created_at timestamp);
      CREATE TABLE sys_dict(dict_code text,dict_type text,config_json jsonb);
      CREATE TABLE pkg_audit_logs(entity_type text,entity_id text,action text,after_data jsonb,reason text,operator_id integer);
      CREATE TABLE inv_batches(id serial PRIMARY KEY,batch_no text UNIQUE,product_code text,company_code text,warehouse_code text,location_code text,
        egg_date date,inbound_date date,expire_date date,quality_grade text,packaging_spec text,source_type text,source_no text,qty numeric,qty_available numeric,status text,
        sku_code text,grade_code_std text,spec_code text,variety_code text,packaging_batch_ref text,collection_batch_ref text,unit text,base_quantity_version smallint,created_at timestamp,updated_at timestamp);
      CREATE TABLE inv_ledger(id serial PRIMARY KEY,batch_no text,change_type text,qty_change numeric,operator text,store_code text,ref_no text,note text,batch_expire_date date,
        quality_grade text,company_code text,sku_code text,log_date date,warehouse_code text,location_code text);
      INSERT INTO mst_products VALUES ('REGISTERED-PRODUCT','ACTIVE','枚','枚');
      INSERT INTO product_grades VALUES ('GRADE_5','ACTIVE',true,true,50),('GRADE_1','ACTIVE',true,true,10);
      INSERT INTO packaging_specs VALUES ('SPEC30','30 eggs','ACTIVE',30,'枚','托'),('SPEC60','60 eggs','ACTIVE',60,'枚','托');
      INSERT INTO product_skus VALUES ('SKU5','REGISTERED-PRODUCT','GRADE_5','SPEC30','ACTIVE',NULL,NULL),('SKU1','REGISTERED-PRODUCT','GRADE_1','SPEC30','ACTIVE',NULL,NULL);
      INSERT INTO brd_farms VALUES ('FARM','COMP','ACTIVE'); INSERT INTO brd_houses VALUES ('HOUSE','FARM','ACTIVE');
      INSERT INTO wms_warehouses VALUES ('WH','COMP','ACTIVE');INSERT INTO wms_locations VALUES ('LOC','WH','NORMAL');
      INSERT INTO pkg_work_shifts VALUES (1,'SHIFT','FARM','2026-09-09','OPEN',false);
      INSERT INTO pkg_source_batches VALUES (1,'HOUSE',1,'2026-09-09','RECEIVED',false,120,5);
      INSERT INTO pkg_grading_records VALUES (1,'GR',1,'2026-09-09','ACTIVE',false,'{"GRADE_5":60,"GRADE_1":60}');
      INSERT INTO pkg_grading_source_links VALUES(1,1);
      ALTER TABLE mst_products ADD COLUMN variety_code text DEFAULT 'VAR';
      ALTER TABLE product_skus ADD COLUMN variety_code text DEFAULT 'VAR';
      ALTER TABLE brd_farms ADD COLUMN mapped_site_code text DEFAULT 'SITE';
      ALTER TABLE sys_dict ADD COLUMN status text DEFAULT 'ACTIVE';
      CREATE TABLE sys_organizations(org_code text,org_type text,company_code text,status text);
      INSERT INTO sys_organizations VALUES('COMP','COMPANY','COMP','ACTIVE');
      CREATE TABLE brd_flocks(flock_no text,house_code text,farm_code text,breed_code text,status text,placement_date date,elimination_date date);
      INSERT INTO brd_flocks VALUES('FLOCK','HOUSE','FARM','BREED','LAYING','2026-01-01',NULL);
      ALTER TABLE brd_flocks ADD COLUMN start_date date;
      INSERT INTO sys_dict(dict_code,dict_type) VALUES('BREED','BRD_BREED');
      CREATE TABLE md_product_varieties(variety_code text,status text,effective_date date,expire_date date);
      INSERT INTO md_product_varieties VALUES('VAR','ACTIVE',NULL,NULL),('OTHER','ACTIVE',NULL,NULL);
      CREATE TABLE md_variety_breeds(breed_code text,variety_code text,status text);
      INSERT INTO md_variety_breeds VALUES('BREED','VAR','ACTIVE');
      CREATE TABLE md_sku_org_scope(sku_code text,scope_type text,scope_code text,sale_enabled boolean,stock_enabled boolean,status text,effective_date date,expire_date date);
      INSERT INTO md_sku_org_scope VALUES('SKU5','COMPANY','COMP',true,true,'ACTIVE',NULL,NULL),('SKU1','COMPANY','COMP',true,true,'ACTIVE',NULL,NULL);

    `);
    await ds.query(`INSERT INTO pkg_packing_records(code,shift_id,production_date,batches_json,grading_codes_json,total_eggs,total_boxes)
      VALUES ('PKG-LOCAL',1,'2026-09-09',$1,'["GR"]',30,1)`,[JSON.stringify([item])]);
    scope={isGlobal:false,allowedCompanyCodes:['COMP'],allowedFarmCodes:['FARM'],allowedWarehouseCodes:['WH']};
    const cls={get:()=>({username:'local-tester'})};
    const egg=new EggInventoryService(ds,cls as never);
    service=new PackagingInventoryIntegrationService(ds,cls as never,egg,{resolveMode:async()=> 'PACKAGING_INBOUND'} as never);
    controller=new PackagingTerminalBffController(ds.manager,service,{resolve:async()=>scope,assertActiveHouseOwnership:async()=>({company_code:'COMP'})} as never);
  });
  afterEach(async()=>{await ds?.destroy();});
  async function counts(){return (await ds.query('SELECT (SELECT count(*)::int FROM inv_batches) batches,(SELECT count(*)::int FROM inv_ledger) ledgers,(SELECT count(*)::int FROM pkg_handover_records) handovers'))[0];}
  const zero={batches:0,ledgers:0,handovers:0};
  it('resolves legacy grade/spec uniquely without guessing a product, confirms CLOSED original date and concurrent retries exactly once',async()=>{
    await ds.query("UPDATE pkg_work_shifts SET status='CLOSED'");
    const [a,b]=await Promise.all([controller.confirmHandover(body,req),controller.confirmHandover(body,req)]);
    expect(a.data.code).toBe(b.data.code);expect(await counts()).toEqual({batches:1,ledgers:1,handovers:1});
    const [batch]=await ds.query('SELECT *,egg_date::text AS day FROM inv_batches');
    expect(batch).toMatchObject({product_code:'REGISTERED-PRODUCT',sku_code:'SKU5',qty:'30',day:'2026-09-09',company_code:'COMP',variety_code:'VAR',warehouse_code:'WH',location_code:'LOC'});
    await ds.query('UPDATE inv_batches SET qty_available=7');
    expect((await controller.confirmHandover(body,req)).data.code).toBe(a.data.code);expect(await counts()).toEqual({batches:1,ledgers:1,handovers:1});
  });
  it.each(['missing','inactive','ambiguous','orphan','spec','product'])('blocks %s master data before any write',async(kind)=>{
    if(kind==='missing')await ds.query("UPDATE product_skus SET spec_code='OTHER' WHERE sku_code='SKU5'");
    if(kind==='inactive')await ds.query("UPDATE product_skus SET status='DISABLED'");
    if(kind==='ambiguous')await ds.query("INSERT INTO product_skus(sku_code,product_code,grade_code,spec_code,status) VALUES ('SKU_DUP','REGISTERED-PRODUCT','GRADE_5','SPEC30','ACTIVE'); INSERT INTO md_sku_org_scope SELECT 'SKU_DUP',scope_type,scope_code,sale_enabled,stock_enabled,status,effective_date,expire_date FROM md_sku_org_scope WHERE sku_code='SKU5'");
    if(kind==='orphan')await ds.query("UPDATE product_skus SET product_code='NOT_REGISTERED'");
    if(kind==='spec')await ds.query("UPDATE packaging_specs SET status='DISABLED'");
    if(kind==='product')await ds.query("UPDATE mst_products SET status='DISABLED'");
    await expect(controller.confirmHandover(body,req)).rejects.toThrow();expect(await counts()).toEqual(zero);
  });
  it('validates every output before writing the first, and rolls back a second-group ledger failure',async()=>{
    await ds.query(`UPDATE pkg_packing_records SET batches_json=$1,total_boxes=2,total_eggs=60`,[JSON.stringify([item,{...item,grade:'GRADE_1'}])]);
    await ds.query("UPDATE product_skus SET status='DISABLED' WHERE sku_code='SKU1'");
    await expect(controller.confirmHandover({...body,boxes:['B1','B2']},req)).rejects.toThrow();expect(await counts()).toEqual(zero);
    await ds.query("UPDATE product_skus SET status='ACTIVE' WHERE sku_code='SKU1'");
    await ds.query("ALTER TABLE inv_ledger ADD CONSTRAINT fail_second CHECK(sku_code <> 'SKU1')");
    await expect(controller.confirmHandover({...body,boxes:['B1','B2']},req)).rejects.toThrow('库存生成失败');expect(await counts()).toEqual(zero);
  });
  it('rolls back batches and ledger if the handover INSERT fails',async()=>{
    await ds.query('ALTER TABLE pkg_handover_records ADD CONSTRAINT fail_handover CHECK(box_count < 0)');
    await expect(controller.confirmHandover(body,req)).rejects.toThrow();expect(await counts()).toEqual(zero);
  });
  it.each(['qty','sku','company','location','missing-ledger','extra-ledger','handover'])('rejects committed %s conflicts without repair',async(kind)=>{
    await controller.confirmHandover(body,req);
    const sql:Record<string,string>={qty:'UPDATE inv_batches SET qty=29',sku:"UPDATE inv_batches SET sku_code='WRONG'",company:"UPDATE inv_batches SET company_code='OTHER'",location:"UPDATE inv_batches SET location_code='OTHER'",'missing-ledger':"UPDATE inv_ledger SET change_type='OTHER'",'extra-ledger':"INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) SELECT batch_no,'PACKAGING_INBOUND',0,ref_no FROM inv_ledger",handover:"UPDATE pkg_handover_records SET receiver='other'"};
    await ds.query(sql[kind]);const before=await counts();await expect(controller.confirmHandover(body,req)).rejects.toThrow();expect(await counts()).toEqual(before);
  });
  it.each(['company','farm','warehouse','body-company','date','VOID','test','source-void','source-test','grading-void','no-links'])('rejects %s before any business write',async(kind)=>{
    if(kind==='company')scope.allowedCompanyCodes=[];if(kind==='farm')scope.allowedFarmCodes=[];if(kind==='warehouse')scope.allowedWarehouseCodes=[];
    if(kind==='VOID')await ds.query("UPDATE pkg_packing_records SET status='VOID'");
    if(kind==='test')await ds.query('UPDATE pkg_packing_records SET is_test=true');
    if(kind==='source-void')await ds.query("UPDATE pkg_source_batches SET batch_status='VOID'");
    if(kind==='source-test')await ds.query('UPDATE pkg_source_batches SET is_test=true');
    if(kind==='grading-void')await ds.query("UPDATE pkg_grading_records SET status='VOID'");
    if(kind==='no-links')await ds.query('UPDATE pkg_grading_source_links SET grading_id=999');
    await expect(controller.confirmHandover({...body,...(kind==='body-company'?{companyCode:'OTHER'}:{}),...(kind==='date'?{productionDate:'2026-09-10'}:{})},req)).rejects.toThrow();expect(await counts()).toEqual(zero);
  });
  it('checks SKU at submit within the same transaction and persists its identity',async()=>{
    const input={shiftId:1,gradingCodes:['GR'],batches:[item],idempotencyKey:'new-packing'};
    await ds.query("UPDATE product_skus SET status='DISABLED' WHERE sku_code='SKU5'");
    await expect(controller.submitPacking(input,req)).rejects.toThrow();
    expect((await ds.query('SELECT count(*)::int n FROM pkg_packing_records'))[0].n).toBe(1);
    await ds.query("UPDATE product_skus SET status='ACTIVE' WHERE sku_code='SKU5'");
    const result=await controller.submitPacking(input,req);
    const [packing]=await ds.query('SELECT batches_json FROM pkg_packing_records WHERE code=$1',[result.data.code]);
    expect(packing.batches_json[0]).toMatchObject({productCode:'REGISTERED-PRODUCT',skuCode:'SKU5',varietyCode:'VAR'});
  });
  it('requires exact safe IDs, date, mode, OPEN and scoped ownership for active reads',async()=>{
    for(const id of ['NaN','0','-1','1.5','9007199254740992',''])await expect(controller.getActiveGrading(id,req)).rejects.toThrow();
    await expect(controller.getExactShift('1','2026-09-10',req)).rejects.toThrow('日期');
    expect((await controller.getActiveGrading('1',req)).data.shiftId).toBe(1);
    scope.allowedFarmCodes=[];await expect(controller.getActiveGrading('1',req)).rejects.toThrow();scope.allowedFarmCodes=['FARM'];
    await ds.query("UPDATE pkg_work_shifts SET status='CLOSED'");await expect(controller.getActiveGrading('1',req)).rejects.toThrow('关闭');
  });
  it('does not accept an explicitly different SKU from the same grade/spec',async()=>{
    await expect(resolvePackagingIdentity(ds.manager,{grade:'GRADE_5',specCode:'SPEC30',skuCode:'SKU1',sourceContext:await resolvePackagingSourceContext(ds.manager,{packingCode:'PKG-LOCAL'})})).rejects.toThrow('不匹配');
  });
  it('authorizes the target shift before submit and before replay',async()=>{
    const input={shiftId:1,gradingCodes:['GR'],batches:[item],idempotencyKey:'scope-packing'};
    scope.allowedFarmCodes=[];
    await expect(controller.submitPacking(input,req)).rejects.toThrow('无权');
    expect((await ds.query('SELECT count(*)::int n FROM pkg_packing_records'))[0].n).toBe(1);
    scope.allowedFarmCodes=['FARM'];await controller.submitPacking(input,req);
    scope.allowedCompanyCodes=[];
    await expect(controller.submitPacking(input,req)).rejects.toThrow('无权');
  });
  it('rejects a missing authoritative date at the shared inventory entry',async()=>{
    await expect(service.generateSaleableFromOutputs('PKG-LOCAL',[{grade:'GRADE_5',specCode:'SPEC30',qty:30}])).rejects.toThrow('日期');
    expect(await counts()).toEqual(zero);
  });

  it.each(['missing-breed-map','mixed-house','mixed-sources','scope-missing','ALL-only','scope-disabled','draft','explicit-product','date-mismatch'])('fails closed for %s even with explicit product/SKU',async(kind)=>{
    await ds.query(`UPDATE pkg_packing_records SET batches_json=$1`,[JSON.stringify([{...item,productCode:'REGISTERED-PRODUCT',skuCode:'SKU5'}])]);
    if(kind==='missing-breed-map')await ds.query('DELETE FROM md_variety_breeds');
    if(kind==='mixed-house')await ds.query("INSERT INTO md_variety_breeds VALUES('BREED','OTHER','ACTIVE')");
    if(kind==='mixed-sources')await ds.query(`INSERT INTO brd_houses VALUES('HOUSE2','FARM','ACTIVE');
      INSERT INTO brd_flocks VALUES('FLOCK2','HOUSE2','FARM','BREED2','LAYING','2026-01-01',NULL);
      INSERT INTO sys_dict(dict_code,dict_type) VALUES('BREED2','BRD_BREED');
      INSERT INTO md_variety_breeds VALUES('BREED2','OTHER','ACTIVE');
      INSERT INTO pkg_source_batches VALUES(2,'HOUSE2',1,'2026-09-09','RECEIVED',false,30,1);
      INSERT INTO pkg_grading_source_links VALUES(1,2)`);
    if(kind==='scope-missing')await ds.query('DELETE FROM md_sku_org_scope');
    if(kind==='ALL-only')await ds.query("UPDATE md_sku_org_scope SET scope_type='ALL',scope_code='ALL'");
    if(kind==='scope-disabled')await ds.query("INSERT INTO md_sku_org_scope VALUES('SKU5','SITE','SITE',true,false,'ACTIVE',NULL,NULL)");
    if(kind==='draft')await ds.query("UPDATE product_skus SET status='DRAFT'");
    if(kind==='explicit-product')await ds.query("UPDATE mst_products SET variety_code='OTHER'");
    if(kind==='date-mismatch')await ds.query("UPDATE pkg_source_batches SET production_date='2026-09-08'");
    await expect(controller.confirmHandover(body,req)).rejects.toThrow();expect(await counts()).toEqual(zero);
  });
  it('replays stored variety/SKU after flock mapping and master activation change',async()=>{
    await controller.confirmHandover(body,req);
    await ds.query("UPDATE brd_flocks SET breed_code='UNKNOWN'; UPDATE md_variety_breeds SET variety_code='OTHER'; UPDATE product_skus SET status='DISABLED'; UPDATE mst_products SET status='DISABLED'; DELETE FROM md_sku_org_scope");
    await expect(controller.confirmHandover(body,req)).resolves.toMatchObject({code:200});
    expect(await counts()).toEqual({batches:1,ledgers:1,handovers:1});
    expect((await ds.query('SELECT variety_code FROM inv_batches'))[0].variety_code).toBe('VAR');
  });
  it('replays a pre-variety NULL snapshot after house/farm retirement without inferring or backfilling a variety',async()=>{
    await controller.confirmHandover(body,req);
    await ds.query(`UPDATE inv_batches SET variety_code=NULL;
      UPDATE brd_houses SET status='DISABLED'; UPDATE brd_farms SET status='DISABLED';
      UPDATE product_skus SET status='DISABLED'; UPDATE mst_products SET status='DISABLED';
      DELETE FROM md_variety_breeds; DELETE FROM md_sku_org_scope;`);
    const before=await counts();
    await expect(service.completeTerminalPacking('PKG-LOCAL',{companyCode:'COMP',warehouseCode:'WH',locationCode:'LOC'})).resolves.toMatchObject({idempotent:true,companyCode:'COMP',totalInbound:30});
    expect(await counts()).toEqual(before);
    expect((await ds.query('SELECT variety_code FROM inv_batches'))[0].variety_code).toBeNull();
    await ds.query(`INSERT INTO pkg_packing_records(code,shift_id,production_date,batches_json,grading_codes_json,total_eggs,total_boxes)
      VALUES('PKG-NEW',1,'2026-09-09',$1,'["GR"]',30,1)`,[JSON.stringify([{...item,productCode:'REGISTERED-PRODUCT',skuCode:'SKU5',varietyCode:'VAR'}])]);
    await expect(service.completeTerminalPacking('PKG-NEW',{companyCode:'COMP',warehouseCode:'WH',locationCode:'LOC'})).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });
  it('does not return global combinations without scoped provenance',async()=>{
    await expect(listPackagingReadyCombinations(ds.manager)).resolves.toEqual([]);
    const sourceContext=await resolvePackagingSourceContext(ds.manager,{packingCode:'PKG-LOCAL'});
    expect(await listPackagingReadyCombinations(ds.manager,sourceContext)).toHaveLength(2);
    await ds.query('DELETE FROM md_sku_org_scope');
    await expect(listPackagingReadyCombinations(ds.manager,sourceContext)).resolves.toEqual([]);
  });

  it('validates legacy task writes from persisted house and shift date, never created_at or explicit company',async()=>{
    await ds.query(`INSERT INTO pkg_tasks(task_no,grade_results,house_code,pack_spec,output_qty,created_at,shift_id)
      VALUES('TASK','{"GRADE_5":30}','HOUSE','30 eggs',30,'2026-11-11',1)`);
    await expect(service.completePackagingBatch('TASK',{companyCode:'OTHER'})).rejects.toThrow('公司');
    expect(await counts()).toEqual(zero);
    const result=await service.completePackagingBatch('TASK');
    expect(result).toMatchObject({companyCode:'COMP',totalInbound:30});
    await ds.query("UPDATE md_variety_breeds SET variety_code='OTHER'; UPDATE product_skus SET status='DISABLED'");
    await expect(service.completePackagingBatch('TASK')).resolves.toMatchObject({idempotent:true,totalInbound:30});
    expect((await ds.query("SELECT egg_date::text AS day,variety_code,sku_code FROM inv_batches WHERE packaging_batch_ref='TASK'"))[0]).toEqual({day:'2026-09-09',variety_code:'VAR',sku_code:'SKU5'});
  });
  it('rejects a task with missing provenance even if the caller provides a complete identity',async()=>{
    await ds.query(`INSERT INTO pkg_tasks(task_no,house_code,shift_id) VALUES('TASK',NULL,1)`);
    await expect(service.generateSaleableFromOutputs('TASK',[{grade:'GRADE_5',specCode:'SPEC30',productCode:'REGISTERED-PRODUCT',skuCode:'SKU5',varietyCode:'VAR',qty:30}],{eggDate:'2026-09-09',companyCode:'COMP'})).rejects.toThrow('来源');
    expect(await counts()).toEqual(zero);
  });

  it('summary uses the exact scoped date/mode and propagates SQL failures instead of zero fallback',async()=>{
    await ds.query(`ALTER TABLE pkg_source_batches ADD COLUMN batch_code text;
      ALTER TABLE pkg_work_shifts ADD COLUMN opened_at timestamp DEFAULT now();
      CREATE TABLE pkg_exceptions(status text,created_at timestamp,related_batch_id text,batch_no text);
      CREATE TABLE pkg_label_print_logs(printed_at timestamp,packaging_batch_id text);`);
    const result=await controller.getShiftSummary('2026-09-09','1',req);
    expect(result.data).toMatchObject({receivedQty:120,shiftPackedBoxes:1,shiftPackedEggs:30,shiftWarehousedBoxes:0});
    for(const id of ['NaN','0','', '9007199254740992','999'])await expect(controller.getShiftSummary('2026-09-09',id,req)).rejects.toThrow();
    await expect(controller.getShiftSummary('2026-09-10','1',req)).rejects.toThrow('日期');
    scope.allowedFarmCodes=[];await expect(controller.getShiftSummary('2026-09-09','1',req)).rejects.toThrow('无权');scope.allowedFarmCodes=['FARM'];
    expect((await controller.getShiftSummary('2026-09-09',undefined as any,req)).data.receivedQty).toBe(120);
    await ds.query('UPDATE pkg_work_shifts SET is_test=true');await expect(controller.getShiftSummary('2026-09-09','1',req)).rejects.toThrow();
    await ds.query('UPDATE pkg_work_shifts SET is_test=false; ALTER TABLE pkg_exceptions RENAME COLUMN status TO unavailable_status');
    await expect(controller.getShiftSummary('2026-09-09','1',req)).rejects.toThrow();
  });
  it('deducts an authorized later-shift consumption from the original grading remainder',async()=>{
    await ds.query(`INSERT INTO pkg_work_shifts VALUES(2,'LATER','FARM','2026-09-10','OPEN',false);
      UPDATE pkg_packing_records SET shift_id=2,production_date='2026-09-10';`);
    const result=await controller.getActiveGrading('1',req);
    expect(result.data.remaining.GRADE_5).toBe(30);
    expect(result.data.productionDate).toBe('2026-09-09');
  });

});
