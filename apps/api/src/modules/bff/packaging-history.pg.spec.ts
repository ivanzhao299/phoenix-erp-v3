import {reviewEvidenceFixture} from './packaging-review.fixture';
import {packingEvidence} from './packaging-evidence.service';
import {TraceabilityService} from '../traceability/traceability.service';
import {DataSource} from 'typeorm';
import {randomUUID} from 'crypto';
import {PackagingHistoryService,historyDate} from './packaging-history.service';
import {PackagingHandoverService} from './packaging-handover.service';
import {PackagingBoxService} from './packaging-box.service';
import {PackagingWorkflowPolicy} from './packaging-workflow-policy';
import {PackagingInventoryIntegrationService} from '../sales-v2/services/packaging-inventory-integration.service';
import {EggInventoryService} from '../sales-v2/services/egg-inventory.service';
import {packingHistoryFixture} from './packaging-history.fixture';
import {PackagingHistoryD1cEvidence1789353300496} from '../../database/migrations/1789353300496-PackagingHistoryD1cEvidence';

(process.env.PACKAGING_HISTORY_PG==='1'?describe:describe.skip)('D1-C isolated full-schema PG18',()=>{
 let ds:DataSource,f:Awaited<ReturnType<typeof packingHistoryFixture>>,history:PackagingHistoryService,workflow:PackagingHandoverService,policy:PackagingWorkflowPolicy;
 beforeAll(async()=>{ds=new DataSource({type:'postgres',host:'127.0.0.1',port:55432,username:'postgres',database:'packaging_history_test',entities:[],logging:false});await ds.initialize();
 expect(Number((await ds.query('SHOW server_version_num'))[0].server_version_num)).toBeGreaterThanOrEqual(180000);
 expect((await ds.query('SELECT count(*)::int n FROM migrations'))[0].n).toBeGreaterThanOrEqual(82);});
 afterAll(async()=>{await ds?.destroy();});
 beforeEach(async()=>{
 f=await packingHistoryFixture(ds);
 const scopes={resolve:async()=>f.scope};history=new PackagingHistoryService(ds.manager,scopes as any);
 policy=new PackagingWorkflowPolicy();policy.get=()=>({version:'TEST',R:true,B:true,P:true,V:true,H:true,Q:true,encodingVersion:'TEST-NON-BUSINESS-v1',receiptMode:'C'});
 const cls={get:()=>({username:'TEST'})};
 const inv=new PackagingInventoryIntegrationService(ds,cls as any,new EggInventoryService(ds,cls as any),{resolveMode:async()=> 'PACKAGING_INBOUND'} as any);
 workflow=new PackagingHandoverService(history,new PackagingBoxService(),policy,inv);
 });
 async function command(action:string,body:any,key=randomUUID()){const d=await workflow.detail(f.prefix,f.req);return workflow.command(action,f.prefix,key,{expectedRevision:d.revision,...body},f.req);}
 async function register(){return command('REGISTER',{registrationKind:'FIRST_LABEL_CONFIRMED',reason:'TEST fixture never labelled',items:f.outputs.map((_,outputOrdinal)=>({outputOrdinal,boxOrdinal:1,declaration:'TEST fixture only'}))});}
 async function prepare(){await register();const d=await workflow.detail(f.prefix,f.req);let handoverScans:string[]=[];
 for(const purpose of ['LABEL_CHECK','HANDOVER']){
 const session=await command('SESSION',{purpose});
 for(const box of d.boxes){const label=box.labels.find((l:any)=>l.kind==='CANONICAL').code;
 if(purpose==='LABEL_CHECK')await command('PRINT',{boxId:box.boxId,labelCode:label,printType:'NORMAL',copies:1,templateVersion:'TEST'});
 const scan=await command('SCAN',{boxId:box.boxId,labelCode:label,purpose,method:'MANUAL',sessionId:session.eventId});
 if(purpose==='HANDOVER')handoverScans.push(scan.eventId);
 }}
 return {expectedRevision:d.revision,productionDate:d.record.productionDate,shiftId:f.shiftId,boxIds:d.boxes.map((b:any)=>b.boxId).sort(),verificationIds:handoverScans.sort(),warehouseCode:f.warehouse,locationCode:f.location,receiverUserId:f.actor};}
 async function foreignRegistration(other:any,boxId:string){
   const op=randomUUID(),event=randomUUID();await ds.query(`INSERT INTO pkg_packing_operations(id,actor_id,action,idempotency_key,packing_id,payload_hash,state) VALUES($1,$2,'REGISTER',$3,$4,'TEST','PENDING')`,[op,other.actor,randomUUID(),other.packingId]);
   await ds.query(`INSERT INTO pkg_packing_events(id,packing_id,event_type,actor_id,event_key,operation_id,payload,payload_hash) VALUES($1::uuid,$2,'REGISTRATION',$3,$1::text,$4,$5,'TEST')`,[event,other.packingId,other.actor,op,JSON.stringify({reason:'TEST foreign declaration',boxes:[{boxId}]})]);return event;
 }
 async function counts(){return (await ds.query(`SELECT (SELECT count(*)::int FROM inv_batches WHERE packaging_batch_ref=$1) batches,
 (SELECT count(*)::int FROM inv_ledger WHERE ref_no=$1) ledger,(SELECT count(*)::int FROM pkg_handover_records WHERE packing_code=$1) handovers`,[f.prefix]))[0];}
 // Added as executable parity design; NOT run in the workspace-only session.
 it.each(['valid','zero','negative','fractional','string','null-group','empty-id','swapped-groups','empty-original-sku'])('SQL and JS agree on TEST evidence %s',async scenario=>{
   const x=reviewEvidenceFixture();
   if(scenario==='zero')x.groups[0].qty=0;
   if(scenario==='negative')x.groups[0].qty=-1;
   if(scenario==='fractional'){x.groups[0].qty=29.5;x.groups[1].qty=20.5;}
   if(scenario==='string')(x.groups[0] as any).qty='30';
   if(scenario==='empty-id')x.groups[0].skuCode='';
   if(scenario==='swapped-groups'){x.groups[0].qty=20;x.groups[1].qty=30;}
   if(scenario==='empty-original-sku')x.record.batches_json[0].skuCode='';
   const ledger=x.ledger();if(scenario==='null-group')(x.receipt.groups as any)[0]=null;
   const expected=packingEvidence(x.record,[],ledger,x.handovers,x.receipt).state;
   const [row]=await ds.query('SELECT packing_posting_state($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb) state',[x.record,[],ledger,x.handovers,x.receipt].map(v=>JSON.stringify(v)));
   expect(row.state).toBe(expected);
 });
 it('reads CLOSED original record and only its linked sources without writing identities',async()=>{const d=await workflow.detail(f.prefix,f.req);expect(d.record).toMatchObject({productionDate:'2026-01-02',totalEggs:50,totalBoxes:2});expect(d.shift.status).toBe('CLOSED');expect(d.sources).toHaveLength(1);expect(d.boxes).toEqual([]);expect(d.handover.state).toBe('PENDING');});
 it('denies empty company/farm scope without leaking totalMatching',async()=>{f.scope.allowedCompanyCodes=[];expect((await history.list({},f.req)).totalMatching).toBe(0);await expect(workflow.detail(f.prefix,f.req)).rejects.toThrow('RECORD_NOT_ACCESSIBLE');});
 it('rejects invalid calendar date and altered cursor',async()=>{expect(()=>historyDate('2026-02-30')).toThrow();await expect(history.list({cursor:'garbage'},f.req)).rejects.toThrow();});
 it('registers every original box and replays exactly the same identity',async()=>{const body={registrationKind:'FIRST_LABEL_CONFIRMED',reason:'TEST',items:f.outputs.map((_,outputOrdinal)=>({outputOrdinal,boxOrdinal:1,declaration:'TEST'}))};const d=await workflow.detail(f.prefix,f.req),key=randomUUID();
 const results=await Promise.all([1,2].map(()=>workflow.command('REGISTER',f.prefix,key,{...body,expectedRevision:d.revision},f.req)));expect(results[0]).toEqual(results[1]);expect((await workflow.detail(f.prefix,f.req)).boxes).toHaveLength(2);});
 // Pending real PG execution after a fresh migration rebuild.
 it('UNKNOWN print blocks both NORMAL and reasoned REPRINT without another event',async()=>{
   await register();const d=await workflow.detail(f.prefix,f.req),box=d.boxes[0],label=box.labels.find((l:any)=>l.kind==='CANONICAL').code;
   const body={boxId:box.boxId,labelCode:label,printType:'NORMAL',copies:1,templateVersion:'TEST'};
   const request=await command('PRINT',body);
   await command('PRINT_RESULT',{requestId:request.eventId,type:'UNKNOWN'});
   for(const printType of ['NORMAL','REPRINT'])await expect(command('PRINT',{...body,printType,reason:'TEST retry'})).rejects.toThrow('PRINT_RESULT_UNRESOLVED');
   expect((await workflow.detail(f.prefix,f.req)).events.filter((e:any)=>e.event_type==='PRINT_REQUEST')).toHaveLength(1);
   await command('PRINT_RESULT',{requestId:request.eventId,type:'FAILED'});
   await expect(command('PRINT',{...body,printType:'REPRINT',reason:'TEST known failure'})).resolves.toHaveProperty('eventId');
 });
 it('Q gate rejects registration with no business changes',async()=>{const old=await policy.get(f.company,f.farm);policy.get=()=>({...old,Q:false,H:false});await expect(register()).rejects.toThrow('WORKFLOW_NOT_READY');expect((await workflow.detail(f.prefix,f.req)).boxes).toHaveLength(0);});
 it('commits original CLOSED date and all groups exactly once under concurrent retry',async()=>{const body=await prepare(),key=randomUUID();const r=await Promise.all([1,2].map(()=>workflow.command('CONFIRM',f.prefix,key,body,f.req)));expect(r[0]).toEqual(r[1]);expect(r[0].receiptState).toBe('RECORDED');expect(await counts()).toEqual({batches:2,ledger:2,handovers:1});
 await ds.query('UPDATE inv_batches SET qty_available=0 WHERE packaging_batch_ref=$1',[f.prefix]);expect((await workflow.detail(f.prefix,f.req)).handover.state).toBe('COMMITTED');expect(await workflow.command('CONFIRM',f.prefix,key,body,f.req)).toEqual(r[0]);});
 it('same operation key cannot change receiver',async()=>{const body=await prepare(),key=randomUUID();await workflow.command('CONFIRM',f.prefix,key,body,f.req);await expect(workflow.command('CONFIRM',f.prefix,key,{...body,receiverUserId:'999'},f.req)).rejects.toThrow('IDEMPOTENCY_CONFLICT');expect(await counts()).toEqual({batches:2,ledger:2,handovers:1});});
 it('rejects missing HANDOVER scans, wrong date and receiver without inventory',async()=>{const body=await prepare();for(const changed of [{verificationIds:[]},{productionDate:'2026-01-03'},{receiverUserId:'99999999'}])await expect(workflow.command('CONFIRM',f.prefix,randomUUID(),{...body,...changed},f.req)).rejects.toThrow();expect(await counts()).toEqual({batches:0,ledger:0,handovers:0});});
 it('keeps events append-only at database level',async()=>{await register();await expect(ds.query("UPDATE pkg_packing_events SET payload='{}' WHERE packing_id=$1",[f.packingId])).rejects.toThrow('PACKING_EVENTS_APPEND_ONLY');});
 it('preserves conflicting cross-record alias claims and refuses scan',async()=>{await register();const other=await packingHistoryFixture(ds);const [box]=await ds.query(`INSERT INTO pkg_packing_boxes(id,packing_id,output_ordinal,box_ordinal,original_qty) VALUES($1,$2,0,1,30) RETURNING id`,[randomUUID(),other.packingId]);const d=await workflow.detail(f.prefix,f.req),eventId=d.events[0].id,code='TEST-ALIAS-'+randomUUID(),otherEvent=await foreignRegistration(other,box.id);
 await Promise.all([d.boxes[0].boxId,box.id].map(boxId=>ds.transaction(async db=>{await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,['packaging-chain:false']);await new PackagingBoxService().claim(db,[{code,boxId,kind:'ALIAS',eventId:boxId===box.id?otherEvent:eventId}]);})));
 expect((await ds.query('SELECT state,owner_box_id FROM pkg_packing_code_registry WHERE normalized_code=$1',[code]))[0]).toEqual({state:'AMBIGUOUS',owner_box_id:null});await expect(workflow.boxes.resolve(ds.manager,f.packingId,code)).rejects.toThrow('LABEL_UNRESOLVABLE');});
 it('reports exact original day quantities independently of current inventory',async()=>{const report=await history.summary({dateFrom:'2026-01-02',dateTo:'2026-01-02',aggregation:'SHIFT',shiftId:f.shiftId},f.req);expect(report).toMatchObject({totalEggs:50,totalBoxes:2,basis:'TERMINAL_RECORDS'});});
 it('SQL list, detail and summary retain the same committed snapshot after current quantity evolution',async()=>{
   const body=await prepare();await workflow.command('CONFIRM',f.prefix,randomUUID(),body,f.req);
   await ds.query('UPDATE inv_batches SET qty=qty-1,qty_available=qty_available-1 WHERE packaging_batch_ref=$1',[f.prefix]);
   const list=await history.list({packingCode:f.prefix,handoverState:'COMMITTED'},f.req),d=await workflow.detail(f.prefix,f.req);
   expect(list.totalMatching).toBe(1);expect(list.items[0].handover).toEqual(d.handover);
   expect(d.handover).toMatchObject({state:'COMMITTED',currentInventoryQuality:'UNKNOWN'});
   const summary=await history.summary({dateFrom:'2026-01-02',dateTo:'2026-01-02',aggregation:'DAY'},f.req);
   expect(summary.records[0].handover).toEqual(d.handover);
 });
 it('rejects missing, VOID, test and wrong-shift exact grading sources',async()=>{
   const mutations=[`status='VOID'`,`is_test=true`,`shift_id=NULL`];
   for(const mutation of mutations){const runner=ds.createQueryRunner();await runner.connect();await runner.startTransaction();
     try{await runner.query(`UPDATE pkg_grading_records SET ${mutation} WHERE code=$1`,[f.prefix]);const [r]=await history.rows(f.scope,runner.manager,f.prefix);expect(history.view(r).actions.registerBoxes.reasons).toContain('来源关联缺失');}
     finally{await runner.rollbackTransaction();await runner.release();}}
 });
 it('does not fill remaining boxes after a partial legacy handover',async()=>{
   await ds.query(`INSERT INTO pkg_handover_records(code,packing_code,box_count,location,production_date) VALUES($1,$1,1,$2,'2026-01-02')`,[f.prefix,f.location]);
   await expect(register()).rejects.toThrow('EVIDENCE_PARTIAL');expect(await counts()).toEqual({batches:0,ledger:0,handovers:1});
 });
 it('different concurrent keys still post only once',async()=>{const body=await prepare();const results=await Promise.allSettled([1,2].map(()=>workflow.command('CONFIRM',f.prefix,randomUUID(),body,f.req)));expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(await counts()).toEqual({batches:2,ledger:2,handovers:1});});
 it.each(['inv_ledger','pkg_handover_records'])('rolls back every inventory group and operation when %s insert fails',async table=>{
   const body=await prepare(),name='test_fail_'+randomUUID().replace(/-/g,'');
   await ds.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.${table==='inv_ledger'?'ref_no':'packing_code'}='${f.prefix}' ${table==='inv_ledger'?"AND NEW.sku_code='"+f.prefix+"-SKU20'":''} THEN RAISE EXCEPTION 'TEST_INJECTED_FAILURE'; END IF; RETURN NEW; END $$`);
   await ds.query(`CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`);
   try{await expect(workflow.command('CONFIRM',f.prefix,randomUUID(),body,f.req)).rejects.toThrow('TEST_INJECTED_FAILURE');expect(await counts()).toEqual({batches:0,ledger:0,handovers:0});expect((await ds.query(`SELECT count(*)::int n FROM pkg_packing_operations WHERE packing_id=$1 AND action='CONFIRM'`,[f.packingId]))[0].n).toBe(0);}
   finally{await ds.query(`DROP TRIGGER ${name} ON ${table}`);await ds.query(`DROP FUNCTION ${name}()`);}
 });
 it('rejects labels that became ambiguous after scan but before confirm',async()=>{
   const body=await prepare(),d=await workflow.detail(f.prefix,f.req),other=await packingHistoryFixture(ds),boxId=randomUUID();
   await ds.query(`INSERT INTO pkg_packing_boxes(id,packing_id,output_ordinal,box_ordinal,original_qty) VALUES($1,$2,0,1,30)`,[boxId,other.packingId]);
   const eventId=await foreignRegistration(other,boxId);await ds.transaction(db=>workflow.boxes.claim(db,[{code:d.boxes[0].labels[0].code,boxId,kind:'ALIAS',eventId}]));
   await expect(workflow.command('CONFIRM',f.prefix,randomUUID(),body,f.req)).rejects.toThrow('LABEL_UNRESOLVABLE');expect(await counts()).toEqual({batches:0,ledger:0,handovers:0});
 });
 it('retires old namespace permanently when relabelling and preserves the box identity',async()=>{
   await register();const d=await workflow.detail(f.prefix,f.req),old=d.boxes[0].labels[0].code;
   await command('VOID',{labelCode:old,reason:'TEST damaged label',dispositionDeclaration:'TEST removed old physical label'});
   const next=await workflow.detail(f.prefix,f.req);expect(next.boxes.map((b:any)=>b.boxId)).toEqual(d.boxes.map((b:any)=>b.boxId));
   await expect(workflow.boxes.resolve(ds.manager,f.packingId,old)).rejects.toThrow('LABEL_UNRESOLVABLE');
   await expect(ds.transaction(db=>workflow.boxes.claim(db,[{code:old,boxId:d.boxes[1].boxId,kind:'CANONICAL',eventId:d.events[0].id}]))).rejects.toThrow();
 });
 it('new schema really supports empty up/down/up and blocks down with registry-only evidence',async()=>{
   const runner=ds.createQueryRunner(),schema='test_migration_'+randomUUID().replace(/-/g,'');await runner.connect();await runner.startTransaction();
   try{await runner.query(`CREATE SCHEMA ${schema}`);await runner.query(`SET LOCAL search_path TO ${schema},public`);
     await runner.query('CREATE TABLE sys_user(user_id bigint PRIMARY KEY)');await runner.query('CREATE TABLE pkg_packing_records(id integer PRIMARY KEY)');
     const migration=new PackagingHistoryD1cEvidence1789353300496();await migration.up(runner);await migration.down(runner);await migration.up(runner);
     expect(Number((await runner.query("SELECT count(*) n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=current_schema()::regnamespace AND NOT t.tgisinternal"))[0].n)).toBeGreaterThanOrEqual(6);
     await runner.query(`INSERT INTO pkg_packing_code_registry(normalized_code,state) VALUES('TEST-RETIRED','RETIRED')`);
     await expect(migration.down(runner)).rejects.toThrow('EVIDENCE_EXISTS');
   }finally{await runner.rollbackTransaction();await runner.release();}
 });
 it('operation commit cannot point at another operation result',async()=>{
   const registration=await register(),op=randomUUID();
   await expect(ds.query(`INSERT INTO pkg_packing_operations(id,actor_id,action,idempotency_key,packing_id,payload_hash,state,result_event_id,committed_at) VALUES($1,$2,'REGISTER',$3,$4,'TEST','COMMITTED',$5,now())`,[op,f.actor,randomUUID(),f.packingId,registration.eventId])).rejects.toThrow('PACKING_OPERATION_RESULT_CONFLICT');
 });
 it('claim cannot borrow another original registration evidence',async()=>{
   await register();const other=await packingHistoryFixture(ds),boxId=randomUUID();await ds.query(`INSERT INTO pkg_packing_boxes(id,packing_id,output_ordinal,box_ordinal,original_qty) VALUES($1,$2,0,1,30)`,[boxId,other.packingId]);
   const d=await workflow.detail(f.prefix,f.req);await expect(ds.transaction(db=>workflow.boxes.claim(db,[{code:'TEST-BAD-'+randomUUID(),boxId,kind:'ALIAS',eventId:d.events[0].id}]))).rejects.toThrow('PACKING_CLAIM_EVIDENCE_CONFLICT');
 });
 it.each(['DELETE','RENAME','OWNER','VOID_REVIVE'])('claim history rejects %s',async mutation=>{
   await register();const d=await workflow.detail(f.prefix,f.req),box=d.boxes[0],label=box.labels[0].code;
   if(mutation==='VOID_REVIVE'){await command('VOID',{labelCode:label,reason:'TEST',dispositionDeclaration:'TEST destroyed'});await expect(ds.query(`UPDATE pkg_packing_code_claims SET status='ACTIVE' WHERE normalized_code=$1`,[label])).rejects.toThrow('PACKING_CLAIM_HISTORY_IMMUTABLE');}
   else if(mutation==='DELETE')await expect(ds.query('DELETE FROM pkg_packing_code_claims WHERE normalized_code=$1',[label])).rejects.toThrow('PACKING_CLAIM_HISTORY_IMMUTABLE');
   else if(mutation==='RENAME')await expect(ds.query(`UPDATE pkg_packing_code_claims SET normalized_code='TEST-RENAMED' WHERE normalized_code=$1`,[label])).rejects.toThrow('PACKING_CODE_IMMUTABLE');
   else await expect(ds.query('UPDATE pkg_packing_code_registry SET owner_box_id=$2 WHERE normalized_code=$1',[label,d.boxes[1].boxId])).rejects.toThrow('PACKING_NAMESPACE_CONFLICT');
 });
 it('old JSON without SKU uses immutable registered output bindings after master changes',async()=>{
   const old=f.outputs.map(o=>{const {skuCode,productCode,...rest}=o;return rest;});
   await ds.query('UPDATE pkg_packing_records SET batches_json=$2 WHERE id=$1',[f.packingId,JSON.stringify(old)]);
   const body=await prepare();await workflow.command('CONFIRM',f.prefix,randomUUID(),body,f.req);
   await ds.query(`UPDATE product_skus SET status='INACTIVE' WHERE product_code=$1`,[f.prefix]);
   const d=await workflow.detail(f.prefix,f.req);expect(d.handover.state).toBe('COMMITTED');expect(d.receipt.evidence[0].payload.outputBindings).toHaveLength(2);
   expect(d.outputs[0].original.skuCode).toBeUndefined();expect((await history.list({packingCode:f.prefix},f.req)).items[0].handover.state).toBe('COMMITTED');
   expect((await history.summary({dateFrom:'2026-01-02',dateTo:'2026-01-02',aggregation:'DAY'},f.req)).records[0].handover.state).toBe('COMMITTED');
 });
 it('official sales reserve and delivery outbound exhaust stock without erasing original posting',async()=>{
   const [today]=await ds.query('SELECT CURRENT_DATE::text date');
   for(const table of ['pkg_packing_records','pkg_grading_records','pkg_source_batches'])await ds.query(`UPDATE ${table} SET production_date=$2 WHERE shift_id=$1`,[f.shiftId,today.date]);
   await ds.query('UPDATE pkg_work_shifts SET production_date=$2 WHERE id=$1',[f.shiftId,today.date]);
   const body=await prepare();await workflow.command('CONFIRM',f.prefix,randomUUID(),body,f.req);const before=await workflow.detail(f.prefix,f.req);
   const [order]=await ds.query(`INSERT INTO sal_sales_orders(order_no,company_code) VALUES($1,$2) RETURNING id::text`,[f.prefix,f.company]);
   for(const o of f.outputs)await ds.query(`INSERT INTO sal_order_items(sales_order_id,product_code,sku_code,qty,unit_price,amount) VALUES($1,$2,$3,$4,1,$4)`,[order.id,f.prefix,o.skuCode,o.eggs]);
   const [delivery]=await ds.query(`INSERT INTO sal_delivery_orders(delivery_no,company_code) VALUES($1,$2) RETURNING id::text`,[f.prefix,f.company]);
   const inv=new EggInventoryService(ds,{get:()=>({username:f.prefix})} as any);
   await ds.transaction(async db=>{await inv.reserveInventory(order.id,f.prefix,f.company,db,f.warehouse);await inv.confirmOutbound(order.id,f.prefix,f.company,f.prefix,delivery.id,50,db);});
   const after=await workflow.detail(f.prefix,f.req);expect(after.handover).toMatchObject({state:'COMMITTED',currentInventoryQuality:'UNKNOWN'});expect(after.inventory.batches.every((b:any)=>Number(b.qty)===0&&Number(b.qty_available)===0)).toBe(true);
   expect(after.receipt.evidence[0].payload).toEqual(before.receipt.evidence[0].payload);
 });
 it('official WMS partial transfer creates a split target while preserving original receipt',async()=>{
   const {WmsService}=await import('../wms/wms.service');
   const body=await prepare(),key=randomUUID();const committed=await workflow.command('CONFIRM',f.prefix,key,body,f.req);
   const before=await workflow.detail(f.prefix,f.req),batch=before.inventory.batches[0];
   const target=f.prefix+'-W2',targetLocation=f.prefix+'-L2';
   await ds.query(`INSERT INTO wms_warehouses(warehouse_code,warehouse_name,company_code,status) VALUES($1,$1,$2,'ACTIVE')`,[target,f.company]);
   await ds.query(`INSERT INTO wms_locations(location_code,location_name,warehouse_code,status) VALUES($1,$1,$2,'NORMAL')`,[targetLocation,target]);
   f.scope.allowedWarehouseCodes.push(target);
   const wms=new WmsService(ds.manager,{get:(key:string)=>key==='dataScope'?f.scope:undefined} as any),user={userId:f.actor,username:f.prefix};
   const transferNo=f.prefix+'-TRANSFER';
   await wms.createTransfer({transfer_no:transferNo,from_warehouse:f.warehouse,to_warehouse:target,to_location:targetLocation,items:[{batch_no:batch.batch_no,qty:10}]},user);
   await wms.dispatchTransfer(transferNo,user);await wms.receiveTransfer(transferNo,{receive_all:true,to_location:targetLocation},user);
   const [item]=await ds.query('SELECT * FROM wms_transfer_items WHERE transfer_no=$1',[transferNo]);expect(item.target_batch_no).toBeTruthy();expect(Number(item.received_qty)).toBe(10);
   const after=await workflow.detail(f.prefix,f.req);expect(after.handover).toMatchObject({state:'COMMITTED',currentInventoryQuality:'UNKNOWN'});expect(after.receipt.evidence[0].payload).toEqual(before.receipt.evidence[0].payload);
   const stock=await ds.query('SELECT batch_no,qty::int FROM inv_batches WHERE batch_no=ANY($1::text[])',[[batch.batch_no,item.target_batch_no]]);expect(stock.reduce((n:any,b:any)=>n+b.qty,0)).toBe(Number(batch.qty));
   const ledger=await ds.query('SELECT qty_change::int,warehouse_code,company_code FROM inv_ledger WHERE ref_no=$1 ORDER BY qty_change',[transferNo]);expect(ledger).toHaveLength(2);expect(ledger.map((l:any)=>l.qty_change)).toEqual([-10,10]);expect(ledger.map((l:any)=>l.warehouse_code)).toEqual([f.warehouse,target]);expect(ledger.every((l:any)=>l.company_code===f.company)).toBe(true);
   const countBefore=await counts();expect(await workflow.command('CONFIRM',f.prefix,key,body,f.req)).toEqual(committed);expect(await counts()).toEqual(countBefore);
   f.scope.allowedWarehouseCodes=f.scope.allowedWarehouseCodes.filter(w=>w!==target);const restricted=await workflow.detail(f.prefix,f.req);expect(restricted.handover.currentInventoryQuality).toBe('UNKNOWN');expect(JSON.stringify(restricted)).not.toContain(target);expect(JSON.stringify(restricted)).not.toContain(item.target_batch_no);
 });
 it('typed JSON database checks reject null session purpose',async()=>{
   const op=randomUUID();await ds.query(`INSERT INTO pkg_packing_operations(id,actor_id,action,idempotency_key,packing_id,payload_hash,state) VALUES($1,$2,'SESSION',$3,$4,'TEST','PENDING')`,[op,f.actor,randomUUID(),f.packingId]);
   await expect(ds.query(`INSERT INTO pkg_packing_events(id,packing_id,event_type,actor_id,event_key,operation_id,payload,payload_hash) VALUES($1::uuid,$2,'VERIFICATION_SESSION',$3,$1::text,$4,$5,'TEST')`,[randomUUID(),f.packingId,f.actor,op,JSON.stringify({purpose:null,expiresAt:'2026-01-02',targetRevision:'a'.repeat(64)})])).rejects.toMatchObject({driverError:{code:'23514'}});
 });
 it('strict print whitelist and calendar/filter validation return client errors',async()=>{
   const d=await workflow.detail(f.prefix,f.req);await expect(workflow.command('PRINT',f.prefix,randomUUID(),{expectedRevision:d.revision,boxId:randomUUID(),copies:1,printType:'NORMAL',labelCode:'TEST',templateVersion:'TEST',devicePrinted:true},f.req)).rejects.toMatchObject({status:400});
   for(const q of [{packingCode:' '},{shiftStatus:'RANDOM'},{pageSize:'20'}])await expect(history.list(q as any,f.req)).rejects.toMatchObject({status:400});
   const report=await history.summary({dateFrom:'2026-01-01',dateTo:'2026-01-07',aggregation:'DAY'},f.req);expect(report.days).toHaveLength(7);expect(report.days[0].totalEggs).toBe(0);
   await expect(history.summary({dateFrom:'2026-01-03',dateTo:'2026-01-03',aggregation:'SHIFT',shiftId:f.shiftId},f.req)).rejects.toThrow('SHIFT_DATE_MISMATCH');
 });

 it('SQL keyset preserves exact count, bound filters and stable tie ordering',async()=>{
   await ds.query(`INSERT INTO pkg_packing_records(code,shift_id,production_date,batches_json,grading_codes_json,total_eggs,total_boxes) SELECT $1||'-'||n,$2,CASE WHEN n>128 THEN NULL ELSE '2026-01-02'::date END,$3::jsonb,$4::jsonb,50,2 FROM generate_series(1,130) n`,[f.prefix,f.shiftId,JSON.stringify(f.outputs),JSON.stringify([f.prefix])]);
   const first=await history.list({pageSize:'25'},f.req);expect(first.totalMatching).toBe(131);expect(first.items).toHaveLength(25);expect(first.hasMore).toBe(true);
   await ds.query(`INSERT INTO pkg_packing_records(code,shift_id,production_date,batches_json,grading_codes_json,total_eggs,total_boxes) VALUES($1,$2,'2026-01-02',$3,$4,50,2)`,[f.prefix+'-LATE',f.shiftId,JSON.stringify(f.outputs),JSON.stringify([f.prefix])]);
   const all=[...first.items];let page=first;while(page.hasMore){page=await history.list({pageSize:'25',cursor:page.nextCursor!},f.req);expect(page.totalMatching).toBe(131);all.push(...page.items);}expect(new Set(all.map(x=>x.record.id)).size).toBe(131);expect(all.slice(-2).every(x=>x.record.productionDate===null)).toBe(true);expect(all.some(x=>x.record.code.endsWith('-LATE'))).toBe(false);expect((await history.list({},f.req)).totalMatching).toBe(132);expect(await history.list({packingCode:f.prefix+'-ABSENT'},f.req)).toMatchObject({items:[],totalMatching:0,hasMore:false,nextCursor:null});
   await expect(history.list({pageSize:'50',cursor:first.nextCursor!},f.req)).rejects.toThrow('INVALID_FILTER');
   const cursor=JSON.parse(Buffer.from(first.nextCursor!,'base64url').toString());cursor.lastId='1';await expect(history.list({cursor:Buffer.from(JSON.stringify(cursor)).toString('base64url')},f.req)).rejects.toThrow('INVALID_FILTER');
 });

 it('output contract does not expose unrecognized historical internal fields',async()=>{
   const outputs=f.outputs.map(o=>({...o,internalCost:'TEST-INTERNAL-COST',internalNotes:'TEST-INTERNAL-NOTE'}));await ds.query('UPDATE pkg_packing_records SET batches_json=$2 WHERE id=$1',[f.packingId,JSON.stringify(outputs)]);
   const detail=await workflow.detail(f.prefix,f.req),list=await history.list({packingCode:f.prefix},f.req);
   for(const value of [detail,list]){expect(JSON.stringify(value)).not.toContain('TEST-INTERNAL-COST');expect(JSON.stringify(value)).not.toContain('TEST-INTERNAL-NOTE');}
   expect(detail.outputs[0].original).toEqual(f.outputs[0]);
 });

 it('legacy packaging trace returns only exact authorized source links even before inventory exists',async()=>{
   const other=await packingHistoryFixture(ds),trace=new TraceabilityService(ds,history);
   const result=await trace.traceByPackaging(f.prefix,[f.company],f.scope);expect(result.sources).toHaveLength(1);expect(result.sources[0].sourceBatchCode).toBe(f.prefix);
   await expect(trace.traceByPackaging(other.prefix,[f.company],f.scope)).rejects.toThrow('RECORD_NOT_ACCESSIBLE');
 });

 it('legacy adapter requires real existing scans and replays safely after flags close',async()=>{
   await prepare();const d=await workflow.detail(f.prefix,f.req),key=randomUUID(),req={...f.req,headers:{'idempotency-key':key}};
   const body={packingCode:f.prefix,boxes:d.boxes.map((b:any)=>b.labels.find((l:any)=>l.kind==='CANONICAL').code),location:f.location,receiver:f.prefix};
   const first=await workflow.compatConfirm(body,req);expect(first.receiptState).toBe('RECORDED');
   policy.get=()=>({version:'CLOSED',R:false,B:false,P:false,V:false,H:false,Q:false,encodingVersion:null,receiptMode:'C'});
   expect(await workflow.compatConfirm(body,req)).toEqual(first);expect(await counts()).toEqual({batches:2,ledger:2,handovers:1});
 });

 it('duplicate box scanning through a different key gives 409 instead of counting twice',async()=>{
   await register();const d=await workflow.detail(f.prefix,f.req),session=await command('SESSION',{purpose:'HANDOVER'}),box=d.boxes[0];
   const body={boxId:box.boxId,labelCode:box.labels[0].code,purpose:'HANDOVER',method:'SCANNER',sessionId:session.eventId};
   await command('SCAN',body);await expect(command('SCAN',body)).rejects.toMatchObject({status:409});
 });

 it('DAY sums two authorized shifts while SHIFT stays exact and VOID is separate',async()=>{
   const other=await packingHistoryFixture(ds);await ds.query('UPDATE pkg_work_shifts SET site_id=$2 WHERE id=$1',[other.shiftId,f.farm]);await ds.query('UPDATE brd_houses SET farm_code=$2 WHERE house_code=$1',[other.house,f.farm]);
   const q={dateFrom:'2026-01-02',dateTo:'2026-01-02',aggregation:'DAY'};
   expect(await history.summary(q,f.req)).toMatchObject({totalEggs:100,totalBoxes:4,gradingEggs:100});
   expect(await history.summary({...q,aggregation:'SHIFT',shiftId:f.shiftId},f.req)).toMatchObject({totalEggs:50,totalBoxes:2});
   await ds.query(`UPDATE pkg_packing_records SET status='VOID' WHERE id=$1`,[other.packingId]);expect(await history.summary(q,f.req)).toMatchObject({totalEggs:50,totalBoxes:2,voidCount:1});
 });
 it('registers 101 boxes with distinct stable canonical identities',async()=>{
   const output={...f.outputs[0],boxes:101,eggs:3030};await ds.query('UPDATE pkg_packing_records SET batches_json=$2,total_boxes=101,total_eggs=3030 WHERE id=$1',[f.packingId,JSON.stringify([output])]);
   await ds.query('UPDATE pkg_source_batches SET received_qty=3030 WHERE batch_code=$1',[f.prefix]);await ds.query('UPDATE pkg_grading_records SET total_output=3030 WHERE code=$1',[f.prefix]);
   await command('REGISTER',{registrationKind:'FIRST_LABEL_CONFIRMED',reason:'TEST 101 boxes',items:Array.from({length:101},(_,i)=>({outputOrdinal:0,boxOrdinal:i+1,declaration:'TEST'}))});
   const d=await workflow.detail(f.prefix,f.req);expect(d.boxes).toHaveLength(101);expect(new Set(d.boxes.flatMap((b:any)=>b.labels.map((l:any)=>l.code))).size).toBe(101);
 });

 it('an orphaned immutable receipt never makes an empty record writable PENDING',async()=>{
   const [r]=await history.rows(f.scope,ds.manager,f.prefix),receipt={originalHash:'TEST'};
   expect(packingEvidence(r,[],[],[],receipt)).toMatchObject({state:'INVENTORY_ONLY',quality:'UNKNOWN'});
   const [sql]=await ds.query(`SELECT packing_posting_state($1::jsonb,'[]','[]','[]',$2::jsonb) state`,[JSON.stringify(r),JSON.stringify(receipt)]);expect(sql.state).toBe('INVENTORY_ONLY');
 });

 it('equal totals with a wrong original ledger SKU are partial, never a new posting',async()=>{
   const body=await prepare();await workflow.command('CONFIRM',f.prefix,randomUUID(),body,f.req);await ds.query('UPDATE inv_ledger SET sku_code=$2 WHERE ref_no=$1 AND qty_change=30',[f.prefix,f.outputs[1].skuCode]);
   expect((await workflow.detail(f.prefix,f.req)).handover).toMatchObject({state:'HANDOVER_ONLY',quality:'UNKNOWN'});
   await expect(workflow.command('CONFIRM',f.prefix,randomUUID(),body,f.req)).rejects.toThrow('EVIDENCE_PARTIAL');expect(await counts()).toEqual({batches:2,ledger:2,handovers:1});
 });
 it('TEMP aggregate mode is explicitly read-only and does not allocate or fill',async()=>{
   await ds.query(`UPDATE inv_source_mode SET mode='TEMP_PRODUCTION_INBOUND' WHERE scope_level='SITE' AND scope_code=$1`,[f.farm]);
   const d=await workflow.detail(f.prefix,f.req);expect(d.actions.confirm.allowed).toBe(false);expect(d.inventory.mode).toBe('TEMP_PRODUCTION_INBOUND');await expect(register()).rejects.toThrow('EVIDENCE_PARTIAL');expect(await counts()).toEqual({batches:0,ledger:0,handovers:0});
 });

});
