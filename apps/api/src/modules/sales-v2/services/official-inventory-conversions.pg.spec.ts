import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { OfficialInventoryConversions1795011331222 } from '../../../database/migrations/1795011331222-OfficialInventoryConversions';
import { activateOwnedConversionDomain,installProductionConversionFixture } from './production-conversion.pg-fixture';
import { randomUUID } from 'crypto';
import { OfficialInventoryConversionService,InventoryConversionDraft } from './official-inventory-conversion.service';
import { OfficialRawCollectionService } from './official-raw-collection.service';
import { ProductionInboundDocumentsService } from './production-inbound-documents.service';
import { ProductionInboundService } from './production-inbound.service';
import { EggInventoryService } from './egg-inventory.service';
import { InventorySourceModeService } from './inventory-source-mode.service';
import { SkuAvailabilityService } from '../../product-master/services/sku-availability.service';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { WmsService } from '../../wms/wms.service';
import { effectiveProductionReceiptQuantity } from '../../farm/effective-production-source';
import { singaporeBusinessDate } from '../../wms/temp-production-reversal';
import { officialInventoryCostAggregate } from '../../wms/official-inventory';
import { writeInvLedger } from '../../wms/inventory-ledger.writer';

const url=process.env.OFFICIAL_INVENTORY_PG_URL;
(url?describe:describe.skip)('official physical conversions — owned PostgreSQL 18',()=>{
  let db:DataSource;const schema=`inventory_conversion_${process.pid}`;
  let actor:any,scope:any,service:OfficialInventoryConversionService,raw:OfficialRawCollectionService,documents:ProductionInboundDocumentsService,wms:WmsService;
  const day=singaporeBusinessDate(),grades=['GRADE_0','GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','BROKEN'];
  const cls={get:(key:string)=>key==='dataScope'?scope:actor};
  const maker=()=>{actor={userId:1,username:'maker',permissions:['MENU_PROD_INBOUND:V,C,E']};};
  const reviewer=()=>{actor={userId:2,username:'reviewer',permissions:['MENU_PROD_INBOUND:V,A,E']};};
  beforeAll(async()=>{
    const u=new URL(url!);if(u.hostname!=='127.0.0.1'||!['/phoenix_temp_reversal_fixture','/installments_fixture'].includes(u.pathname))throw Error('Owned fixture required');
    db=await new DataSource({type:'postgres',url,synchronize:false,migrationsRun:false,installExtensions:false,
      extra:{options:`-c search_path=${schema}`,max:10}}).initialize();
    if(!(await db.query('SHOW server_version'))[0].server_version.startsWith('18.'))throw Error('PG18 required');
    await db.query(`CREATE SCHEMA "${schema}"`);await installProductionConversionFixture(db);
    const skus=new SkuAvailabilityService(db),inv=new EggInventoryService(db,cls as never,skus);
    const legacy=new ProductionInboundService(db,cls as never,inv,new InventorySourceModeService(db,cls as never),new OrgOwnershipService(db.manager),skus);
    documents=new ProductionInboundDocumentsService(db,cls as never,legacy,inv,skus);raw=new OfficialRawCollectionService(db,cls as never,skus);
    wms=new WmsService(db.manager,cls as never);service=new OfficialInventoryConversionService(db,cls as never,wms);
  });
  afterAll(async()=>{if(db?.isInitialized){await db.query(`DROP SCHEMA "${schema}" CASCADE`);await db.destroy();}});
  it('installs empty/OFF and reverses without changing the preexisting inventory predicates',async()=>{
    const q=db.createQueryRunner();await q.connect();try{
      const [{predicate}]=await q.query("SELECT value AS predicate FROM typeorm_metadata WHERE type='OFFICIAL_CONVERSION_FUNCTION' AND name='official_inventory_allows(text,text,text,text,text,text)'");
      await new OfficialInventoryConversions1795011331222().down(q);
      expect((await q.query("SELECT pg_get_functiondef('official_inventory_allows(text,text,text,text,text,text)'::regprocedure) AS predicate"))[0].predicate).toBe(predicate);
      await new OfficialInventoryConversions1795011331222().up(q);
      expect((await q.query('SELECT count(*)::int AS n FROM production_conversion_documents'))[0].n).toBe(0);
      expect((await q.query('SELECT count(*)::int AS n FROM production_cutover_scopes'))[0].n).toBe(0);
      expect((await q.query('SELECT count(*)::int AS n FROM inv_batches'))[0].n).toBe(0);
    }finally{await q.release();}
  });
  it('rejects an unproven WIP inventory flag instead of silently creating sale-restricted stock',async()=>{
    await expect(db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,qty,qty_available,status,inventory_class)
      VALUES('SYNTHETIC-UNPROVEN-WIP','COMP-A','WH-A','PRD-EGG-RAW','SKU-GRADE_1',1,1,'AVAILABLE','WIP')`)).rejects.toThrow('OFFICIAL_CONVERSION_WIP_ADMISSION_HOLD');
  });
  async function source(amounts:Record<string,number>={GRADE_1:100},sourceDay=day,prepareDomain?:()=>Promise<void>){
    await db.query(`TRUNCATE sal_return_orders,sal_return_items,sal_order_item_batch_allocations,sal_store_sales,store_sale_allocations,
      production_cutover_scopes,production_inventory_domain_states,production_cutover_manifests,wms_transfer,inv_ledger,inv_batches,brd_daily_logs,brd_flock_occupancies,brd_flock_documents,
      production_raw_receipts,production_conversion_documents,pkg_source_batches,pkg_work_shifts RESTART IDENTITY CASCADE;
      TRUNCATE production_posting_periods,production_posting_period_events;
      TRUNCATE prc2_receipts,prc2_purchase_orders CASCADE;
      UPDATE sys_user SET status=1;UPDATE file_metadata SET status='ACTIVE';
      INSERT INTO brd_flock_documents(id,source_key,content_hash,kind,company_code,farm_code,house_code,business_date,payload,status,created_by)
        VALUES('CVT-BASE','SYNTHETIC-CVT-COUNT',repeat('b',64),'BASELINE','COMP-A','FARM-A','HOUSE-A','2026-11-17','{}','POSTED','fixture');
      INSERT INTO brd_flock_occupancies(id,flock_no,house_code,company_code,farm_code,site_code,began_on,capacity_snapshot,opened_document_id)
        SELECT 'CVT-OCC','FLOCK-A','HOUSE-A','COMP-A','FARM-A',mapped_site_code,'2026-11-17',5000,'CVT-BASE' FROM brd_farms WHERE farm_code='FARM-A';
      INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
        VALUES('50000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A',1,'2026-11-17','DRAFT','WH-A','FLOCK-A','PROFILE-A',repeat('c',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code)
        VALUES('50000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW');
      `);
    await prepareDomain?.();
    await db.query("UPDATE production_cutover_scopes SET state='FENCED';UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now()");
    const receipt = await issueRaw(amounts,sourceDay,1);
    reviewer();actor.permissions.push('MENU_FIN2_AR_LEDGER:E');await documents.setPostingPeriod({companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth:day.slice(0,7),
      state:'OPEN',expectedVersion:0,evidenceFileId:'PERIOD-EVIDENCE',reason:'Owned synthetic conversion period approval'});maker();
    return receipt;
  }
  async function issueRaw(amounts:Record<string,number>,sourceDay:string,sourceId:number,
    verifyDraft?: (open:()=>Promise<any>)=>Promise<void>) {
    await db.query("INSERT INTO pkg_work_shifts VALUES($2,'FARM-A',$1,false)",[sourceDay,sourceId]);
    const total=Object.values(amounts).reduce((n,q)=>n+q,0);
    const [report]=await db.query(`INSERT INTO brd_daily_logs(house_code,flock_no,log_date,shift,eggs_by_grade,occupancy_id,company_code,farm_code,site_code)
      SELECT 'HOUSE-A','FLOCK-A',$1,'DAILY',$2,'CVT-OCC','COMP-A','FARM-A',mapped_site_code FROM brd_farms WHERE farm_code='FARM-A' RETURNING id`,[sourceDay,JSON.stringify(Object.fromEntries(grades.map(g=>[g,amounts[g]??0])))]);
    await db.query(`INSERT INTO pkg_source_batches(id,house_code,flock_code,received_qty,production_date,lay_date,is_test,batch_code,source_inbound_no,
      shift_id,total_qty,dirty_qty,cracked_qty,batch_status) VALUES($5,'HOUSE-A','FLOCK-A',$1,$2,$2,false,$6,$6,$5,$1,$3,$4,'RECEIVED')`,
      [total,sourceDay,amounts.DIRTY??0,amounts.BROKEN??0,sourceId,sourceId===1?'SYNTHETIC-CVT-RAW':'SYNTHETIC-CVT-RAW-'+sourceId]);
    scope={isGlobal:false,allowedCompanyCodes:['COMP-A'],allowedWarehouseCodes:['WH-A']};maker();
    const h=await documents.createPhysicalHandover({companyCode:'COMP-A',houseCode:'HOUSE-A',eggDate:sourceDay,warehouseCode:'WH-A',handoverRef:randomUUID(),rawCollectionSourceId:String(sourceId),
      segments:Object.entries(amounts).map(([gradeCode,quantity])=>({dailyLogId:report.id,gradeCode,quantity,evidenceFileId:'RAW-EVIDENCE'}))});
    actor={userId:3,username:'receiver',permissions:['MENU_PROD_INBOUND:V,E']};await documents.confirmPhysicalHandover(h.id,h.version,h.content_hash);maker();
    const create=()=>raw.create({companyCode:'COMP-A',houseCode:'HOUSE-A',productionDate:sourceDay,warehouseCode:'WH-A',sourceBatchId:String(sourceId),handoverId:h.id,intentKey:randomUUID()});
    await verifyDraft?.(create);
    const d=await create();
    const r=await raw.ready(d.id,0,randomUUID());reviewer();const a=await raw.approve(d.id,r.version,r.content_hash);maker();await raw.post(a.id,a.submit_key,a.content_hash);
    return {reportId:report.id,segments:await db.query('SELECT * FROM production_raw_receipt_segments WHERE receipt_id=$1 ORDER BY grade_code',[a.id])};
  }
  const plan=(segmentId:string,quantity=100,outputKind:'STOCK'|'WIP'='STOCK'):InventoryConversionDraft=>({companyCode:'COMP-A',warehouseCode:'WH-A',productCode:'PRD-EGG-RAW',
    operationKind:'GRADING',operationDate:day,physicalGroupRef:randomUUID(),intentKey:randomUUID(),inputs:[{rawSegmentId:segmentId,quantity}],
    outputs:[{outputKind,gradeCode:'GRADE_1',quantity,skuCode:'SKU-GRADE_1',locationCode:'LOC-A',evidenceFileId:'CONVERSION-EVIDENCE'}]});
  async function approved(request:InventoryConversionDraft){
    maker();const d=await service.create(request),r=await service.ready(d.id,0,randomUUID());reviewer();const a=await service.approve(d.id,r.version,r.content_hash);maker();return a;
  }
  const counts=async()=> (await db.query(`SELECT (SELECT count(*)::int FROM inv_batches) AS batches,(SELECT count(*)::int FROM inv_ledger) AS ledger,
    (SELECT count(*)::int FROM production_conversion_inputs) AS inputs,(SELECT count(*)::int FROM production_conversion_outputs) AS outputs`))[0];
  async function purchase(currency:string|null='USD'){
    scope.allowedWarehouseCodes.push('WH-P');
    await db.query("INSERT INTO prc2_purchase_orders VALUES(1,'COMP-A',$1)",[currency]);
    await db.query("INSERT INTO prc2_receipts VALUES(1,'SYNTHETIC-CVT-RECEIPT','COMP-A','WH-P','CONFIRMED',1)");
    await db.query("INSERT INTO prc2_receipt_items VALUES(1,1,'SKU-GRADE_1',20,'枚',2.123456)");
    const result=await db.transaction(m=>wms.inboundFromReceipt(m,{refNo:'SYNTHETIC-CVT-RECEIPT',warehouseCode:'WH-P',operator:'maker',inboundDate:day,
      items:[{receiptItemId:'1',skuCode:'SKU-GRADE_1',itemCode:'SKU-GRADE_1',unit:'枚',qty:20,unitCost:2.123456,locationCode:'LOC-P'}]}));
    // Explicit synthetic measured dates while the purchase warehouse is still OFF. Governed dates remain immutable.
    await db.query('UPDATE inv_batches SET egg_date=$2::date,expire_date=$2::date+20 WHERE batch_no=$1',[result.batchNos[0],day]);
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-PURCHASE-ACTUAL-ADMISSION',from_warehouse:'WH-P',to_warehouse:'WH-A',items:[{batch_no:result.batchNos[0],qty:1}]},actor);
    await db.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
      VALUES('50000000-0000-0000-0000-000000000002','COMP-A','HOUSE-A2',1,'2026-11-17','DRAFT','WH-P','FLOCK-A','PROFILE-A2',repeat('d',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code) VALUES('50000000-0000-0000-0000-000000000002','COMP-A','WH-P','PRD-EGG-RAW');
      UPDATE production_cutover_scopes SET state='FENCED' WHERE id='50000000-0000-0000-0000-000000000002';
      UPDATE production_cutover_scopes SET state='ACTIVE',activated_at=now() WHERE id='50000000-0000-0000-0000-000000000002'`);
    return result.batchNos[0];
  }
  async function mixedParent(){
    const s=await source(),purchaseRoot=await purchase(),a=await approved(plan(s.segments[0].id,20,'WIP')),r=await service.post(a.id,a.submit_key,a.content_hash);
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-RAW-TO-PURCHASE-WH',from_warehouse:'WH-A',to_warehouse:'WH-P',items:[{batch_no:r.batches[0].batchNo,qty:20}]},actor);
    const [rawParent]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='SYNTHETIC-RAW-TO-PURCHASE-WH'");
    const request=plan(s.segments[0].id,39,'WIP');request.warehouseCode='WH-P';request.inputs=[{parentBatchNo:rawParent.batch_no,quantity:20},{parentBatchNo:purchaseRoot,quantity:19}];
    request.outputs[0].locationCode='LOC-P';request.outputs[0].evidenceFileId='CONVERSION-P-EVIDENCE';
    const b=await approved(request),mixed=await service.post(b.id,b.submit_key,b.content_hash);scope.allowedWarehouseCodes.push('WH-A2');
    return {batchNo:mixed.batches[0].batchNo,purchaseRoot,rawSegment:s.segments[0].id};
  }
  it('converts an actual signed RAW segment into stock once, preserves provenance and never credits production twice',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id));
    const rawQuota=async()=> (await documents.balance('COMP-A','HOUSE-A',day,'WH-A')).sourceBalances
      .find(row=>row.dailyLogId===Number(s.reportId)&&row.gradeCode==='GRADE_1');
    const rawOnly={dailyLogId:Number(s.reportId),flockNo:'FLOCK-A',occupancyId:'CVT-OCC',productionDate:day,shift:'DAILY',gradeCode:'GRADE_1',confirmedQty:100,ordinaryNet:0,rawUsedQty:100,remaining:0};
    expect(await rawQuota()).toEqual(rawOnly);
    const result=await service.post(a.id,a.submit_key,a.content_hash);
    expect(result).toMatchObject({inputQuantity:100,outputQuantity:100,lossQuantity:0,costStatus:'PENDING_ALLOCATION'});
    expect(await counts()).toEqual({batches:1,ledger:1,inputs:1,outputs:1});
    const [b]=await db.query('SELECT *,official_inventory_allows(batch_no,company_code,warehouse_code,product_code,sku_code,material_code) AS visible FROM inv_batches');
    expect(b).toMatchObject({qty:'100',qty_available:'100',inventory_class:'STANDARD',status:'AVAILABLE',visible:true,unit_cost:'0.000000'});
    expect(await db.query('SELECT raw_segment_id FROM production_batch_raw_roots')).toEqual([{raw_segment_id:s.segments[0].id}]);
    expect(await rawQuota()).toEqual(rawOnly);
    expect(await effectiveProductionReceiptQuantity(db.manager,s.reportId)).toBe(100);
    expect((await documents.balance('COMP-A','HOUSE-A',day,'WH-A')).stockByGrade.GRADE_1).toMatchObject({
      attributableQty:100,warehouseQty:100,mixedBatchCount:0});

    expect(await db.query('SELECT precision,allocated_output_qty FROM inv_flock_source_links')).toEqual([{precision:'RELATED_INPUT',allocated_output_qty:null}]);
    const rollback=db.createQueryRunner();await rollback.connect();
    try{await expect(new OfficialInventoryConversions1795011331222().down(rollback)).rejects.toThrow('OFFICIAL_CONVERSION_DOWN_HOLD');}
    finally{await rollback.release();}
    expect((await service.get(a.id)).receipt).toEqual(result);expect(await counts()).toEqual({batches:1,ledger:1,inputs:1,outputs:1});
    await db.query("UPDATE production_cutover_scopes SET state='SUSPENDED';UPDATE product_skus SET status='INACTIVE'");
    actor={userId:4,username:'viewer',permissions:['MENU_PROD_INBOUND:V']};expect(await service.post(a.id,a.submit_key,a.content_hash)).toEqual(result);
    expect(await counts()).toEqual({batches:1,ledger:1,inputs:1,outputs:1});await db.query("UPDATE product_skus SET status='ACTIVE'");
  });
  it.each([0,5])('counts a mixed 30/70 batch once with %i measured loss and exposes both days without inventing shares',async loss=>{
    const earlier=(await db.query("SELECT ($1::date-1)::text AS day",[day]))[0].day;
    const first=await source({GRADE_1:30},earlier),second=await issueRaw({GRADE_1:70},day,2);
    const request=plan(first.segments[0].id,30);
    request.inputs.push({rawSegmentId:second.segments[0].id,quantity:70});
    request.outputs[0].quantity=100-loss;
    if(loss)request.outputs.push({outputKind:'LOSS',gradeCode:'GRADE_1',quantity:loss,lossReason:'PROCESSING_LOSS',evidenceFileId:'CONVERSION-EVIDENCE'});
    const d=await approved(request),receipt=await service.post(d.id,d.submit_key,d.content_hash);
    for(const productionDay of [earlier,day]){
      const balance=await documents.balance('COMP-A','HOUSE-A',productionDay,'WH-A');
      expect(balance.stockByGrade.GRADE_1).toMatchObject({attributableQty:null,knownAttributableQty:0,
        warehouseQty:100-loss,mixedBatchCount:1});
      expect(balance.grades.GRADE_1.remaining).toBe(0);
      const rows=await documents.stockBatches('COMP-A','HOUSE-A',productionDay,'WH-A',{view:'source',batchNo:receipt.batches[0].batchNo});
      expect(rows.items).toHaveLength(1);
      expect(rows.items[0]).toMatchObject({batchQty:100-loss,attributableQty:null,attribution:'MIXED'});
      expect(rows.items[0].sources.map(s=>s.productionDate).sort()).toEqual([earlier,day]);
      expect(rows.items[0].sources.every(s=>s.kind==='RAW'&&s.handoverRef&&s.dailyLogId&&s.occupancyId&&s.flockNo)).toBe(true);
    }
  });
  it('uses actual stock domains for mixed V1 and V2 RAW and rejects V2 SKU and warehouse drift',async()=>{
    const earlier=(await db.query("SELECT ($1::date-1)::text AS day",[day]))[0].day;
    const site='SITE-DONGPENG-LAYER',scopeId='50000000-0000-0000-0000-000000000001';
    const oldProfile='ESP-CHANGE-'+randomUUID(),newProfile='ESP-CHANGE-'+randomUUID();
    const item={skuCode:'SKU-GRADE_1',productCode:'PRD-EGG-RAW',gradeCode:'GRADE_1',specCode:'LOOSE'};
    await db.query(`CREATE TABLE md_egg_source_changes(id uuid PRIMARY KEY,new_profile_code text,company_code text,house_code text,
      state text,contract_version smallint,payload jsonb,approval jsonb)`);
    await db.query("UPDATE brd_farms SET mapped_site_code=$1 WHERE farm_code='FARM-A'",[site]);
    await db.query("UPDATE wms_warehouses SET site_code=$1 WHERE warehouse_code='WH-A'",[site]);
    await db.query("UPDATE file_metadata SET store_code=$1 WHERE file_id='RAW-EVIDENCE'",[site]);
    await db.query("UPDATE md_egg_source_profiles SET site_code=$1,status='INACTIVE' WHERE profile_code='PROFILE-A'",[site]);
    try {
      const first=await source({GRADE_1:30},earlier,async()=>{
        const domain=await activateOwnedConversionDomain(db,{scopeId,houseCode:'HOUSE-A',warehouseCode:'WH-A'});
        await db.query(`INSERT INTO md_egg_source_profiles(profile_code,company_code,farm_code,site_code,house_code,product_mode,
          variety_code,effective_date,expire_date,created_by,updated_by)
          VALUES($1,'COMP-A','FARM-A',$3,'HOUSE-A','VARIANT','EGG_RED','2026-11-17',$4,'fixture','fixture'),
            ($2,'COMP-A','FARM-A',$3,'HOUSE-A','VARIANT','EGG_RED',$5,NULL,'fixture','fixture')`,[oldProfile,newProfile,site,earlier,day]);
        for (const [version,profile,payload,frozen] of [[1,oldProfile,{warehouseCode:'WH-A'},{...item,domainId:domain}],
          [2,newProfile,{},item]] as const) {
          await db.query(`INSERT INTO md_egg_source_changes VALUES($1,$2,'COMP-A','HOUSE-A','APPROVED',$3,$4,$5)`,
            [randomUUID(),profile,version,JSON.stringify(payload),JSON.stringify({snapshot:{items:[frozen]}})]);
        }
      });
      const second=await issueRaw({GRADE_1:70},day,2,async open=>{
        await db.query("UPDATE md_egg_source_changes SET approval=jsonb_set(approval,'{snapshot,items,0,specCode}', $1::jsonb) WHERE contract_version=2",[JSON.stringify('DRIFTED')]);
        await expect(open()).rejects.toThrow('当前 SKU 与来源档案冻结的品目、等级和规格不一致');
        await db.query("UPDATE md_egg_source_changes SET approval=$1 WHERE contract_version=2",[JSON.stringify({snapshot:{items:[item]}})]);
        await db.query("UPDATE wms_warehouses SET domain='TEST' WHERE warehouse_code='WH-A'");
        await expect(open()).rejects.toThrow('启用操作仓');
        await db.query("UPDATE wms_warehouses SET domain='OPERATIONAL' WHERE warehouse_code='WH-A'");
      });
      const frozen=await db.query("SELECT payload->'profile' AS profile FROM production_raw_receipts ORDER BY production_date");
      expect(frozen[0].profile).not.toHaveProperty('sourceContractVersion');
      expect(frozen[1].profile).toMatchObject({sourceContractVersion:2,approvedSkus:[item]});
      const request=plan(first.segments[0].id,30);
      request.inputs.push({rawSegmentId:second.segments[0].id,quantity:70});
      request.outputs[0].quantity=100;
      const approval=await approved(request);
      expect(await service.post(approval.id,approval.submit_key,approval.content_hash)).toMatchObject({inputQuantity:100,outputQuantity:100});
    } finally {
      await db.query(`DELETE FROM md_egg_source_profiles WHERE profile_code IN ($1,$2)`,[oldProfile,newProfile]);
      await db.query(`UPDATE brd_farms SET mapped_site_code='SITE-A' WHERE farm_code='FARM-A';
        UPDATE wms_warehouses SET site_code='SITE-A',domain='OPERATIONAL' WHERE warehouse_code='WH-A';
        UPDATE file_metadata SET store_code='SITE-A' WHERE file_id='RAW-EVIDENCE';
        UPDATE md_egg_source_profiles SET site_code='SITE-A',status='ACTIVE' WHERE profile_code='PROFILE-A';
        DROP TABLE md_egg_source_changes`);
    }
  });
  it('recombines two actual splits of one RAW source without duplicating the source or stock',async()=>{
    const rawSource=await source(),segment=rawSource.segments[0].id;
    const parents=[];
    for(const qty of [30,70]){
      const d=await approved(plan(segment,qty,'WIP'));
      const stock=await service.post(d.id,d.submit_key,d.content_hash);
      parents.push({parentBatchNo:stock.batches[0].batchNo,quantity:qty});
    }
    const request=plan(segment,100);
    request.operationKind='REPACKING';
    request.inputs=parents;
    const d=await approved(request),output=await service.post(d.id,d.submit_key,d.content_hash);
    const trace=await documents.stockBatches('COMP-A','HOUSE-A',day,'WH-A',{batchNo:output.batches[0].batchNo,view:'source'});
    expect(trace.items).toMatchObject([{batchQty:100,attributableQty:100,attribution:'EXACT',sources:[{rawSegmentId:segment}]}]);
    expect(trace.items[0].sources).toHaveLength(1);
    expect((await documents.balance('COMP-A','HOUSE-A',day,'WH-A')).stockByGrade.GRADE_1).toMatchObject({warehouseQty:100,attributableQty:100});
  });
  it('requires the approved actual transaction capability for the unified output writer',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id));
    await expect(db.transaction(m=>wms.postApprovedConversionOutput(m,a.id,1))).rejects.toThrow('OFFICIAL_CONVERSION_OUTPUT_CAPABILITY_REQUIRED');
    expect(await counts()).toEqual({batches:0,ledger:0,inputs:0,outputs:0});
  });
  it('rolls back an overclaimed second physical group, leaving its original approved document',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id,70)),b=await approved(plan(s.segments[0].id,60));
    await service.post(a.id,a.submit_key,a.content_hash);const before=await counts();
    await expect(service.post(b.id,b.submit_key,b.content_hash)).rejects.toThrow('实际剩余数量');
    expect(await counts()).toEqual(before);expect((await service.get(b.id)).state).toBe('APPROVED');
  });
  it('uses an actual WIP parent for repacking with paired debit, complete RAW roots and no new production credit',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id,100,'WIP')),first=await service.post(a.id,a.submit_key,a.content_hash);
    const parent=first.batches[0].batchNo;
    expect((await db.query('SELECT inventory_class FROM inv_batches WHERE batch_no=$1',[parent]))[0].inventory_class).toBe('WIP');
    await expect(db.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no,company_code,warehouse_code) VALUES($1,'FIFO_OUT',-1,'SYNTHETIC-SALE','COMP-A','WH-A')",[parent])).rejects.toThrow('OFFICIAL_CONVERSION_WIP_SALE_HOLD');
    const request=plan(s.segments[0].id,80);request.operationKind='REPACKING';request.inputs=[{parentBatchNo:parent,quantity:80}];
    const b=await approved(request),second=await service.post(b.id,b.submit_key,b.content_hash);
    expect(second).toMatchObject({inputQuantity:80,outputQuantity:80,lossQuantity:0});
    expect((await db.query('SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1',[parent]))[0]).toEqual({qty:'20',qty_available:'20'});
    expect(await counts()).toEqual({batches:2,ledger:3,inputs:2,outputs:2});
    expect((await db.query('SELECT count(*)::int AS n FROM production_conversion_inventory_debits'))[0].n).toBe(1);
    expect(await db.query('SELECT raw_segment_id FROM production_batch_raw_roots WHERE batch_no=$1',[second.batches[0].batchNo])).toEqual([{raw_segment_id:s.segments[0].id}]);
    expect(await effectiveProductionReceiptQuantity(db.manager,s.reportId)).toBe(100);
  });
  it('rejects scope bypass, self approval, quantity invention and loss without a protected real attachment',async()=>{
    const s=await source(),request=plan(s.segments[0].id);
    scope.allowedWarehouseCodes=['WH-B'];await expect(service.create(request)).rejects.toMatchObject({status:403});scope.allowedWarehouseCodes=['WH-A'];
    const d=await service.create(request),r=await service.ready(d.id,0,randomUUID());actor.permissions=['MENU_PROD_INBOUND:V,C,E,A'];
    await expect(service.approve(d.id,r.version,r.content_hash)).rejects.toMatchObject({status:409});
    const bad=plan(s.segments[0].id);bad.outputs[0].quantity=99;await expect(service.create(bad)).rejects.toMatchObject({status:400});
    const loss=plan(s.segments[0].id);loss.outputs=[{outputKind:'LOSS',gradeCode:'GRADE_1',quantity:100,lossReason:'PROCESSING_LOSS',evidenceFileId:'RAW-EVIDENCE'}];
    await expect(service.create(loss)).rejects.toThrow('保护附件');expect(await counts()).toEqual({batches:0,ledger:0,inputs:0,outputs:0});
  });
  it('records actual measured loss without inventing an inventory batch or production receipt',async()=>{
    const s=await source(),request=plan(s.segments[0].id);request.outputs[0].quantity=92;
    request.outputs.push({outputKind:'LOSS',gradeCode:'GRADE_1',quantity:8,lossReason:'PROCESSING_LOSS',evidenceFileId:'CONVERSION-EVIDENCE'});
    const a=await approved(request),r=await service.post(a.id,a.submit_key,a.content_hash);
    expect(r).toMatchObject({inputQuantity:100,outputQuantity:92,lossQuantity:8});
    expect(await counts()).toEqual({batches:1,ledger:1,inputs:1,outputs:2});expect(await effectiveProductionReceiptQuantity(db.manager,s.reportId)).toBe(100);
    const [{loss}]=await db.query("SELECT quantity::int AS loss FROM production_conversion_outputs WHERE output_kind='LOSS'");expect(loss).toBe(8);
  });
  it('preserves the signed DIRTY quarantine even when a writer tries to promote availability in the posting transaction',async()=>{
    const s=await source({DIRTY:20}),request=plan(s.segments[0].id,20);request.outputs[0].gradeCode='DIRTY';request.outputs[0].skuCode='SKU-DIRTY';
    const a=await approved(request),original=wms.postApprovedConversionOutput.bind(wms);
    const spy=jest.spyOn(wms,'postApprovedConversionOutput').mockImplementationOnce(async(m,id,no)=>{
      const result=await original(m,id,no);await m.query("UPDATE inv_batches SET status='AVAILABLE',qty_available=qty WHERE batch_no=$1",[result.batchNo]);return result;
    });
    try{await expect(service.post(a.id,a.submit_key,a.content_hash)).rejects.toThrow('OFFICIAL_CONVERSION_OUTPUT_IDENTITY_HOLD');}
    finally{spy.mockRestore();}
    expect(await counts()).toEqual({batches:0,ledger:0,inputs:0,outputs:0});
    const r=await service.post(a.id,a.submit_key,a.content_hash);
    expect((await db.query('SELECT status,qty_available FROM inv_batches WHERE batch_no=$1',[r.batches[0].batchNo]))[0]).toEqual({status:'QUARANTINE',qty_available:'0'});
  });
  it('serializes actual RAW consumption by two independent posting transactions',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id,70)),b=await approved(plan(s.segments[0].id,60));
    const result=await Promise.allSettled([service.post(a.id,a.submit_key,a.content_hash),service.post(b.id,b.submit_key,b.content_hash)]);
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(result.filter(r=>r.status==='rejected')).toHaveLength(1);
    const [{used}]=await db.query('SELECT sum(quantity)::int AS used FROM production_conversion_inputs');expect([60,70]).toContain(used);
    expect(await counts()).toEqual({batches:1,ledger:1,inputs:1,outputs:1});
  });
  it('keeps the paired debit valid inside a real PostgreSQL savepoint and rejects a duplicate conversion ledger',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id,100,'WIP')),first=await service.post(a.id,a.submit_key,a.content_hash);
    const request=plan(s.segments[0].id,80);request.inputs=[{parentBatchNo:first.batches[0].batchNo,quantity:80}];const b=await approved(request);
    const q=db.createQueryRunner();await q.connect();await q.startTransaction();await q.startTransaction();
    const spy=jest.spyOn(db,'transaction').mockImplementation(async(work:any)=>work(q.manager));
    try{
      await service.post(b.id,b.submit_key,b.content_hash);await q.commitTransaction();await q.commitTransaction();
    }catch(error){while(q.isTransactionActive)await q.rollbackTransaction();throw error;}
    finally{spy.mockRestore();await q.release();}
    expect(await counts()).toEqual({batches:2,ledger:3,inputs:2,outputs:2});
    await expect(db.query(`INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no,cost_change)
      SELECT parent_batch_no,'CONVERSION_OUT',-quantity,$1,-recorded_amount FROM production_conversion_inputs WHERE document_id=$2`,[b.document_no,b.id]))
      .rejects.toThrow('OFFICIAL_CONVERSION_DEBIT_LEDGER_HOLD');
  });
  it('refuses a bare derived RAW qualification with no actual conversion or persisted business-parent proof',async()=>{
    const s=await source();
    await expect(db.transaction(async m=>{
      await m.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,origin_ref,
        source_type,source_no,evidence_sha256,created_by) VALUES('SYNTHETIC-FORGED-CVT','50000000-0000-0000-0000-000000000001','COMP-A','PRD-EGG-RAW',
        'SKU-GRADE_1','QUALIFIED','DERIVED','SYNTHETIC-FORGED','TRANSFER','SYNTHETIC-FORGED',repeat('e',64),'1')`);
      await m.query("INSERT INTO production_batch_raw_roots VALUES('SYNTHETIC-FORGED-CVT',$1)",[s.segments[0].id]);
      await m.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,qty,qty_available,status,inventory_class,source_type,source_no,unit)
        VALUES('SYNTHETIC-FORGED-CVT','COMP-A','WH-A','PRD-EGG-RAW','SKU-GRADE_1',100,100,'AVAILABLE','STANDARD','TRANSFER','SYNTHETIC-FORGED','枚')`);
    })).rejects.toThrow('OFFICIAL_CONVERSION_DERIVATION_PROOF_HOLD');
    expect(await counts()).toEqual({batches:0,ledger:0,inputs:0,outputs:0});
  });
  it('moves a real WIP batch within its company with complete RAW roots and keeps its sales exclusion',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id,100,'WIP')),r=await service.post(a.id,a.submit_key,a.content_hash);
    scope.allowedWarehouseCodes.push('WH-A2');
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-CVT-WIP-MOVE',from_warehouse:'WH-A',to_warehouse:'WH-A2',items:[{batch_no:r.batches[0].batchNo,qty:20}]},actor);
    const [target]=await db.query("SELECT * FROM inv_batches WHERE source_type='TRANSFER'");
    expect(target).toMatchObject({warehouse_code:'WH-A2',inventory_class:'WIP',qty:'20',qty_available:'20'});
    const trace=await documents.stockBatches('COMP-A','HOUSE-A',day,'WH-A2',{view:'source',batchNo:target.batch_no});
    expect(trace.items).toMatchObject([{attributableQty:20,inventoryClass:'WIP',sources:[{rawSegmentId:s.segments[0].id}]}]);
    expect(await db.query('SELECT raw_segment_id FROM production_batch_raw_roots WHERE batch_no=$1',[target.batch_no])).toEqual([{raw_segment_id:s.segments[0].id}]);
    expect(await db.query('SELECT parent_batch_no FROM production_batch_derivation_parents WHERE batch_no=$1',[target.batch_no])).toEqual([{parent_batch_no:r.batches[0].batchNo}]);
    await expect(db.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no) VALUES($1,'SALE_OUTBOUND',-1,'SYNTHETIC-FORBIDDEN-WIP-SALE')",[target.batch_no]))
      .rejects.toThrow('OFFICIAL_CONVERSION_WIP_SALE_HOLD');
    await expect(db.query("UPDATE wms_transfer_items SET source_batch_no=$1 WHERE transfer_no='SYNTHETIC-CVT-WIP-MOVE'",[target.batch_no]))
      .rejects.toThrow('OFFICIAL_CONVERSION_BUSINESS_BINDING_IMMUTABLE');
    await expect(db.query("UPDATE wms_transfer SET status='PENDING' WHERE transfer_no='SYNTHETIC-CVT-WIP-MOVE'"))
      .rejects.toThrow('OFFICIAL_CONVERSION_TRANSFER_HEADER_IMMUTABLE');
    await expect(db.query("UPDATE wms_transfer SET status=NULL WHERE transfer_no='SYNTHETIC-CVT-WIP-MOVE'"))
      .rejects.toThrow('OFFICIAL_CONVERSION_TRANSFER_HEADER_IMMUTABLE');
    await expect(db.query("DELETE FROM wms_transfer_items WHERE transfer_no='SYNTHETIC-CVT-WIP-MOVE'"))
      .rejects.toThrow('OFFICIAL_CONVERSION_BUSINESS_BINDING_IMMUTABLE');
  });
  it('holds unsupported cross-company RAW dispatch before any inventory deduction or ledger write',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id)),r=await service.post(a.id,a.submit_key,a.content_hash),parent=r.batches[0].batchNo;
    scope.allowedCompanyCodes.push('COMP-B');scope.allowedWarehouseCodes.push('WH-B');
    await db.query(`INSERT INTO wms_transfer(transfer_no,from_warehouse,to_warehouse,status) VALUES('SYNTHETIC-OLD-PENDING-RAW','WH-A','WH-B','PENDING')`);
    await db.query("INSERT INTO wms_transfer_items(transfer_no,source_batch_no,expected_qty) VALUES('SYNTHETIC-OLD-PENDING-RAW',$1,20)",[parent]);
    const before=await counts();
    await expect(wms.dispatchTransfer('SYNTHETIC-OLD-PENDING-RAW',actor)).rejects.toThrow('不能先扣减发运');
    expect(await counts()).toEqual(before);expect((await db.query("SELECT status FROM wms_transfer WHERE transfer_no='SYNTHETIC-OLD-PENDING-RAW'"))[0].status).toBe('PENDING');
    expect((await db.query('SELECT qty,qty_available FROM inv_batches WHERE batch_no=$1',[parent]))[0]).toEqual({qty:'100',qty_available:'100'});
  });
  it.each(['USD',null])('preserves actual numeric input amounts and obtains currency only from the real purchase order (%s)',async currency=>{
    const s=await source(),parent=await purchase(currency),request=plan(s.segments[0].id,19,'WIP');
    request.warehouseCode='WH-P';request.inputs=[{parentBatchNo:parent,quantity:19}];request.outputs[0].locationCode='LOC-P';request.outputs[0].evidenceFileId='CONVERSION-P-EVIDENCE';
    const lookup=await service.sources('COMP-A','WH-P','PRD-EGG-RAW');
    expect(lookup.inventory.find((row:any)=>row.batch_no===parent)?.cost_status).toBe(currency?'CONFIRMED':'UNKNOWN');
    const a=await approved(request),r=await service.post(a.id,a.submit_key,a.content_hash);
    const [input]=await db.query('SELECT * FROM production_conversion_inputs WHERE document_id=$1 AND parent_batch_no=$2',[a.id,parent]);
    expect(input).toMatchObject({recorded_unit_cost:'2.123456',recorded_amount:'40.345664',cost_status:currency?'CONFIRMED':'UNKNOWN',currency_code:currency,
      unit_cost:currency?'2.123456':null,known_amount:currency?'40.345664':null});
    expect((await db.query('SELECT cost_change FROM inv_ledger WHERE id=$1',[input.inventory_ledger_id]))[0].cost_change).toBe('-40.345664');
    expect((await db.query('SELECT cost_change FROM inv_ledger WHERE batch_no=$1',[r.batches[0].batchNo]))[0].cost_change).toBeNull();
    expect(await db.query('SELECT root_batch_no FROM production_batch_roots WHERE batch_no=$1',[r.batches[0].batchNo])).toEqual([{root_batch_no:parent}]);
    expect(await db.query('SELECT raw_segment_id FROM production_batch_raw_roots WHERE batch_no=$1',[r.batches[0].batchNo])).toEqual([]);
    expect(await effectiveProductionReceiptQuantity(db.manager,s.reportId)).toBe(100);
  });
  it('requires an unchanged signed open posting period and rolls back a document after the period closes',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id));reviewer();actor.permissions.push('MENU_FIN2_AR_LEDGER:E');
    await documents.setPostingPeriod({companyCode:'COMP-A',houseCode:'HOUSE-A',periodMonth:day.slice(0,7),state:'CLOSED',expectedVersion:1,
      evidenceFileId:'PERIOD-EVIDENCE',reason:'Owned synthetic close before conversion posting'});maker();
    await expect(service.post(a.id,a.submit_key,a.content_hash)).rejects.toThrow('财务实名签认开放');expect(await counts()).toEqual({batches:0,ledger:0,inputs:0,outputs:0});
  });
  it('does not claim a WIP input was repacked before its actual upstream conversion took place',async()=>{
    const priorDay=new Date(Date.parse(day)-86400000).toISOString().slice(0,10),s=await source({GRADE_1:100},priorDay);
    const a=await approved(plan(s.segments[0].id,100,'WIP')),r=await service.post(a.id,a.submit_key,a.content_hash),request=plan(s.segments[0].id,80);
    request.operationKind='REPACKING';request.operationDate=priorDay;request.inputs=[{parentBatchNo:r.batches[0].batchNo,quantity:80}];
    await expect(service.create(request)).rejects.toThrow('实际取得日期');request.operationDate=day;
    const b=await approved(request);expect(await service.post(b.id,b.submit_key,b.content_hash)).toMatchObject({outputQuantity:80});
  });
  it('keeps RAW-only conversion cost unknown beside a lower sorted DRAFT audit anchor in an active shared domain',async()=>{
    const s=await source();await activateOwnedConversionDomain(db);
    await db.query(`INSERT INTO production_cutover_scopes(id,company_code,house_code,version,first_production_date,state,warehouse_code,flock_id,source_profile_code,manifest_sha256,evidence,confirmed_by)
      VALUES('00000000-0000-0000-0000-000000000001','COMP-A','HOUSE-A2',1,'2026-11-17','DRAFT','WH-A','FLOCK-A','PROFILE-A2',repeat('d',64),'{"synthetic":true}','fixture');
      INSERT INTO production_inventory_domains(scope_id,company_code,warehouse_code,product_code)
        VALUES('00000000-0000-0000-0000-000000000001','COMP-A','WH-A','PRD-EGG-RAW')`);
    const a=await approved(plan(s.segments[0].id)),r=await service.post(a.id,a.submit_key,a.content_hash);
    expect((await db.query('SELECT scope_id FROM production_batch_qualifications WHERE batch_no=$1',[r.batches[0].batchNo]))[0].scope_id)
      .toBe('50000000-0000-0000-0000-000000000001');
    expect((await db.query('SELECT official_inventory_cost_known($1) AS known',[r.batches[0].batchNo]))[0].known).toBe(false);
    expect((await db.query(`SELECT ${officialInventoryCostAggregate('b')} FROM inv_batches b`))[0]).toMatchObject({value:null,cost_pending_batches:1,cost_pending_quantity:'100'});
  });
  it('serializes an all-RAW measured loss with a target-domain pause even though it creates no inventory or ledger rows',async()=>{
    const s=await source(),domain=await activateOwnedConversionDomain(db),request=plan(s.segments[0].id);
    request.outputs=[{outputKind:'LOSS',gradeCode:'GRADE_1',quantity:100,lossReason:'PROCESSING_LOSS',evidenceFileId:'CONVERSION-EVIDENCE'}];
    const a=await approved(request),q=db.createQueryRunner();await q.connect();await q.startTransaction();
    const spy=jest.spyOn(db,'transaction').mockImplementation(async(work:any)=>work(q.manager));
    try{
      await service.post(a.id,a.submit_key,a.content_hash);
      await expect(db.query(`INSERT INTO production_inventory_domain_events(id,domain_id,state,version,intent_key,content_hash,reason,signed_by,evidence_file_id,evidence_checksum)
        VALUES($1::uuid,$2,'SUSPENDED',3,$1::text,repeat('d',64),'Owned concurrent pause','1','DOMAIN-BUSINESS',repeat('d',64))`,[randomUUID(),domain]))
        .rejects.toThrow('OFFICIAL_INVENTORY_DOMAIN_BUSY');
      await q.commitTransaction();
    }finally{spy.mockRestore();if(q.isTransactionActive)await q.rollbackTransaction();await q.release();}
    expect(await counts()).toEqual({batches:0,ledger:0,inputs:1,outputs:1});
  });
  it('posts an eight-input fourteen-output measured group with complete roots within the bounded transaction time',async()=>{
    const s=await source(Object.fromEntries(grades.map(g=>[g,10]))),request=plan(s.segments[0].id,80);
    request.inputs=s.segments.map((segment:any)=>({rawSegmentId:segment.id,quantity:10}));
    request.outputs=Array.from({length:12},()=>({outputKind:'STOCK' as const,gradeCode:'GRADE_1',quantity:5,skuCode:'SKU-GRADE_1',locationCode:'LOC-A',evidenceFileId:'CONVERSION-EVIDENCE'}));
    for(const grade of ['DIRTY','BROKEN'])request.outputs.push({outputKind:'STOCK',gradeCode:grade,quantity:10,skuCode:`SKU-${grade}`,locationCode:'LOC-A',evidenceFileId:'CONVERSION-EVIDENCE'});
    const a=await approved(request),began=Date.now(),r=await service.post(a.id,a.submit_key,a.content_hash);expect(Date.now()-began).toBeLessThan(10000);
    expect(r.batches).toHaveLength(14);expect((await db.query('SELECT count(*)::int AS n FROM production_batch_raw_roots'))[0].n).toBe(112);
    expect(await effectiveProductionReceiptQuantity(db.manager,s.reportId)).toBe(80);
  });
  it('preserves both actual RAW and purchase roots when a mixed WIP group is transferred',async()=>{
    const mixed=await mixedParent();await wms.confirmTransfer({transfer_no:'SYNTHETIC-MIXED-WIP-MOVE',from_warehouse:'WH-P',to_warehouse:'WH-A2',items:[{batch_no:mixed.batchNo,qty:10}]},actor);
    const [target]=await db.query("SELECT batch_no,inventory_class FROM inv_batches WHERE source_no='SYNTHETIC-MIXED-WIP-MOVE'");
    expect(target.inventory_class).toBe('WIP');
    const trace=await documents.stockBatches('COMP-A','HOUSE-A',day,'WH-A2',{view:'source',batchNo:target.batch_no});
    expect(trace.items).toHaveLength(1);
    expect(trace.items[0]).toMatchObject({batchQty:10,attributableQty:null,attribution:'MIXED'});
    expect(trace.items[0].sources.map(s=>s.kind).sort()).toEqual(['PURCHASE','RAW']);
    scope.allowedWarehouseCodes=['WH-A2'];
    const restricted=await documents.stockBatches('COMP-A','HOUSE-A',day,'WH-A2',{batchNo:target.batch_no});
    expect(restricted.items).toMatchObject([{batchQty:10,attributableQty:null,attribution:'UNRESOLVED',sources:[]}]);
    expect(JSON.stringify(restricted)).not.toContain(mixed.purchaseRoot);
    expect(await db.query('SELECT root_batch_no FROM production_batch_roots WHERE batch_no=$1',[target.batch_no])).toEqual([{root_batch_no:mixed.purchaseRoot}]);
    expect(await db.query('SELECT raw_segment_id FROM production_batch_raw_roots WHERE batch_no=$1',[target.batch_no])).toEqual([{raw_segment_id:mixed.rawSegment}]);
  });
  it.each([false,true])('rejects a FINISHED child omitting its actual mixed RAW/WIP parent, including a later business binding (%s)',async preexisting=>{
    const mixed=await mixedParent(),fake='SYNTHETIC-OMITTED-MIXED-ROOT';
    const child=async(m:any)=>{
      // Deliberately exercises the preexisting generic ordinary-root admission boundary. The later actual RAW relation must independently close it.
      await m.query(`INSERT INTO production_batch_qualifications(batch_no,scope_id,company_code,product_code,sku_code,disposition,origin_kind,origin_ref,
        source_type,source_no,evidence_sha256,created_by) VALUES($1,'50000000-0000-0000-0000-000000000002','COMP-A','PRD-EGG-RAW','SKU-GRADE_1',
        'QUALIFIED','DERIVED','SYNTHETIC-OMITTED','UNTRUSTED-SELF-FLAG','SYNTHETIC-OMITTED',repeat('e',64),'1')`,[fake]);
      await m.query('INSERT INTO production_batch_roots VALUES($1,$2)',[fake,mixed.purchaseRoot]);
      await m.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,location_code,product_code,sku_code,qty,qty_available,status,inventory_class,
        source_type,source_no,unit,grade_code_std,quality_grade,spec_code,egg_date,inbound_date,expire_date)
        VALUES($1,'COMP-A','WH-A2','LOC-A2','PRD-EGG-RAW','SKU-GRADE_1',10,10,'AVAILABLE','STANDARD','UNTRUSTED-SELF-FLAG','SYNTHETIC-OMITTED','枚','GRADE_1','GRADE_1','LOOSE',$2,$2,$2::date+20)`,[fake,day]);
      await writeInvLedger(m,{batchNo:fake,changeType:'TRANSFER_IN',qtyChange:10,refNo:'SYNTHETIC-OMITTED',operator:'maker',companyCode:'COMP-A',warehouseCode:'WH-A2',note:'Owned negative test'});
    };
    if(preexisting)await db.transaction(child);const before=await counts();
    await expect(db.transaction(async m=>{
      if(!preexisting)await child(m);
      await m.query("INSERT INTO wms_transfer(transfer_no,from_warehouse,to_warehouse,status,received_at,in_transit_qty,received_qty) VALUES('SYNTHETIC-LATE-MIXED','WH-P','WH-A2','COMPLETED',now(),10,10)");
      await m.query('UPDATE inv_batches SET qty=qty-10,qty_available=qty_available-10 WHERE batch_no=$1',[mixed.batchNo]);
      await writeInvLedger(m,{batchNo:mixed.batchNo,changeType:'TRANSFER_OUT',qtyChange:-10,refNo:'SYNTHETIC-LATE-MIXED',operator:'maker',companyCode:'COMP-A',warehouseCode:'WH-P',note:'Owned negative test'});
      await m.query("INSERT INTO wms_transfer_items(transfer_no,source_batch_no,target_batch_no,expected_qty,received_qty) VALUES('SYNTHETIC-LATE-MIXED',$1,$2,10,10)",[mixed.batchNo,fake]);
    })).rejects.toThrow(/OFFICIAL_CONVERSION_(DERIVATION_PROOF|BUSINESS_TARGET)_HOLD/);
    expect(await counts()).toEqual(before);expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[mixed.batchNo]))[0].qty).toBe('39');
  });
  it.each(['CONVERSION','PURCHASE','OFF'])('rejects a late RAW receipt relation that borrows an existing %s target instead of creating its own child',async kind=>{
    const s=await source(),a=await approved(plan(s.segments[0].id,100,'WIP')),r=await service.post(a.id,a.submit_key,a.content_hash),parent=r.batches[0].batchNo;
    let target=parent;if(kind==='PURCHASE')target=await purchase();
    if(kind==='OFF'){
      target='SYNTHETIC-OFF-TARGET';await db.query(`INSERT INTO inv_batches(batch_no,company_code,warehouse_code,product_code,sku_code,qty,qty_available,status,unit)
        VALUES($1,'COMP-B','WH-B','PRD-EGG-RAW','SKU-GRADE_1',20,20,'AVAILABLE','枚')`,[target]);
    }
    const before=await counts();
    await expect(db.transaction(async m=>{
      await m.query("INSERT INTO wms_transfer(transfer_no,from_warehouse,to_warehouse,status,received_at,in_transit_qty,received_qty) VALUES('SYNTHETIC-BORROWED-TARGET','WH-A','WH-A','COMPLETED',now(),20,20)");
      await m.query('UPDATE inv_batches SET qty=qty-20,qty_available=qty_available-20 WHERE batch_no=$1',[parent]);
      await writeInvLedger(m,{batchNo:parent,changeType:'TRANSFER_OUT',qtyChange:-20,refNo:'SYNTHETIC-BORROWED-TARGET',operator:'maker',companyCode:'COMP-A',warehouseCode:'WH-A',note:'Owned negative test'});
      await m.query("INSERT INTO wms_transfer_items(transfer_no,source_batch_no,target_batch_no,expected_qty,received_qty) VALUES('SYNTHETIC-BORROWED-TARGET',$1,$2,20,20)",[parent,target]);
    })).rejects.toThrow('OFFICIAL_CONVERSION_BUSINESS_TARGET_HOLD');
    expect(await counts()).toEqual(before);
  });
  it('rejects reusing one real child for a second transfer and rejects positive receipt quantities without a target',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id,100,'WIP')),r=await service.post(a.id,a.submit_key,a.content_hash),parent=r.batches[0].batchNo;
    scope.allowedWarehouseCodes.push('WH-A2');await wms.confirmTransfer({transfer_no:'SYNTHETIC-FIRST-CHILD',from_warehouse:'WH-A',to_warehouse:'WH-A2',items:[{batch_no:parent,qty:20}]},actor);
    const [target]=await db.query("SELECT batch_no FROM inv_batches WHERE source_no='SYNTHETIC-FIRST-CHILD'");const before=await counts();
    for(const child of [target.batch_no,null])await expect(db.transaction(async m=>{
      await m.query("INSERT INTO wms_transfer(transfer_no,from_warehouse,to_warehouse,status,received_at,in_transit_qty,received_qty) VALUES('SYNTHETIC-SECOND-CHILD','WH-A','WH-A2','COMPLETED',now(),20,20)");
      await m.query('UPDATE inv_batches SET qty=qty-20,qty_available=qty_available-20 WHERE batch_no=$1',[parent]);
      await writeInvLedger(m,{batchNo:parent,changeType:'TRANSFER_OUT',qtyChange:-20,refNo:'SYNTHETIC-SECOND-CHILD',operator:'maker',companyCode:'COMP-A',warehouseCode:'WH-A',note:'Owned negative test'});
      await m.query("INSERT INTO wms_transfer_items(transfer_no,source_batch_no,target_batch_no,expected_qty,received_qty) VALUES('SYNTHETIC-SECOND-CHILD',$1,$2,20,20)",[parent,child]);
    })).rejects.toThrow(child?'OFFICIAL_CONVERSION_BUSINESS_TARGET_HOLD':'OFFICIAL_CONVERSION_TRANSFER_ROW_HOLD');
    expect(await counts()).toEqual(before);
  });
  it('holds a later customer-return allocation change or POS return relation that would introduce RAW custody',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id)),r=await service.post(a.id,a.submit_key,a.content_hash),parent=r.batches[0].batchNo;
    await db.query("INSERT INTO sal_return_orders VALUES(1,'SYNTHETIC-RETURN','COMPLETED');INSERT INTO sal_return_items VALUES(1,1,101,10,0,'PENDING')");
    await db.query('INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,outbound_qty) VALUES(1,101,$1,0)',[parent]);
    await expect(db.query('UPDATE sal_order_item_batch_allocations SET outbound_qty=10 WHERE id=1')).rejects.toThrow('OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED');
    await db.query("INSERT INTO sal_store_sales VALUES(1,'SYNTHETIC-POS','PAID')");
    await db.query('INSERT INTO store_sale_allocations VALUES(1,1,$1,10,0)',[parent]);
    await expect(db.query('UPDATE store_sale_allocations SET returned_qty=10 WHERE id=1')).rejects.toThrow('OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED');
    await expect(db.query("UPDATE sal_store_sales SET status='RETURNED' WHERE id=1")).rejects.toThrow('OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED');
    expect((await db.query('SELECT outbound_qty FROM sal_order_item_batch_allocations WHERE id=1'))[0].outbound_qty).toBe('0');
    expect((await db.query('SELECT returned_qty FROM store_sale_allocations WHERE id=1'))[0].returned_qty).toBe('0');
  });
  it('protects the actual receipt date of a qualified ordinary purchase transfer too',async()=>{
    await source();await purchase();
    await expect(db.query("UPDATE wms_transfer SET received_at=received_at-interval '1 day' WHERE transfer_no='SYNTHETIC-PURCHASE-ACTUAL-ADMISSION'"))
      .rejects.toThrow('OFFICIAL_CONVERSION_TRANSFER_HEADER_IMMUTABLE');
  });
  it('moves real quarantined RAW defects with complete custody and freezes the completed disposition time',async()=>{
    const s=await source({DIRTY:20}),request=plan(s.segments[0].id,20,'WIP');request.outputs[0].gradeCode='DIRTY';request.outputs[0].skuCode='SKU-DIRTY';
    const a=await approved(request),r=await service.post(a.id,a.submit_key,a.content_hash);scope.allowedWarehouseCodes.push('WH-A2');actor.permissions.push('MENU_INV_BATCH:E');
    await wms.disposeDefectInventory({disposition_no:'CVT-D1',batch_no:r.batches[0].batchNo,action:'TRANSFER',qty:10,reason:'Owned actual defect custody',
      target_warehouse_code:'WH-A2',target_location_code:'LOC-A2'},actor);
    const balance=await documents.balance('COMP-A','HOUSE-A',day,'WH-A');
    expect(balance.stockByGrade.DIRTY).toMatchObject({attributableQty:10,warehouseQty:10});
    const trace=await documents.stockBatches('COMP-A','HOUSE-A',day,'WH-A',{view:'source',gradeCode:'DIRTY'});
    expect(trace.items[0]).toMatchObject({status:'QUARANTINE',inventoryClass:'WIP',batchQty:10,availableQty:0,attributableQty:10});
    const [target]=await db.query("SELECT * FROM inv_batches WHERE source_type='DEFECT_TRANSFER'");expect(target).toMatchObject({qty:'10',qty_available:'0',status:'QUARANTINE',inventory_class:'WIP'});
    await expect(db.query("UPDATE wms_defect_dispositions SET updated_at=updated_at-interval '1 day' WHERE disposition_no='CVT-D1'"))
      .rejects.toThrow('OFFICIAL_CONVERSION_BUSINESS_BINDING_IMMUTABLE');
    const before=await counts();
    await expect(wms.disposeDefectInventory({disposition_no:'CVT-P1',batch_no:r.batches[0].batchNo,action:'PROCESSING',qty:5,reason:'Owned unsupported custody test'},actor))
      .rejects.toThrow('OFFICIAL_CONVERSION_DISPOSITION_CUSTODY_REQUIRED');expect(await counts()).toEqual(before);
  });
  it('receives a real WIP transfer with a separately bound damaged child and preserves both physical quantities',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id,100,'WIP')),r=await service.post(a.id,a.submit_key,a.content_hash),parent=r.batches[0].batchNo;
    scope.allowedWarehouseCodes.push('WH-A2');await wms.createTransfer({transfer_no:'CVT-TD1',from_warehouse:'WH-A',to_warehouse:'WH-A2',to_location:'LOC-A2',items:[{batch_no:parent,qty:20}]},actor);
    await wms.dispatchTransfer('CVT-TD1',actor);
    await wms.receiveTransfer('CVT-TD1',{items:[{batch_no:parent,received_qty:15,damaged_qty:5}],to_location:'LOC-A2'},actor);
    const [accepted]=await db.query("SELECT target_batch_no,damaged_batch_no,received_qty,damaged_qty FROM wms_transfer_items WHERE transfer_no='CVT-TD1'");
    expect(accepted).toMatchObject({received_qty:'15.000',damaged_qty:'5.000'});expect(accepted.damaged_batch_no).toBeTruthy();
    const batches=await db.query('SELECT qty,grade_code_std,inventory_class FROM inv_batches WHERE batch_no=ANY($1::text[]) ORDER BY qty DESC',[[accepted.target_batch_no,accepted.damaged_batch_no]]);
    expect(batches).toEqual([{qty:'15',grade_code_std:'GRADE_1',inventory_class:'WIP'},{qty:'5',grade_code_std:'BROKEN',inventory_class:'WIP'}]);
    expect((await db.query('SELECT count(*)::int AS n FROM production_batch_raw_roots WHERE batch_no=ANY($1::text[])',[[accepted.target_batch_no,accepted.damaged_batch_no]]))[0].n).toBe(2);
    expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[parent]))[0].qty).toBe('80');
  });
  it('reserves direct conversion batch identities before qualification is visible to another PostgreSQL connection',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id)),batch=`CVT-${a.id.replace(/-/g,'')}-1`;
    await db.query("INSERT INTO inv_batches(batch_no,company_code,warehouse_code,qty,qty_available,status) VALUES('SYNTHETIC-OFF-SOURCE','COMP-B','WH-B',20,20,'AVAILABLE')");
    const q=db.createQueryRunner();await q.connect();await q.startTransaction();
    try{
      await q.query("INSERT INTO wms_transfer(transfer_no,from_warehouse,to_warehouse,status) VALUES('SYNTHETIC-FUTURE-CLAIM','WH-B','WH-B','COMPLETED')");
      await expect(q.query("INSERT INTO wms_transfer_items(transfer_no,source_batch_no,target_batch_no,expected_qty,received_qty) VALUES('SYNTHETIC-FUTURE-CLAIM','SYNTHETIC-OFF-SOURCE',$1,20,20)",[batch]))
        .rejects.toThrow('OFFICIAL_CONVERSION_BUSINESS_TARGET_HOLD');
    }finally{await q.rollbackTransaction();await q.release();}
    const posting=db.createQueryRunner(),competing=db.createQueryRunner();await posting.connect();await competing.connect();await posting.startTransaction();await competing.startTransaction();
    const spy=jest.spyOn(db,'transaction').mockImplementation(async(work:any)=>work(posting.manager));
    try{
      expect(await service.post(a.id,a.submit_key,a.content_hash)).toMatchObject({outputQuantity:100});
      expect((await competing.query('SELECT count(*)::int AS n FROM production_batch_qualifications WHERE batch_no=$1',[batch]))[0].n).toBe(0);
      await competing.query("INSERT INTO wms_transfer(transfer_no,from_warehouse,to_warehouse,status) VALUES('SYNTHETIC-CONCURRENT-CLAIM','WH-B','WH-B','COMPLETED')");
      await expect(competing.query("INSERT INTO wms_transfer_items(transfer_no,source_batch_no,target_batch_no,expected_qty,received_qty) VALUES('SYNTHETIC-CONCURRENT-CLAIM','SYNTHETIC-OFF-SOURCE',$1,20,20)",[batch]))
        .rejects.toThrow('OFFICIAL_CONVERSION_BUSINESS_TARGET_HOLD');
      await competing.rollbackTransaction();await posting.commitTransaction();
    }finally{spy.mockRestore();if(posting.isTransactionActive)await posting.rollbackTransaction();if(competing.isTransactionActive)await competing.rollbackTransaction();await posting.release();await competing.release();}
    expect((await db.query('SELECT count(*)::int AS n FROM wms_transfer_items'))[0].n).toBe(0);
  });
  it.each(['allocation-first','completion-first'])('serializes a return completion with a concurrent RAW allocation change (%s)',async order=>{
    const s=await source(),a=await approved(plan(s.segments[0].id)),r=await service.post(a.id,a.submit_key,a.content_hash),parent=r.batches[0].batchNo;
    await db.query("INSERT INTO sal_return_orders VALUES(1,'SYNTHETIC-RACE-RETURN','INSPECTING');INSERT INTO sal_return_items VALUES(1,1,101,10,0,'PENDING')");
    await db.query('INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,outbound_qty) VALUES(1,101,$1,0)',[parent]);
    const allocation='UPDATE sal_order_item_batch_allocations SET outbound_qty=10 WHERE id=1',completion="UPDATE sal_return_orders SET status='COMPLETED' WHERE id=1";
    const first=order==='allocation-first'?allocation:completion,second=order==='allocation-first'?completion:allocation;
    const one=db.createQueryRunner(),two=db.createQueryRunner();await one.connect();await two.connect();await one.startTransaction();await two.startTransaction();
    try{
      await one.query(first);await one.query('SET CONSTRAINTS ALL IMMEDIATE');
      await expect(two.query(second)).rejects.toThrow('OFFICIAL_CONVERSION_RETURN_BUSY');await two.rollbackTransaction();await one.commitTransaction();
      await expect(db.query(second)).rejects.toThrow('OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED');
    }finally{if(one.isTransactionActive)await one.rollbackTransaction();if(two.isTransactionActive)await two.rollbackTransaction();await one.release();await two.release();}
  });
  it.each([false,true])('holds customer return custody for a pure-inventory conversion product and its ordinary transfer descendant (%s)',async transferred=>{
    const s=await source(),root=await purchase(),request=plan(s.segments[0].id,19);request.warehouseCode='WH-P';request.inputs=[{parentBatchNo:root,quantity:19}];
    request.outputs[0].locationCode='LOC-P';request.outputs[0].evidenceFileId='CONVERSION-P-EVIDENCE';const a=await approved(request),r=await service.post(a.id,a.submit_key,a.content_hash);
    let parent=r.batches[0].batchNo;
    if(transferred){scope.allowedWarehouseCodes.push('WH-A2');await wms.confirmTransfer({transfer_no:'CVT-PURE-STOCK',from_warehouse:'WH-P',to_warehouse:'WH-A2',items:[{batch_no:parent,qty:10}]},actor);
      parent=(await db.query("SELECT batch_no FROM inv_batches WHERE source_no='CVT-PURE-STOCK'"))[0].batch_no;}
    expect((await db.query('SELECT official_inventory_conversion_related($1) AS related',[parent]))[0].related).toBe(true);
    expect(await db.query('SELECT 1 FROM production_batch_raw_roots WHERE batch_no=$1',[parent])).toHaveLength(0);
    await db.query("INSERT INTO sal_return_orders VALUES(1,'SYNTHETIC-PURE-RETURN','COMPLETED');INSERT INTO sal_return_items VALUES(1,1,101,5,0,'PENDING')");
    await expect(db.query('INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,outbound_qty) VALUES(1,101,$1,5)',[parent]))
      .rejects.toThrow('OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED');
  });
  it('prevents ordinary converted stock descendants from acquiring a fake return credit or an unpaired stock change',async()=>{
    const s=await source(),root=await purchase(),request=plan(s.segments[0].id,19);request.warehouseCode='WH-P';request.inputs=[{parentBatchNo:root,quantity:19}];
    request.outputs[0].locationCode='LOC-P';request.outputs[0].evidenceFileId='CONVERSION-P-EVIDENCE';const a=await approved(request),r=await service.post(a.id,a.submit_key,a.content_hash);
    scope.allowedWarehouseCodes.push('WH-A2');await wms.confirmTransfer({transfer_no:'CVT-NO-FAKE-RETURN',from_warehouse:'WH-P',to_warehouse:'WH-A2',items:[{batch_no:r.batches[0].batchNo,qty:10}]},actor);
    const parent=(await db.query("SELECT batch_no FROM inv_batches WHERE source_no='CVT-NO-FAKE-RETURN'"))[0].batch_no,before=await counts();
    await expect(db.transaction(async m=>{
      await m.query('UPDATE inv_batches SET qty=qty+1,qty_available=qty_available+1 WHERE batch_no=$1',[parent]);
      await writeInvLedger(m,{batchNo:parent,changeType:'SALE_RETURN',qtyChange:1,refNo:'SYNTHETIC-NONEXISTENT-RETURN',operator:'maker',companyCode:'COMP-A',warehouseCode:'WH-A2',note:'Owned negative test'});
    })).rejects.toThrow('OFFICIAL_CONVERSION_DERIVED_CREDIT_HOLD');
    await expect(db.query('UPDATE inv_batches SET qty=qty+1,qty_available=qty_available+1 WHERE batch_no=$1',[parent])).rejects.toThrow('OFFICIAL_CONVERSION_PHYSICAL_BALANCE_HOLD');
    await expect(db.query("INSERT INTO inv_ledger(batch_no,change_type,qty_change,ref_no,company_code,warehouse_code) VALUES($1,'FIFO_OUT',-1,'SYNTHETIC-UNPAIRED','COMP-A','WH-A2')",[parent]))
      .rejects.toThrow('OFFICIAL_CONVERSION_PHYSICAL_BALANCE_HOLD');expect(await counts()).toEqual(before);
  });
  it('locks return membership before discovering source lines so a third connection cannot add a hidden RAW return item',async()=>{
    const s=await source(),a=await approved(plan(s.segments[0].id)),r=await service.post(a.id,a.submit_key,a.content_hash),parent=r.batches[0].batchNo;
    await db.query("INSERT INTO sal_return_orders VALUES(1,'SYNTHETIC-MEMBER-RACE','INSPECTING');INSERT INTO sal_return_items VALUES(1,1,101,0,0,'PENDING')");
    await db.query('INSERT INTO sal_order_item_batch_allocations(id,sales_order_item_id,batch_no,outbound_qty) VALUES(1,102,$1,0)',[parent]);
    const head=db.createQueryRunner(),addition=db.createQueryRunner(),outbound=db.createQueryRunner();
    await head.connect();await addition.connect();await outbound.connect();await head.startTransaction();await addition.startTransaction();await outbound.startTransaction();
    try{
      await head.query("UPDATE sal_return_orders SET status='COMPLETED' WHERE id=1");await head.query('SET CONSTRAINTS ALL IMMEDIATE');
      await expect(addition.query("INSERT INTO sal_return_items VALUES(2,1,102,5,0,'PENDING')")).rejects.toThrow('OFFICIAL_CONVERSION_RETURN_BUSY');await addition.rollbackTransaction();
      await outbound.query('UPDATE sal_order_item_batch_allocations SET outbound_qty=5 WHERE id=1');await outbound.commitTransaction();await head.commitTransaction();
      await expect(db.query("INSERT INTO sal_return_items VALUES(2,1,102,5,0,'PENDING')")).rejects.toThrow('OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED');
      expect(await db.query('SELECT id FROM sal_return_items ORDER BY id')).toEqual([{id:'1'}]);
    }finally{for(const runner of [head,addition,outbound]){if(runner.isTransactionActive)await runner.rollbackTransaction();await runner.release();}}
  });
  it('preserves an actual ordinary qualified purchase transfer across companies when it has no conversion custody',async()=>{
    await source();const root=await purchase();scope.allowedCompanyCodes.push('COMP-B');scope.allowedWarehouseCodes.push('WH-B');
    await wms.confirmTransfer({transfer_no:'SYNTHETIC-ORDINARY-CROSS',from_warehouse:'WH-P',to_warehouse:'WH-B',items:[{batch_no:root,qty:5}]},actor);
    const [target]=await db.query(`SELECT *,official_inventory_allows(batch_no,company_code,warehouse_code,product_code,sku_code,material_code) AS visible,
      official_inventory_conversion_related(batch_no) AS related FROM inv_batches WHERE source_no='SYNTHETIC-ORDINARY-CROSS'`);
    expect(target).toMatchObject({company_code:'COMP-B',warehouse_code:'WH-B',qty:'5',visible:true,related:false});expect(target.batch_no).toMatch(/^XFR-[a-f\d]{32}$/);
    expect((await db.query('SELECT qty FROM inv_batches WHERE batch_no=$1',[root]))[0].qty).toBe('14');
  });
});
