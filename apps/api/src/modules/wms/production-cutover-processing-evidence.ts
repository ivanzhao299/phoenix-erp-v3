import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { cutoverFactSql } from './cutover-evidence-row';

/** Existing RAW is physical custody, never another opening stock line. */
export interface CutoverRawBalance {
  rawSegmentId:string;receiptId:string;documentNo:string;companyCode:string;warehouseCode:string;houseCode:string;
  productionDate:string;gradeCode:string;receivedQuantity:string;consumedQuantity:string;remainingQuantity:string;
}
type Fact=Record<string,unknown>;
export interface CutoverProcessingEvidence {
  version:1;capabilities:{raw:boolean;conversion:boolean};rawReceipts:Fact[];rawSegments:Fact[];
  documents:Fact[];inputs:Fact[];outputs:Fact[];rawRoots:Fact[];derivationParents:Fact[];rawBalances:CutoverRawBalance[];
}
export async function readCutoverProcessingEvidence(m:EntityManager,boundary:{companyCode:string;warehouseCode:string;productCodes:string[];houses:Array<{houseCode:string}>},
  batchNos:string[],tables:Set<string>,columns:Map<string,Set<string>>,targetProductOnly=false){
  const missing:string[]=[],warnings:string[]=[],stock=new Set<string>();
  const group=(names:string[])=>{
    const present=names.filter(name=>tables.has(name));
    if(present.length&&present.length!==names.length)missing.push(...names.filter(name=>!tables.has(name)));
    return present.length===names.length;
  };
  const raw=group(['production_raw_receipts','production_raw_receipt_segments']);
  const conversion=group(['production_conversion_documents','production_conversion_inputs','production_conversion_outputs',
    'production_batch_raw_roots','production_batch_derivation_parents']);
  const evidence:CutoverProcessingEvidence={version:1,capabilities:{raw,conversion},rawReceipts:[],rawSegments:[],documents:[],inputs:[],outputs:[],rawRoots:[],derivationParents:[],rawBalances:[]};
  if(conversion&&!raw)missing.push('RAW_SOURCE_SCHEMA_FOR_CONVERSIONS');
  const schemaRequired:Record<string,string[]>={production_raw_receipts:['id','document_no','company_code','warehouse_code','house_code','state','production_date'],
    production_raw_receipt_segments:['id','receipt_id','quantity','grade_code'],production_conversion_documents:['id','company_code','warehouse_code','product_code','state'],
    production_conversion_inputs:['document_id','raw_segment_id','parent_batch_no','quantity'],production_conversion_outputs:['document_id','batch_no'],
    production_batch_raw_roots:['batch_no','raw_segment_id'],production_batch_derivation_parents:['batch_no','parent_batch_no']};
  for(const [table,fields] of Object.entries(schemaRequired))if(tables.has(table))for(const field of fields)
    if(!columns.get(table)?.has(field))missing.push(`${table}.${field}`);
  if(missing.length||!raw)return {evidence,missing,warnings,stockBatchNos:[] as string[]};
  const read=async(table:string,where:string,args:unknown[]):Promise<Fact[]>=>
    (await m.query(`SELECT ${cutoverFactSql(columns.get(table))} AS fact FROM ${table} f WHERE ${where} ORDER BY to_jsonb(f)::text`,args)).map((row:{fact:Fact})=>row.fact);
  const local=(facts:Fact[])=>facts.filter(f=>{
    if(f.company_code!==boundary.companyCode){warnings.push('CROSS_COMPANY_PROCESSING_REQUIRES_SEPARATE_AUTHORITY');return false;}return true;
  });
  const varietyKey=(value:unknown)=>value===null?'STANDARD':typeof value==='string'&&value.trim()?`VARIANT:${value}`:undefined;
  const varieties=new Set((await m.query('SELECT variety_code FROM mst_products WHERE product_code=ANY($1::text[])',[boundary.productCodes]))
    .map((r:{variety_code:string|null})=>varietyKey(r.variety_code)).filter((key:unknown):key is string=>typeof key==='string'));
  const profiles:Fact[]=tables.has('md_egg_source_profiles')?await read('md_egg_source_profiles','f.company_code=$1',[boundary.companyCode]):[];
  const profileKey=(profile:Fact|undefined)=>profile?.productMode==='STANDARD'&&profile.varietyCode===null?'STANDARD'
    :profile?.productMode==='VARIANT'&&typeof profile.varietyCode==='string'?varietyKey(profile.varietyCode):undefined;
  const localSeed=async()=>{
    const candidates=await read('production_raw_receipts','f.company_code=$1 AND f.warehouse_code=$2',[boundary.companyCode,boundary.warehouseCode]),selected:Fact[]=[];
    for(const candidate of candidates){
      const profile=(candidate.payload as {profile?:Fact}|undefined)?.profile,frozen=profileKey(profile);
      const historical=profiles.filter(p=>p.house_code===candidate.house_code&&String(p.effective_date)<=String(candidate.production_date)
        &&(!p.expire_date||String(p.expire_date)>=String(candidate.production_date)));
      const inferred=[...new Set(historical.map(p=>profileKey({productMode:p.product_mode,varietyCode:p.variety_code})).filter((key):key is string=>key!==undefined))];
      const declaredHouse=boundary.houses.some(h=>h.houseCode===candidate.house_code),related=frozen?varieties.has(frozen):inferred.some(v=>varieties.has(v));
      if((declaredHouse&&!targetProductOnly)||related){selected.push(candidate);if(profile?!frozen:inferred.length!==1)warnings.push('RAW_VARIETY_BOUNDARY_UNRESOLVED');}
      else if(profile?!frozen:!inferred.length)warnings.push('RAW_VARIETY_BOUNDARY_UNRESOLVED');
    }
    return selected;
  };
  const seeds=await localSeed(),seedIds=seeds.map(r=>String(r.id));
  const rawIds=new Set<string>(),documentIds=new Set<string>();
  if(conversion){
    evidence.rawRoots=await read('production_batch_raw_roots','f.batch_no=ANY($1::text[])',[batchNos]);
    evidence.derivationParents=await read('production_batch_derivation_parents','f.batch_no=ANY($1::text[]) OR f.parent_batch_no=ANY($1::text[])',[batchNos]);
    for(const fact of evidence.rawRoots)rawIds.add(String(fact.raw_segment_id));
    for(const fact of evidence.derivationParents)for(const field of ['batch_no','parent_batch_no'])stock.add(String(fact[field]));
    const rooted=await read('production_raw_receipt_segments','f.id=ANY($1::uuid[])',[[...rawIds]]);
    for(const fact of rooted)rawIds.add(String(fact.id));
    evidence.rawReceipts=local(await read('production_raw_receipts',`f.id=ANY($1::uuid[])
      OR f.id IN(SELECT receipt_id FROM production_raw_receipt_segments WHERE id=ANY($2::uuid[]))`,[seedIds,[...rawIds]]));
  }else evidence.rawReceipts=seeds;
  let expanded=true;
  while(expanded){
    const before=`${rawIds.size}:${documentIds.size}:${evidence.rawReceipts.length}`;
    const receiptIds=evidence.rawReceipts.map(f=>String(f.id));
    evidence.rawSegments=await read('production_raw_receipt_segments','f.receipt_id=ANY($1::uuid[])',[receiptIds]);
    for(const fact of evidence.rawSegments)rawIds.add(String(fact.id));
    if(conversion){
      const documents=await read('production_conversion_documents',`(f.company_code=$1 AND f.warehouse_code=$2 AND f.product_code=ANY($3::text[]))
        OR f.id IN(SELECT document_id FROM production_conversion_inputs WHERE raw_segment_id=ANY($4::uuid[]) OR parent_batch_no=ANY($5::text[]))
        OR f.id IN(SELECT document_id FROM production_conversion_outputs WHERE batch_no=ANY($5::text[]))
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.payload->'request'->'inputs')='array' THEN f.payload->'request'->'inputs' ELSE '[]'::jsonb END) request
          WHERE lower(request->>'rawSegmentId')=ANY($6::text[]) OR request->>'parentBatchNo'=ANY($5::text[]))`,
        [boundary.companyCode,boundary.warehouseCode,boundary.productCodes,[...rawIds],batchNos,[...rawIds]]);
      evidence.documents=local(documents);for(const fact of evidence.documents)documentIds.add(String(fact.id));
      evidence.inputs=await read('production_conversion_inputs','f.document_id=ANY($1::uuid[])',[[...documentIds]]);
      evidence.outputs=await read('production_conversion_outputs','f.document_id=ANY($1::uuid[])',[[...documentIds]]);
      for(const fact of evidence.inputs){if(fact.raw_segment_id)rawIds.add(String(fact.raw_segment_id));if(fact.parent_batch_no)stock.add(String(fact.parent_batch_no));}
      for(const fact of evidence.outputs)if(fact.batch_no)stock.add(String(fact.batch_no));
      evidence.rawReceipts=local(await read('production_raw_receipts',`f.id=ANY($1::uuid[])
        OR f.id IN(SELECT receipt_id FROM production_raw_receipt_segments WHERE id=ANY($2::uuid[]))`,[seedIds,[...rawIds]]));
    }
    expanded=before!==`${rawIds.size}:${documentIds.size}:${evidence.rawReceipts.length}`;
    if(rawIds.size+documentIds.size+stock.size>50000)throw new ConflictException('CUTOVER_PROCESSING_SCOPE_TOO_LARGE');
  }
  // Direct RAW consumption only. Reprocessing its WIP descendants must not debit RAW twice.
  const consumed=new Map<string,string>();
  if(conversion)for(const row of await m.query(`SELECT input.raw_segment_id::text AS id,SUM(input.quantity)::text AS quantity
    FROM production_conversion_inputs input JOIN production_conversion_documents document ON document.id=input.document_id
    WHERE input.raw_segment_id=ANY($1::uuid[]) AND document.state='POSTED' GROUP BY input.raw_segment_id`,[[...rawIds]]))consumed.set(row.id,row.quantity);
  const receipts=new Map(evidence.rawReceipts.map(f=>[String(f.id),f]));
  for(const segment of evidence.rawSegments){
    const receipt=receipts.get(String(segment.receipt_id));if(!receipt||receipt.state!=='POSTED')continue;
    const quantity=String(segment.quantity),used=consumed.get(String(segment.id))??'0',remaining=Number(quantity)-Number(used);
    if(!Number.isSafeInteger(remaining)||remaining<0)warnings.push('RAW_PHYSICAL_BALANCE_UNRESOLVED');
    evidence.rawBalances.push({rawSegmentId:String(segment.id),receiptId:String(receipt.id),documentNo:String(receipt.document_no),
      companyCode:String(receipt.company_code),warehouseCode:String(receipt.warehouse_code),houseCode:String(receipt.house_code),
      productionDate:String(receipt.production_date),gradeCode:String(segment.grade_code),receivedQuantity:quantity,consumedQuantity:used,remainingQuantity:String(remaining)});
  }
  evidence.rawBalances.sort((a,b)=>a.rawSegmentId.localeCompare(b.rawSegmentId));
  return {evidence,missing:[...new Set(missing)],warnings:[...new Set(warnings)],stockBatchNos:[...stock].filter(Boolean).sort()};
}
