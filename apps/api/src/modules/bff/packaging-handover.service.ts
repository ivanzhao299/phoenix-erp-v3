import {packingPrintBlocked} from './packaging-print-state';
import { validatePackingCode, validatePackingCommand } from './dto/packaging-history.dto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { PackagingHistoryService } from './packaging-history.service';
import { PackagingBoxService } from './packaging-box.service';
import { PackagingWorkflowPolicy } from './packaging-workflow-policy';
import { completePackingSources, originalOutputs, packingEvidence, packingHash } from './packaging-evidence.service';
import { PackagingInventoryIntegrationService } from '../sales-v2/services/packaging-inventory-integration.service';
import { resolvePackagingIdentity } from './packaging-readiness';
import { lockPacking } from './packaging-protection';

export function uuid(value:unknown):string {
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new BadRequestException('INVALID_ID');return value;
}
@Injectable()
export class PackagingHandoverService {
  constructor(readonly history:PackagingHistoryService,readonly boxes:PackagingBoxService,
    readonly policy:PackagingWorkflowPolicy,readonly inventory:PackagingInventoryIntegrationService){}
  private actor(req:any){return String(req.user.userId??req.user.id??req.user.user_id);}
  async detail(code:string,req:any,db?:EntityManager):Promise<any>{
    const read=async(em:EntityManager)=>{
      const d:any=await this.history.detail(code,req,em);
      const events=await em.query(`SELECT id::text,event_type,actor_id::text,server_at,box_id,session_id,payload FROM pkg_packing_events WHERE packing_id=$1 ORDER BY server_at,id`,[d.record.id]);
      const boxes=await em.query(`SELECT b.id "boxId",b.output_ordinal "outputOrdinal",b.box_ordinal "boxOrdinal",b.original_qty "originalQty",
        COALESCE(jsonb_agg(jsonb_build_object('code',c.normalized_code,'kind',c.kind,'status',c.status,'resolution',r.state)) FILTER(WHERE c.id IS NOT NULL),'[]') labels
        FROM pkg_packing_boxes b LEFT JOIN pkg_packing_code_claims c ON c.box_id=b.id LEFT JOIN pkg_packing_code_registry r ON r.normalized_code=c.normalized_code
        WHERE b.packing_id=$1 GROUP BY b.id ORDER BY b.output_ordinal,b.box_ordinal`,[d.record.id]);
      const receipt=events.find((e:any)=>e.event_type==='COMMIT_RECEIPT');
      if(receipt){
        const [r]=await this.history.rows(await this.history.scope(req),em,code);
        Object.assign(d.handover,packingEvidence(r,r.inventory,r.ledger,r.handovers,receipt.payload));
        d.receipt={state:'RECORDED',evidence:[receipt]};
      }
      d.boxes=boxes.map((b:any)=>({...b,printBlockedReason:packingPrintBlocked(events,b.boxId)?'打印结果未知，请先查询并核实原打印请求':null}));d.events=events;d.identityStatus=boxes.length===d.record.totalBoxes?'REGISTERED':'UNREGISTERED';
      d.policy=await this.policy.get(d.ownership.companyCode,d.ownership.siteCode);
      d.revision=packingHash({originalRevision:d.revision,policyVersion:d.policy.version,sources:d.sources});
      const reasons=d.actions.registerBoxes.reasons.filter((r:string)=>r!=='工作流写入尚未开放').length?d.actions.registerBoxes.reasons.filter((r:string)=>r!=='工作流写入尚未开放'):d.record.recordStatus!=='ACTIVE'?['原单已作废']:d.record.productionDate!==d.shift.productionDate?['原单日期不一致']:
        d.handover.quality!=='VERIFIED'?d.handover.issues:[];
      for(const [key,action] of [['registerBoxes','REGISTER'],['print','PRINT'],['confirm','CONFIRM']]){
        let actionReasons=[...reasons];try{await this.history.scope(req,true);this.policy.assert(d.policy,action);}catch{actionReasons.push('无操作权限或工作流未开放');}
        if(key!=='registerBoxes' && d.identityStatus!=='REGISTERED')actionReasons.push('箱身份待核实');
        if(key==='confirm' && d.handover.state!=='PENDING')actionReasons.push('本单已有入账或交接证据');
        d.actions[key]={allowed:!actionReasons.length,reasons:actionReasons};
      }
      return d;
    };
    return db?read(db):this.history.em.transaction('REPEATABLE READ',async em=>{await em.query('SET TRANSACTION READ ONLY');return read(em);});
  }
  /** Legacy fields are accepted only when existing server evidence proves every original box. No scans are fabricated. */
  async compatConfirm(body:any,req:any){
    const code=String(body.packingCode||'').trim(),d=await this.detail(code,req),key=req.headers?.['idempotency-key'];
    if(!key||!Array.isArray(body.boxes)||body.boxes.length!==d.expectedBoxCount||new Set(body.boxes).size!==body.boxes.length)throw new ConflictException('CLIENT_UPGRADE_REQUIRED');
    uuid(key);if(Object.keys(body).some(k=>!['packingCode','boxes','productionDate','shiftId','location','receiver','palletCode','companyCode'].includes(k))||(body.companyCode&&body.companyCode!==d.ownership.companyCode))throw new BadRequestException('INVALID_COMMAND');
    const [prior]=await this.history.em.query(`SELECT e.payload FROM pkg_packing_operations o JOIN pkg_packing_events e ON e.id=o.result_event_id WHERE o.actor_id=$1 AND o.action='CONFIRM' AND o.idempotency_key=$2 AND o.packing_id=$3`,[this.actor(req),key,d.record.id]);
    const boxes=await Promise.all(body.boxes.map((label:string)=>this.boxes.resolve(this.history.em,d.record.id,label)));
    if(new Set(boxes.map(b=>b.id)).size!==d.expectedBoxCount)throw new ConflictException('BOX_IDENTITY_UNRESOLVED');
    const actor=this.actor(req),verifications=boxes.map(b=>d.events.filter((e:any)=>e.event_type==='BOX_VERIFIED'&&e.actor_id===actor&&e.box_id===b.id&&e.payload.purpose==='HANDOVER').at(-1));
    if(verifications.some(v=>!v))throw new ConflictException('CLIENT_UPGRADE_REQUIRED');
    const places=await this.history.em.query('SELECT warehouse_code FROM wms_locations WHERE location_code=$1',[body.location]);
    const users=await this.history.em.query('SELECT user_id::text id FROM sys_user WHERE status=1 AND (username=$1 OR real_name=$1)',[body.receiver]);
    if(places.length!==1||users.length!==1)throw new ConflictException('CLIENT_UPGRADE_REQUIRED');
    return this.command('CONFIRM',code,key,{contractVersion:2,packingCode:code,expectedRevision:prior?.payload.expectedRevision||d.revision,productionDate:body.productionDate||d.record.productionDate,
      shiftId:String(body.shiftId||d.shift.id),boxIds:boxes.map(b=>b.id).sort(),verificationIds:verifications.map(v=>v.id).sort(),warehouseCode:places[0].warehouse_code,
      locationCode:body.location,receiverUserId:users[0].id,palletCode:body.palletCode||''},req);
  }
  async command(action:string,code:string,key:string,body:any,req:any):Promise<any>{
    validatePackingCode(code);validatePackingCommand(action,body);
    uuid(key);const actor=this.actor(req);const scope=await this.history.scope(req,true);
    const payloadHash=packingHash({code,body});
    return this.history.em.transaction(async db=>{
      await db.query("SET LOCAL lock_timeout='5s'");
      await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,['packaging-chain:false']);await lockPacking(db,code);
      const [r]=await this.history.rows(scope,db,code);if(!r)throw new NotFoundException('RECORD_NOT_ACCESSIBLE');
      const [prior]=await db.query(`SELECT o.*,e.payload FROM pkg_packing_operations o LEFT JOIN pkg_packing_events e ON e.id=o.result_event_id
        WHERE o.actor_id=$1 AND o.action=$2 AND o.idempotency_key=$3`,[actor,action,key]);
      if(prior){if(prior.state!=='COMMITTED'||!prior.result_event_id||!prior.payload)throw new ConflictException('OPERATION_INCOMPLETE');if(prior.payload_hash!==payloadHash||String(prior.packing_id)!==r.id)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {...prior.payload,eventId:prior.result_event_id,operationId:prior.id};}
      const d=await this.detail(code,req,db),policy=await this.policy.get(r.company_code,r.site_id);
      if(action!=='PRINT_RESULT'){
        this.policy.assert(policy,action);
        validatePackingCommand(action,body);
        if(r.status!=='ACTIVE'||r.production_date!==r.shift_date)throw new ConflictException('RECORD_NOT_READY');
        if(body.expectedRevision!==d.revision)throw new ConflictException('REVISION_CHANGED');
        if(!completePackingSources(r))throw new ConflictException('SOURCE_NOT_READY');
        if(d.handover.quality!=='VERIFIED')throw new ConflictException('EVIDENCE_PARTIAL');
      }
      if(action==='PRINT_RESULT')validatePackingCommand(action,body);
      const op=randomUUID();await db.query(`INSERT INTO pkg_packing_operations(id,actor_id,action,idempotency_key,packing_id,payload_hash,state)
        VALUES($1,$2,$3,$4,$5,$6,'PENDING')`,[op,actor,action,key,r.id,payloadHash]);
      const emit=async(type:string,payload:any,boxId:string|null=null,sessionId:string|null=null)=>{
        const id=randomUUID();await db.query(`INSERT INTO pkg_packing_events(id,packing_id,event_type,actor_id,event_key,operation_id,box_id,session_id,payload,payload_hash)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,r.id,type,actor,`${op}:${id}`,op,boxId,sessionId,JSON.stringify(payload),packingHash(payload)]);return id;};
      let eventId:string;
      if(action==='REGISTER'){
        if(d.boxes.length)throw new ConflictException('BOX_IDENTITY_ALREADY_REGISTERED');
        if(!['LEGACY_VERIFIED','FIRST_LABEL_CONFIRMED'].includes(body.registrationKind)||!String(body.reason||'').trim())throw new BadRequestException('REGISTRATION_EVIDENCE_REQUIRED');
        const outputs=originalOutputs(r);if(!outputs)throw new ConflictException('INVALID_BOX_SET');
        // Unqualified production profiles cannot issue codes. TEST issuer is usable only in disposable test databases.
        const testEncoding=policy.encodingVersion==='TEST-NON-BUSINESS-v1';
        if(testEncoding ? process.env.NODE_ENV!=='test'||db.connection.options.database!=='packaging_history_test'||!code.startsWith('TEST-')
          : policy.encodingVersion!=='PBX-v1'||!policy.Q||!policy.deviceProfile)throw new ConflictException('ENCODING_NOT_QUALIFIED');
        const expected=outputs.flatMap((o,outputOrdinal)=>Array.from({length:o.boxes},(_,i)=>({outputOrdinal,boxOrdinal:i+1,qty:o.eggs/o.boxes})));
        if(!Array.isArray(body.items)||body.items.length!==expected.length)throw new BadRequestException('INVALID_BOX_SET');
        const created:any[]=[];
        for(const e of expected){
          const matches=body.items.filter((i:any)=>i.outputOrdinal===e.outputOrdinal&&i.boxOrdinal===e.boxOrdinal);
          if(matches.length!==1||!String(matches[0].declaration||'').trim())throw new BadRequestException('REGISTRATION_EVIDENCE_REQUIRED');
          const identity=await resolvePackagingIdentity(db,{grade:outputs[e.outputOrdinal].grade,specCode:outputs[e.outputOrdinal].specId,specName:outputs[e.outputOrdinal].spec,skuCode:outputs[e.outputOrdinal].skuCode,productCode:outputs[e.outputOrdinal].productCode});
          if(identity.qtyPerUnit!==e.qty)throw new ConflictException('INVALID_BOX_SET');
          const boxId=randomUUID();await db.query(`INSERT INTO pkg_packing_boxes(id,packing_id,output_ordinal,box_ordinal,original_qty) VALUES($1,$2,$3,$4,$5)`,[boxId,r.id,e.outputOrdinal,e.boxOrdinal,e.qty]);
          created.push({...e,identity,boxId,labelCode:testEncoding?`TEST-${randomUUID()}`:`PBX-${randomUUID().replace(/-/g,'').toUpperCase()}`,observedLabelCode:matches[0].observedLabelCode,declaration:matches[0].declaration});
        }
        eventId=await emit('REGISTRATION',{registrationKind:body.registrationKind,reason:body.reason,boxes:created,recordedBy:actor});
        await this.boxes.claim(db,created.flatMap(b=>[{code:b.labelCode,boxId:b.boxId,kind:'CANONICAL' as const,eventId},...(b.observedLabelCode?[{code:b.observedLabelCode,boxId:b.boxId,kind:'ALIAS' as const,eventId}]:[])]));
        await db.query(`UPDATE pkg_packing_records SET workflow_contract_version=2,label_encoding_version=$2,business_revision=business_revision+1 WHERE id=$1`,[r.id,policy.encodingVersion]);
      }else if(action==='SESSION'){
        if(!['LABEL_CHECK','HANDOVER'].includes(body.purpose)||d.identityStatus!=='REGISTERED')throw new BadRequestException('INVALID_PURPOSE');
        eventId=await emit('VERIFICATION_SESSION',{purpose:body.purpose,targetRevision:d.revision,expiresAt:new Date(Date.now()+30*60*1000).toISOString()});
      }else if(action==='SCAN'){
        const box=await this.boxes.resolve(db,r.id,body.labelCode);
        if(box.id!==body.boxId||!['SCANNER','MANUAL'].includes(body.method))throw new BadRequestException('INVALID_BOX_SET');
        const [session]=await db.query(`SELECT * FROM pkg_packing_events WHERE id=$1 AND packing_id=$2 AND event_type='VERIFICATION_SESSION' AND actor_id=$3`,[uuid(body.sessionId),r.id,actor]);
        if(!session||session.payload.targetRevision!==d.revision||session.payload.purpose!==body.purpose||Date.parse(session.payload.expiresAt)<=Date.now())throw new ConflictException('VERIFICATION_EXPIRED');
        if((await db.query(`SELECT 1 FROM pkg_packing_events WHERE session_id=$1 AND box_id=$2 AND event_type='BOX_VERIFIED' AND payload->>'purpose'=$3`,[session.id,box.id,body.purpose])).length)throw new ConflictException('BOX_ALREADY_VERIFIED');
        eventId=await emit('BOX_VERIFIED',{purpose:body.purpose,method:body.method,labelCode:body.labelCode,targetRevision:d.revision},box.id,session.id);
      }else if(action==='PRINT'){
        if(packingPrintBlocked(d.events,body.boxId))throw new ConflictException('PRINT_RESULT_UNRESOLVED');
        const box=await this.boxes.resolve(db,r.id,body.labelCode);
        if(box.id!==body.boxId||body.copies!==1||!String(body.templateVersion||'').trim()
          ||!['NORMAL','REPRINT'].includes(body.printType)||(body.printType==='REPRINT'&&!String(body.reason||'').trim()))throw new BadRequestException('INVALID_PRINT_REQUEST');
        if(body.printType==='NORMAL'&&(await db.query(`SELECT 1 FROM pkg_packing_events WHERE packing_id=$1 AND box_id=$2 AND event_type='PRINT_REQUEST' LIMIT 1`,[r.id,box.id])).length)throw new ConflictException('REPRINT_REASON_REQUIRED');
        const renderPayload={packingCode:code,productionDate:r.production_date,labelCode:body.labelCode,qty:box.original_qty};
        eventId=await emit('PRINT_REQUEST',{labelCode:body.labelCode,printType:body.printType,reason:body.reason||null,copies:1,templateVersion:body.templateVersion,renderPayload,renderHash:packingHash(renderPayload)},box.id);
      }else if(action==='PRINT_RESULT'){
        const [request]=await db.query(`SELECT id FROM pkg_packing_events WHERE id=$1 AND packing_id=$2 AND actor_id=$3 AND event_type='PRINT_REQUEST'`,[uuid(body.requestId),r.id,actor]);
        if(!request||!['DISPATCHED','FAILED','UNKNOWN'].includes(body.type))throw new BadRequestException('INVALID_PRINT_RESULT');
        eventId=await emit('PRINT_RESULT',{requestId:request.id,type:body.type,clientOccurredAt:body.clientOccurredAt||null});
      }else if(action==='VOID'){
        const box=await this.boxes.resolve(db,r.id,body.labelCode);
        const claims=await db.query(`SELECT normalized_code FROM pkg_packing_code_claims WHERE box_id=$1 AND status='ACTIVE' ORDER BY normalized_code`,[box.id]);
        for(const claim of claims)await db.query('SELECT normalized_code FROM pkg_packing_code_registry WHERE normalized_code=$1 FOR UPDATE',[claim.normalized_code]);
        const testEncoding=policy.encodingVersion==='TEST-NON-BUSINESS-v1';
        if(testEncoding ? process.env.NODE_ENV!=='test'||db.connection.options.database!=='packaging_history_test'||!code.startsWith('TEST-')
          : policy.encodingVersion!=='PBX-v1'||!policy.Q||!policy.deviceProfile)throw new ConflictException('ENCODING_NOT_QUALIFIED');
        const labelCode=testEncoding?`TEST-${randomUUID()}`:`PBX-${randomUUID().replace(/-/g,'').toUpperCase()}`;
        eventId=await emit('LABEL_VOID',{reason:body.reason,dispositionDeclaration:body.dispositionDeclaration,oldCodes:claims.map((c:any)=>c.normalized_code),labelCode},box.id);
        await db.query(`UPDATE pkg_packing_code_claims SET status='VOID' WHERE box_id=$1 AND status='ACTIVE'`,[box.id]);
        for(const claim of claims){
          const owners=await db.query(`SELECT DISTINCT box_id FROM pkg_packing_code_claims WHERE normalized_code=$1 AND status='ACTIVE'`,[claim.normalized_code]);
          await db.query(`UPDATE pkg_packing_code_registry SET state=$2,owner_box_id=$3 WHERE normalized_code=$1`,[claim.normalized_code,owners.length===0?'RETIRED':owners.length===1?'BOUND':'AMBIGUOUS',owners.length===1?owners[0].box_id:null]);
        }
        await this.boxes.claim(db,[{code:labelCode,boxId:box.id,kind:'CANONICAL',eventId}]);
        await db.query('UPDATE pkg_packing_records SET business_revision=business_revision+1 WHERE id=$1',[r.id]);
      }else if(action==='CONFIRM'){
        if(d.handover.state!=='PENDING')throw new ConflictException('EVIDENCE_PARTIAL');
        if(await this.inventory.getTerminalInventoryMode(code,{companyCode:r.company_code})!=='PACKAGING_INBOUND')throw new ConflictException('TEMP_EXACT_HANDOVER_UNSUPPORTED');
        if(body.productionDate!==r.production_date||String(body.shiftId)!==r.shift_id)throw new ConflictException('ORIGINAL_DATE_REQUIRED');
        const expected=d.boxes.map((b:any)=>b.boxId).sort();
        if(!expected.length||expected.length!==Number(r.total_boxes)||!Array.isArray(body.boxIds)
          ||JSON.stringify([...body.boxIds].sort())!==JSON.stringify(expected))throw new BadRequestException('INVALID_BOX_SET');
        const scans=await db.query(`SELECT e.*,s.payload session_payload FROM pkg_packing_events e JOIN pkg_packing_events s ON s.id=e.session_id
          WHERE e.id=ANY($1::uuid[]) AND e.packing_id=$2 AND e.actor_id=$3 AND e.event_type='BOX_VERIFIED'`,[body.verificationIds||[],r.id,actor]);
        if(scans.length!==expected.length||new Set(scans.map((s:any)=>s.box_id)).size!==expected.length
          ||scans.some((s:any)=>!expected.includes(s.box_id)||s.payload.purpose!=='HANDOVER'||s.session_payload.targetRevision!==d.revision||Date.parse(s.session_payload.expiresAt)<=Date.now()))throw new ConflictException('HANDOVER_VERIFICATION_REQUIRED');
        for(const scan of scans){const resolved=await this.boxes.resolve(db,r.id,scan.payload.labelCode);if(resolved.id!==scan.box_id)throw new ConflictException('LABEL_UNRESOLVABLE');}
        for(const box of d.boxes){
          const checks=await db.query(`SELECT 1 FROM pkg_packing_events e JOIN pkg_packing_events s ON s.id=e.session_id WHERE e.packing_id=$1 AND e.box_id=$2
            AND e.actor_id=$3 AND e.event_type='BOX_VERIFIED' AND e.payload->>'purpose'='LABEL_CHECK' AND s.payload->>'targetRevision'=$4
            AND (s.payload->>'expiresAt')::timestamptz>now()`,[r.id,box.boxId,actor,d.revision]);
          const requests=await db.query(`SELECT 1 FROM pkg_packing_events WHERE packing_id=$1 AND box_id=$2 AND event_type='PRINT_REQUEST'`,[r.id,box.boxId]);
          if(!checks.length||!requests.length)throw new ConflictException('LABEL_VERIFICATION_REQUIRED');
        }
        if(!completePackingSources(r))throw new ConflictException('SOURCE_NOT_READY');
        const [place]=await db.query(`SELECT l.location_code,w.warehouse_code,w.company_code FROM wms_locations l JOIN wms_warehouses w ON w.warehouse_code=l.warehouse_code
          WHERE l.location_code=$1 AND w.warehouse_code=$2 AND l.status IN ('NORMAL','EMPTY','OCCUPIED') AND w.status='ACTIVE' FOR SHARE OF l,w`,[body.locationCode,body.warehouseCode]);
        if(!place||place.company_code!==r.company_code||(!scope.isGlobal&&!scope.allowedWarehouseCodes.includes(place.warehouse_code)))throw new ConflictException('LOCATION_INACTIVE');
        const [receiver]=await db.query('SELECT user_id::text,real_name,perms_version FROM sys_user WHERE user_id=$1 AND status=1 FOR SHARE',[body.receiverUserId]);
        if(!receiver)throw new ConflictException('RECEIVER_INELIGIBLE');
        const roles=await db.query(`SELECT r.role_code FROM sys_user_role ur JOIN sys_role r ON r.role_id=ur.role_id WHERE ur.user_id=$1 AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE'`,[receiver.user_id]);
        const receiverScope=await this.history.scopes.resolve(receiver.user_id,roles.map((r:any)=>r.role_code),'MENU_PKG_OP',Number(receiver.perms_version));
        if(!receiverScope.isGlobal&&(!receiverScope.allowedCompanyCodes.includes(r.company_code)||!receiverScope.allowedWarehouseCodes.includes(place.warehouse_code)))throw new ConflictException('RECEIVER_INELIGIBLE');
        const registrations=d.events.filter((e:any)=>e.event_type==='REGISTRATION');
        if(registrations.length!==1)throw new ConflictException('OUTPUT_BINDINGS_REQUIRED');
        const registeredIds=registrations[0].payload.boxes.map((b:any)=>b.boxId).sort();
        if(new Set(registeredIds).size!==registeredIds.length||JSON.stringify(registeredIds)!==JSON.stringify(expected))throw new ConflictException('OUTPUT_BINDINGS_REQUIRED');
        const outputBindings=originalOutputs(r)!.map((o:any,outputOrdinal:number)=>{
          const registered=registrations[0].payload.boxes.filter((b:any)=>b.outputOrdinal===outputOrdinal);
          const identity=registered[0]?.identity;
          if(!identity||registered.length!==o.boxes||registered.some((b:any)=>packingHash(b.identity)!==packingHash(identity)||b.qty!==o.eggs/o.boxes||!expected.includes(b.boxId)))throw new ConflictException('OUTPUT_BINDINGS_REQUIRED');
          return {outputOrdinal,qty:o.eggs,boxes:o.boxes,...identity,provenance:'REGISTRATION_RESOLUTION'};
        });
        const result=await this.inventory.completeTerminalPacking(code,{outputBindings,companyCode:r.company_code,warehouseCode:place.warehouse_code,locationCode:place.location_code,manager:db});
        if(result.skippedByMode||result.totalInbound!==Number(r.total_eggs))throw new ConflictException('INVENTORY_NOT_COMMITTED');
        const handoverCode=`WH-${randomUUID()}`;
        await db.query(`INSERT INTO pkg_handover_records(code,shift_id,packing_code,boxes_json,box_count,pallet_code,location,receiver,production_date)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[handoverCode,r.shift_id,code,JSON.stringify(expected),expected.length,body.palletCode||'',place.location_code,receiver.real_name,r.production_date]);
        const groups=await db.query(`SELECT b.batch_no "batchNo",b.sku_code "skuCode",b.spec_code "specCode",b.product_code "productCode",b.qty::int qty,
          l.id::text "ledgerId",l.company_code "companyCode",l.warehouse_code "warehouseCode",l.location_code "locationCode"
          FROM inv_batches b JOIN inv_ledger l ON l.batch_no=b.batch_no AND l.ref_no=$1 AND l.change_type='PACKAGING_INBOUND' WHERE b.packaging_batch_ref=$1`,[code]);
        if(groups.length!==result.batches.length||groups.reduce((n:number,g:any)=>n+g.qty,0)!==Number(r.total_eggs))throw new ConflictException('EVIDENCE_CONFLICT');
        eventId=await emit('COMMIT_RECEIPT',{handoverCode,operationId:op,expectedRevision:body.expectedRevision,committed:true,receiptState:'RECORDED',groups,outputBindings,boxIds:expected,
          originalHash:packingHash({date:r.production_date,outputs:r.batches_json,totalEggs:Number(r.total_eggs),totalBoxes:Number(r.total_boxes)}),
          receiverUserId:receiver.user_id,receiverNameSnapshot:receiver.real_name,recordedBy:actor,recordedAt:new Date().toISOString(),mode:'PACKAGING_INBOUND'});
      }else throw new BadRequestException('INVALID_ACTION');
      await db.query(`UPDATE pkg_packing_operations SET state='COMMITTED',result_event_id=$2,committed_at=now() WHERE id=$1`,[op,eventId]);
      const [result]=await db.query('SELECT id,payload FROM pkg_packing_events WHERE id=$1',[eventId]);return {...result.payload,eventId:result.id,operationId:op};
    });
  }
}
