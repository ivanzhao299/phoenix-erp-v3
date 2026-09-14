import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { DataScopeContext, DataScopeService } from '../org/services/data-scope.service';
import { hasPerm } from '../../auth/permissions.util';
import { completePackingSources, originalOutputs, packingEvidence, packingHash } from './packaging-evidence.service';
import { packagingTestMode } from './packaging-protection';

export function historyDate(value: unknown): string {
  const v = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0,10) !== v) throw new BadRequestException('INVALID_FILTER');
  return v;
}
export function positiveId(value: unknown): string {
  const v = String(value);
  if (!/^[1-9]\d*$/.test(v) || BigInt(v) > 9223372036854775807n) throw new BadRequestException('INVALID_FILTER');
  return v;
}
@Injectable()
export class PackagingHistoryService {
  private readonly cursorKey=randomBytes(32);
  private signCursor(value:any){return createHmac('sha256',this.cursorKey).update(JSON.stringify(value)).digest('hex');}
  constructor(@InjectEntityManager() readonly em: EntityManager, readonly scopes: DataScopeService) {}
  async scope(req: any, write = false): Promise<DataScopeContext> {
    if (packagingTestMode(req)) throw new ConflictException('测试模式禁止业务入口');
    const u = req?.user, id = u?.userId ?? u?.id ?? u?.user_id;
    if (!id) throw new ForbiddenException('ACTION_DENIED');
    const admin = u.roles?.includes('ROLE_ADMIN') || u.role === 'ROLE_ADMIN';
    if (write && !admin && !hasPerm(u.permissions, 'MENU_PKG_OP', 'E')) throw new ForbiddenException('ACTION_DENIED');
    const menus = write ? ['MENU_PKG_OP'] : ['MENU_PKG_OP','MENU_PKG_MGR'].filter(m => admin || hasPerm(u.permissions,m,'V'));
    if (!menus.length) throw new ForbiddenException('ACTION_DENIED');
    const resolved = await Promise.all(menus.map(m => this.scopes.resolve(String(id),u.roles || [u.role].filter(Boolean),m,u.perms_version)));
    // OR menus grant a record only if a complete chain fits one menu scope (no cross-menu stitching).
    const first = resolved[0];
    return Object.assign({}, first, { alternatives: resolved });
  }
  async rows(scope: DataScopeContext, db = this.em, code?: string, page?: {q:Record<string,string>;cursor:any;size:number;report?:boolean}): Promise<any[]> {
    // Small read pages with correlated scope checks suffer JIT compilation overhead; keep this transaction-local.
    if(db.queryRunner?.isTransactionActive)await db.query('SET LOCAL jit=off');
    const alternatives: DataScopeContext[] = (scope as any).alternatives || [scope];
    const params: any[] = [code || null];
    const visibility = alternatives.map(s => {
      params.push(s.isGlobal,s.allowedCompanyCodes,s.allowedFarmCodes,s.allowedWarehouseCodes);
      const i = params.length - 3;
      return `($${i}::boolean OR (f.company_code=ANY($${i+1}::text[]) AND ws.site_id=ANY($${i+2}::text[])
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(src.rows) x WHERE x->>'companyCode' IS NULL OR x->>'siteCode' IS NULL
          OR NOT (x->>'companyCode'=ANY($${i+1}::text[]) AND x->>'siteCode'=ANY($${i+2}::text[])))
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(inv.rows || led.rows) x WHERE x->>'company_code' IS NULL OR x->>'warehouse_code' IS NULL
          OR NOT (x->>'company_code'=ANY($${i+1}::text[]) AND x->>'warehouse_code'=ANY($${i+3}::text[])))
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ho.rows) x LEFT JOIN wms_locations loc ON loc.location_code=x->>'location'
          LEFT JOIN wms_warehouses wh ON wh.warehouse_code=loc.warehouse_code
          WHERE wh.company_code IS NULL OR NOT(wh.company_code=ANY($${i+1}::text[]) AND wh.warehouse_code=ANY($${i+3}::text[])))))`;
    }).join(' OR ');
    let prefilter='true';
    if(!alternatives.some(s=>s.isGlobal)){params.push([...new Set(alternatives.flatMap(s=>s.allowedCompanyCodes))],[...new Set(alternatives.flatMap(s=>s.allowedFarmCodes))]);prefilter=`f.company_code=ANY($${params.length-1}::text[]) AND ws.site_id=ANY($${params.length}::text[])`;}
    const sql=`SELECT p.code,p.batches_json,p.grading_code,p.grading_codes_json,p.total_eggs,p.total_boxes,p.status,p.void_reason,p.business_revision,p.workflow_contract_version,p.label_encoding_version, p.id::text id, p.shift_id::text shift_id, p.production_date::text production_date,
      ws.shift_code,ws.production_date::text shift_date,ws.status shift_status,ws.site_id,f.company_code,
      (SELECT count(*)::integer FROM pkg_packing_boxes bx WHERE bx.packing_id=p.id) registered_box_count,src.rows sources,inv.rows inventory,led.rows ledger,ho.rows handovers,receipt.payload commit_receipt,COALESCE(mode.mode,'TEMP_PRODUCTION_INBOUND') inventory_mode,${page?.report?'NULL::text':'packing_posting_state(to_jsonb(p),inv.rows,led.rows,ho.rows,receipt.payload)'} posting_state
      FROM pkg_packing_records p JOIN pkg_work_shifts ws ON ws.id=p.shift_id AND NOT ws.is_test
      JOIN brd_farms f ON f.farm_code=ws.site_id
      CROSS JOIN LATERAL (SELECT COALESCE(jsonb_agg(jsonb_build_object('gradingId',g.id::text,'gradingCode',g.code,
        'sourceBatchId',s.id::text,'sourceBatchCode',s.batch_code,'houseCode',s.house_code,'siteCode',sf.farm_code,
        'companyCode',sf.company_code,'sourceOriginalQty',s.received_qty,'allocationQty',NULL,'precision','RELATED_ONLY',
        'gradingShiftId',g.shift_id::text,'gradingDate',g.production_date::text,'sourceShiftId',s.shift_id::text,'sourceDate',s.production_date::text,'gradingStatus',g.status,'sourceStatus',s.batch_status,'isTest',g.is_test OR s.is_test)), '[]') rows
        FROM pkg_grading_records g LEFT JOIN pkg_grading_source_links l ON l.grading_id=g.id
        LEFT JOIN pkg_source_batches s ON s.id=l.source_batch_id LEFT JOIN brd_houses sh ON sh.house_code=s.house_code
        LEFT JOIN brd_farms sf ON sf.farm_code=sh.farm_code WHERE g.code=ANY(ARRAY
        (SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.grading_codes_json)='array' AND jsonb_array_length(p.grading_codes_json)>0
          THEN p.grading_codes_json ELSE jsonb_build_array(p.grading_code) END)))) src
      CROSS JOIN LATERAL (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',b.id::text,'batch_no',b.batch_no,'qty',b.qty,'qty_available',b.qty_available,'egg_date',b.egg_date,'inbound_date',b.inbound_date,'company_code',b.company_code,'warehouse_code',b.warehouse_code,'location_code',b.location_code,'status',b.status,'source_type',b.source_type,'source_no',b.source_no,'product_code',b.product_code,'sku_code',b.sku_code,'spec_code',b.spec_code,'grade_code_std',b.grade_code_std,'packaging_batch_ref',b.packaging_batch_ref)), '[]') rows FROM inv_batches b
        WHERE b.packaging_batch_ref=p.code OR b.source_no=p.code) inv
      CROSS JOIN LATERAL (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id::text,'batch_no',l.batch_no,'ref_no',l.ref_no,'change_type',l.change_type,'qty_change',l.qty_change,'sku_code',l.sku_code,'company_code',l.company_code,'warehouse_code',l.warehouse_code,'location_code',l.location_code,'log_date',l.log_date)), '[]') rows FROM inv_ledger l WHERE l.ref_no=p.code
        OR l.batch_no=ANY(ARRAY(SELECT x->>'batch_no' FROM jsonb_array_elements(inv.rows) x))) led
      CROSS JOIN LATERAL (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',h.id::text,'code',h.code,'packing_code',h.packing_code,'shift_id',h.shift_id::text,'boxes_json',h.boxes_json,'box_count',h.box_count,'pallet_code',h.pallet_code,'location',h.location,'receiver',h.receiver,'production_date',h.production_date,'created_at',h.created_at)), '[]') rows FROM pkg_handover_records h WHERE h.packing_code=p.code) ho
      LEFT JOIN LATERAL (SELECT payload FROM pkg_packing_events WHERE packing_id=p.id AND event_type='COMMIT_RECEIPT') receipt ON true
      LEFT JOIN LATERAL (SELECT mode FROM inv_source_mode WHERE (scope_level='SITE' AND scope_code=ws.site_id)
        OR (scope_level='COMPANY' AND scope_code=f.company_code) OR (scope_level='GROUP' AND scope_code='ALL')
        ORDER BY CASE scope_level WHEN 'SITE' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END LIMIT 1) mode ON true
      WHERE NOT p.is_test AND f.company_code IS NOT NULL AND ($1::text IS NULL OR p.code=$1) AND (${prefilter}) AND (${visibility})
      ORDER BY p.production_date DESC NULLS LAST,p.id DESC`;
    if(!page)return db.query(sql,params);
    const values=[...params];const bind=(v:any)=>{values.push(v??null);return '$'+values.length;};
    const q=page.q,conditions:string[]=[];
    for(const [key,column] of [['dateFrom','production_date'],['dateTo','production_date'],['companyCode','company_code'],['siteCode','site_id'],['shiftId','shift_id'],['shiftStatus','shift_status'],['recordStatus','status'],['handoverState','posting_state'],['inventoryMode','inventory_mode']]){
      if(q[key]&&q[key]!=='ALL')conditions.push(`${column} ${key==='dateFrom'?'>=':key==='dateTo'?'<=':'='} ${bind(q[key])}`);
    }
    if(page.report)return db.query(`WITH visible AS (${sql}) SELECT * FROM visible ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY production_date,id::bigint`,values);
    const asOf=bind(page.cursor?.asOfId),lastDate=bind(page.cursor?.lastDate),lastId=bind(page.cursor?.lastId),size=bind(page.size);
    return db.query(`WITH visible AS NOT MATERIALIZED (${sql}), filtered AS(SELECT id,production_date FROM visible ${conditions.length?'WHERE '+conditions.join(' AND '):''}),
      bounded AS(SELECT * FROM filtered WHERE id::bigint<=COALESCE(${asOf}::bigint,(SELECT max(id::bigint) FROM filtered))),
      page_ids AS(SELECT * FROM bounded WHERE ${lastId}::bigint IS NULL OR
        (${lastDate}::text IS NULL AND production_date IS NULL AND id::bigint<${lastId}::bigint) OR
        (${lastDate}::text IS NOT NULL AND (production_date<${lastDate}::text OR production_date IS NULL OR (production_date=${lastDate}::text AND id::bigint<${lastId}::bigint)))
        ORDER BY production_date DESC NULLS LAST,id::bigint DESC LIMIT ${size}::integer),
      page_rows AS(SELECT v.* FROM page_ids pi CROSS JOIN LATERAL (${sql.replace('WHERE NOT p.is_test','WHERE p.id=pi.id::integer AND NOT p.is_test')} OFFSET 0) v)
      SELECT COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY production_date DESC NULLS LAST,id::bigint DESC) FROM page_rows x),'[]') items,
        (SELECT count(*)::integer FROM bounded) total,
        COALESCE(${asOf}::bigint,(SELECT max(id::bigint) FROM filtered),0)::text as_of_id`,values);

  }
  view(r: any) {
    const evidence = packingEvidence(r,r.inventory,r.ledger,r.handovers,r.commit_receipt);
    if(r.inventory_mode==='TEMP_PRODUCTION_INBOUND'&&evidence.state==='PENDING'){evidence.quality='UNKNOWN';evidence.issues=['TEMP 来源仅场日汇总，精确原单交接未支持'];}
    const sourcesOk = completePackingSources(r);
    const reasons = !sourcesOk ? ['来源关联缺失'] : r.production_date !== r.shift_date ? ['原单与班次日期不一致'] : evidence.issues;
    return { record: {id:r.id,code:r.code,productionDate:r.production_date,totalEggs:Number(r.total_eggs),totalBoxes:Number(r.total_boxes),recordStatus:r.status,voidReason:r.void_reason,isTest:false,contractVersion:r.workflow_contract_version,labelEncodingVersion:r.label_encoding_version},
      shift:{id:r.shift_id,code:r.shift_code,productionDate:r.shift_date,status:r.shift_status,siteCode:r.site_id},
      ownership:{companyCode:r.company_code,siteCode:r.site_id,businessTimezone:null,provenance:'SHIFT_FARM',timezoneConfidence:'UNKNOWN'},
      outputs:(Array.isArray(r.batches_json)?r.batches_json:[]).map((original: any,outputOrdinal: number)=>({outputOrdinal,original:Object.fromEntries(['grade','specId','spec','skuCode','productCode','eggs','boxes'].filter(k=>Object.prototype.hasOwnProperty.call(original||{},k)).map(k=>[k,original[k]]))})),
      sources:r.sources, inventory:{mode:r.inventory_mode,batches:r.inventory,ledger:r.ledger,...evidence},
      handover:{records:r.handovers,...evidence}, receipt:{state:r.commit_receipt?'RECORDED':r.handovers.length?'LEGACY_RECORDED':'NOT_RECORDED'},
      boxes:[], identityStatus:Number(r.registered_box_count)===Number(r.total_boxes)&&Number(r.total_boxes)>0?'REGISTERED':'UNREGISTERED',expectedBoxCount:Number(r.total_boxes),
      revision:packingHash({id:r.id,outputs:r.batches_json,date:r.production_date,status:r.status,businessRevision:r.business_revision}),
      actions:{registerBoxes:{allowed:false,reasons:reasons.length?reasons:['工作流写入尚未开放']},print:{allowed:false,reasons:['箱身份待核实']},confirm:{allowed:false,reasons:reasons.length?reasons:['箱身份待核实']}},
      sectionsComplete:true,snapshotAt:new Date().toISOString() };
  }
  async detail(code: string, req: any, db?: EntityManager) {
    if(typeof code!=='string'||!code.trim())throw new BadRequestException('INVALID_FILTER');
    const scope = await this.scope(req);
    const read = async (em: EntityManager) => {
      const [r] = await this.rows(scope,em,code.trim());
      if (!r) throw new NotFoundException('RECORD_NOT_ACCESSIBLE');
      return this.view(r);
    };
    return db ? read(db) : this.em.transaction('REPEATABLE READ',async em=>{await em.query('SET TRANSACTION READ ONLY');return read(em);});
  }
  async list(q: Record<string,string>, req: any) {
    const scope=await this.scope(req),size=Number(q.pageSize||25);
    const keys=['packingCode','dateFrom','dateTo','companyCode','siteCode','shiftId','shiftStatus','recordStatus','handoverState','inventoryMode','pageSize','cursor'];
    if(Object.keys(q).some(k=>!keys.includes(k))||![25,50,100].includes(size))throw new BadRequestException('INVALID_FILTER');
    for(const k of ['dateFrom','dateTo'])if(q[k])historyDate(q[k]);
    if(q.dateFrom&&q.dateTo&&q.dateFrom>q.dateTo)throw new BadRequestException('INVALID_FILTER');
    if(q.shiftId)positiveId(q.shiftId);
    if(q.packingCode!==undefined&&!q.packingCode.trim())throw new BadRequestException('INVALID_FILTER');
    for(const [key,allowed] of Object.entries({shiftStatus:['OPEN','CLOSED','ALL'],recordStatus:['ACTIVE','VOID','ALL'],handoverState:['PENDING','COMMITTED','HANDOVER_ONLY','INVENTORY_ONLY','ALL'],inventoryMode:['PACKAGING_INBOUND','TEMP_PRODUCTION_INBOUND','ALL']}))
      if(q[key]&&!allowed.includes(q[key]))throw new BadRequestException('INVALID_FILTER');
    const {cursor: omittedCursor,...input}=q;
    const filters:Record<string,string>={...input,pageSize:String(size)};if(q.packingCode)filters.packingCode=q.packingCode.trim();
    const hash=packingHash({filters,scope,permissionVersion:req.user.perms_version});let cursor:any;
    if(q.cursor){try{
      const decoded=JSON.parse(Buffer.from(q.cursor,'base64url').toString());const {signature,...payload}=decoded;
      if(typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature),Buffer.from(this.signCursor(payload)))
        ||Object.keys(payload).sort().join(',')!=='asOfId,hash,lastDate,lastId'||payload.hash!==hash)throw Error();
      positiveId(payload.asOfId);positiveId(payload.lastId);if(BigInt(payload.lastId)>BigInt(payload.asOfId))throw Error();
      if(payload.lastDate!==null)historyDate(payload.lastDate);cursor=payload;
    }catch{throw new BadRequestException('INVALID_FILTER');}}
    return this.em.transaction('REPEATABLE READ',async em=>{
      await em.query('SET TRANSACTION READ ONLY');
      const [result]=await this.rows(scope,em,filters.packingCode,{q:filters,cursor,size:size+1});
      const raw=result.items as any[],hasMore=raw.length>size,items=raw.slice(0,size),last=items.at(-1);
      const next=last?{hash,asOfId:result.as_of_id,lastDate:last.production_date,lastId:last.id}:null;
      return {items:items.map(r=>this.view(r)),totalMatching:result.total,hasMore,asOfId:result.as_of_id,filters,snapshotAt:new Date().toISOString(),
        nextCursor:hasMore?Buffer.from(JSON.stringify({...next,signature:this.signCursor(next)})).toString('base64url'):null};
    });
  }

  section(d:any,name:string,q:any){
    const rows=name==='evidence'?d.events:d[name],revision=packingHash({revision:d.revision,events:d.events.map((e:any)=>e.id)});
    const limit=Number(q.limit||25);if(![25,50,100].includes(limit))throw new BadRequestException('INVALID_FILTER');
    let index=0;
    if(q.cursor){try{const {signature,...payload}=JSON.parse(Buffer.from(q.cursor,'base64url').toString());
      if(signature!==this.signCursor(payload)||payload.code!==d.record.code||payload.name!==name||payload.revision!==revision||!Number.isSafeInteger(payload.index)||payload.index<0)throw Error();index=payload.index;
    }catch{throw new ConflictException('REVISION_CHANGED');}}
    const complete=index+limit>=rows.length,next={code:d.record.code,name,revision,index:index+limit};
    return {items:rows.slice(index,index+limit),total:rows.length,complete,revision,nextCursor:complete?null:Buffer.from(JSON.stringify({...next,signature:this.signCursor(next)})).toString('base64url')};
  }
  async summary(q:Record<string,string>,req:any){
    const from=historyDate(q.dateFrom),to=historyDate(q.dateTo);
    if(from>to || (Date.parse(to)-Date.parse(from))/86400000>30 || !['DAY','SHIFT'].includes(q.aggregation))throw new BadRequestException('INVALID_FILTER');
    if(q.aggregation==='SHIFT')positiveId(q.shiftId);
    if(Object.keys(q).some(k=>!['dateFrom','dateTo','aggregation','shiftId','companyCode','siteCode'].includes(k)) || (q.aggregation==='DAY'&&q.shiftId))throw new BadRequestException('INVALID_FILTER');
    const scope=await this.scope(req);
    return this.em.transaction('REPEATABLE READ',async em=>{
    await em.query('SET TRANSACTION READ ONLY');
    const selected=await this.rows(scope,em,undefined,{q,cursor:null,size:100,report:true});
    if(q.aggregation==='SHIFT'){
      const [shift]=await em.query(`SELECT ws.production_date::text date FROM pkg_work_shifts ws JOIN brd_farms f ON f.farm_code=ws.site_id WHERE ws.id=$1 AND NOT ws.is_test
        AND ($2 OR (f.company_code=ANY($3::text[]) AND ws.site_id=ANY($4::text[])))`,[q.shiftId,scope.isGlobal,scope.allowedCompanyCodes,scope.allowedFarmCodes]);
      if(!shift)throw new NotFoundException('RECORD_NOT_ACCESSIBLE');
      if(shift.date<from||shift.date>to)throw new BadRequestException('SHIFT_DATE_MISMATCH');
    }
    const params:any[]=[from,to,q.shiftId||null,q.companyCode||null,q.siteCode||null];
    const visibility=((scope as any).alternatives||[scope]).map((s:DataScopeContext)=>{
      params.push(s.isGlobal,s.allowedCompanyCodes,s.allowedFarmCodes);const i=params.length-2;
      return `($${i} OR (f.company_code=ANY($${i+1}::text[]) AND ws.site_id=ANY($${i+2}::text[])
       AND NOT EXISTS(SELECT 1 FROM pkg_grading_source_links sl JOIN pkg_source_batches sb ON sb.id=sl.source_batch_id
        LEFT JOIN brd_houses bh ON bh.house_code=sb.house_code LEFT JOIN brd_farms bf ON bf.farm_code=bh.farm_code WHERE sl.grading_id=g.id
        AND (bf.company_code IS NULL OR bf.farm_code IS NULL OR NOT(bf.company_code=ANY($${i+1}::text[]) AND bf.farm_code=ANY($${i+2}::text[]))))))`;
    }).join(' OR ');
    const [grading]=await em.query(`SELECT COALESCE(sum(g.total_output),0)::bigint::text qty FROM pkg_grading_records g JOIN pkg_work_shifts ws ON ws.id=g.shift_id
      JOIN brd_farms f ON f.farm_code=ws.site_id WHERE NOT g.is_test AND NOT ws.is_test AND g.status='ACTIVE'
      AND g.production_date BETWEEN $1::date AND $2::date AND ($3::bigint IS NULL OR ws.id=$3::bigint)
      AND ($4::text IS NULL OR f.company_code=$4) AND ($5::text IS NULL OR ws.site_id=$5) AND (${visibility})`,params);
    const active=selected.filter(r=>r.status==='ACTIVE'),days=[];
    const records=active.map(r=>{const evidence=packingEvidence(r,r.inventory,r.ledger,r.handovers,r.commit_receipt);if(r.inventory_mode==='TEMP_PRODUCTION_INBOUND'&&evidence.state==='PENDING'){evidence.quality='UNKNOWN';evidence.issues=['TEMP 来源仅场日汇总，精确原单交接未支持'];}return {code:r.code,shiftId:r.shift_id,productionDate:r.production_date,totalEggs:Number(r.total_eggs),totalBoxes:Number(r.total_boxes),handover:{records:r.handovers,...evidence},inventoryMode:r.inventory_mode};});
    for(let date=from;date<=to;date=new Date(Date.parse(date)+86400000).toISOString().slice(0,10)){
      const records=active.filter(r=>r.production_date===date);days.push({date,totalEggs:records.reduce((n,r)=>n+Number(r.total_eggs),0),totalBoxes:records.reduce((n,r)=>n+Number(r.total_boxes),0)});
    }
    return {basis:'TERMINAL_RECORDS',aggregation:q.aggregation,shiftId:q.aggregation==='SHIFT'?q.shiftId:null,dateFrom:from,dateTo:to,shiftIds:[...new Set(selected.map(r=>r.shift_id))],
      totalEggs:active.reduce((n,r)=>n+Number(r.total_eggs),0),totalBoxes:active.reduce((n,r)=>n+Number(r.total_boxes),0),voidCount:selected.length-active.length,
      gradingEggs:Number(grading.qty),unassigned:{state:'NOT_ATTRIBUTABLE',count:null,message:'无班次或权威场归属的历史异常单不计入；本范围无法安全归属，不推断为零'},
      committedBoxes:records.filter(r=>r.handover.state==='COMMITTED').reduce((n,r)=>n+r.totalBoxes,0),days,records};
    });
  }
}
