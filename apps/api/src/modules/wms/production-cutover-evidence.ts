import { readCutoverProcessingEvidence } from './production-cutover-processing-evidence';
import { cutoverFactSql } from './cutover-evidence-row';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { CrossCompanyCutoverProof, CutoverProvenanceSigner, proveCrossCompanyTransfer } from './cutover-cross-company-proof';

export interface CutoverEvidenceBoundary {
  companyCode:string;warehouseCode:string;productCodes:string[];
  houses:Array<{houseCode:string;firstProductionDate:string}>;
}
const references:Record<string,string[]>={
  wms_inbound_items:['batch_no'],wms_outbound:['batch_no'],wms_outbound_items:['batch_no'],
  wms_transfer:['batch_no'],wms_transfer_items:['source_batch_no','target_batch_no','damaged_batch_no'],
  wms_stocktake:['batch_no','item'],wms_defect_dispositions:['batch_no','target_batch_no'],
  sal_order_item_batch_allocations:['batch_no'],store_sale_allocations:['batch_no'],
  sal_store_sale_items:['batch_no'],pos_sale_items:['batch_no'],qa_non_conformance:['batch_no'],
  lbl_records:['batch_no'],pkg_tasks:['batch_no'],
  brd_vaccinations:['inventory_batch_no','batch_no'],brd_vaccination_issue_lines:['inventory_batch_no'],
  brd_medication_records:['inventory_batch_no','batch_no'],brd_medication_issue_lines:['inventory_batch_no'],
};
const optionalReferences:Record<string,string[]>={wms_stock_balance:['batch_no'],wms_stock_ledger:['batch_no']};
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:
  value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical((value as Record<string,unknown>)[k])}`).join(',')}}`:JSON.stringify(value);
export const cutoverEvidenceHash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const sortFacts=(facts:Record<string,unknown>[])=>facts.sort((a,b)=>canonical(a).localeCompare(canonical(b)));
function boundary(input:CutoverEvidenceBoundary):CutoverEvidenceBoundary {
  const code=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>128)throw new BadRequestException('切换边界编码无效');return value;};
  if(!Array.isArray(input?.productCodes)||!input.productCodes.length||input.productCodes.length>100
    ||!Array.isArray(input.houses)||!input.houses.length||input.houses.length>100)throw new BadRequestException('切换须明确产品及全部相关鸡舍');
  const products=[...new Set(input.productCodes.map(code))].sort();
  if(products.length!==input.productCodes.length||new Set(input.houses.map(h=>h.houseCode)).size!==input.houses.length)throw new BadRequestException('切换边界重复');
  return {companyCode:code(input.companyCode),warehouseCode:code(input.warehouseCode),productCodes:products,
    houses:input.houses.map(h=>{const d=h.firstProductionDate;
      if(typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw new BadRequestException('首个正式生产日无效');
      return {houseCode:code(h.houseCode),firstProductionDate:d};}).sort((a,b)=>a.houseCode.localeCompare(b.houseCode))};
}

/** Read-only evidence, never an activation decision. All callers must keep these facts internal until scoped/redacted for their actor. */
async function readProductionCutoverEvidenceUtc(m:EntityManager,input:CutoverEvidenceBoundary,options:{signer?:CutoverProvenanceSigner;lockCrossCompanyRoots?:boolean}={}) {
  if(!m.queryRunner?.isTransactionActive)throw new ConflictException('CUTOVER_EVIDENCE_TRANSACTION_REQUIRED');
  const scope=boundary(input),houses=scope.houses.map(h=>h.houseCode),missing:string[]=[],warnings:string[]=[];
  const catalog=await m.query(`SELECT c.relname,array_agg(a.attname::text) FILTER(WHERE a.attnum>0 AND NOT a.attisdropped) AS columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname=current_schema() AND c.relkind IN ('r','p') GROUP BY c.relname`);
  const tables=new Set<string>(catalog.map((r:{relname:string})=>r.relname));
  const columns=new Map<string,Set<string>>(catalog.map((r:{relname:string;columns:string[]})=>[r.relname,new Set(r.columns??[])]));
  const exists=(table:string,required=true)=>{if(tables.has(table))return true;if(required)missing.push(table);return false;};
  const rows=async(table:string,where:string,parameters:unknown[]=[],required=true):Promise<Record<string,unknown>[]>=>{
    if(!exists(table,required))return [];
    return sortFacts((await m.query(`SELECT ${cutoverFactSql(columns.get(table))} AS fact FROM ${table} f WHERE ${where}`,parameters)).map((r:{fact:Record<string,unknown>})=>r.fact));
  };
  const warehouse=await rows('wms_warehouses',"f.warehouse_code=$1 AND f.company_code=$2",[scope.warehouseCode,scope.companyCode]);
  if(warehouse.length!==1)warnings.push('WAREHOUSE_COMPANY_IDENTITY_UNRESOLVED');
  const owners=exists('brd_houses')&&exists('brd_farms')?await m.query(`SELECT h.house_code,h.farm_code,h.status,
    f.company_code,f.mapped_site_code AS site_code,f.status AS farm_status FROM brd_houses h JOIN brd_farms f ON f.farm_code=h.farm_code
    WHERE h.house_code=ANY($1::text[]) ORDER BY h.house_code`,[houses]):[];
  if(owners.length!==houses.length||owners.some((h:{company_code:string})=>h.company_code!==scope.companyCode))warnings.push('HOUSE_COMPANY_IDENTITY_UNRESOLVED');
  const masters={products:await rows('mst_products','f.product_code=ANY($1::text[])',[scope.productCodes]),
    skus:await rows('product_skus','f.product_code=ANY($1::text[])',[scope.productCodes]),
    profiles:await rows('md_egg_source_profiles','f.house_code=ANY($1::text[]) AND f.company_code=$2',[houses,scope.companyCode]),
    occupancies:await rows('brd_flock_occupancies','f.house_code=ANY($1::text[])',[houses]),
    balances:await rows('brd_flock_balances','f.house_code=ANY($1::text[])',[houses])};
  // Disabled historical products still need a physical count; a missing product has no authoritative boundary.
  if(masters.products.length!==scope.productCodes.length)warnings.push('PRODUCT_MASTER_IDENTITY_UNRESOLVED');
  const reports=await rows('brd_daily_logs','f.house_code=ANY($1::text[])',[houses]);
  const flocks=await rows('brd_flocks','f.house_code=ANY($1::text[])',[houses]);
  const flockNos=[...new Set([...flocks,...reports,...masters.occupancies].map(f=>String(f.flock_no??'')).filter(Boolean))];
  const batches=exists('inv_batches')&&exists('product_skus')&&exists('inv_ledger')&&exists('wms_warehouses')?await m.query(`SELECT ${cutoverFactSql(columns.get('inv_batches'),'b')} AS fact FROM inv_batches b
    LEFT JOIN product_skus sku ON sku.sku_code=b.sku_code
    WHERE (b.company_code=$1 OR (b.company_code IS NULL OR b.company_code='ALL') AND EXISTS(
      SELECT 1 FROM wms_warehouses w WHERE w.warehouse_code=b.warehouse_code AND w.company_code=$1)) AND (b.material_code IS NULL OR b.sku_code IS NOT NULL) AND ((b.warehouse_code=$2 AND (sku.product_code=ANY($3::text[]) OR b.material_code IS NULL AND b.product_code=ANY($3::text[])))
      OR EXISTS(SELECT 1 FROM inv_ledger l WHERE l.batch_no=b.batch_no AND to_jsonb(l)->>'ref_no'=ANY($6::text[])
        AND to_jsonb(l)->>'change_type' IN ('FARM_IN','FARM_REVERSED'))
      OR b.collection_batch_ref=ANY($4::text[]) OR EXISTS(SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(to_jsonb(b)->'source_profile_snapshot')='array' THEN to_jsonb(b)->'source_profile_snapshot' ELSE '[]'::jsonb END) p
        WHERE p->>'houseCode'=ANY($5::text[])))`,[scope.companyCode,scope.warehouseCode,scope.productCodes,houses.map(h=>`HOUSE-${h}`),houses,flockNos]):[];
  const byBatch=new Map<string,Record<string,unknown>>(batches.map((b:{fact:Record<string,unknown>})=>[String(b.fact.batch_no),b.fact]));
  const foreignByBatch=new Map<string,Record<string,unknown>>();
  const addBatch=(fact:Record<string,unknown>)=>{
    if(fact.company_code&&fact.company_code!=='ALL'&&fact.company_code!==scope.companyCode){foreignByBatch.set(String(fact.batch_no),fact);return false;}
    if(byBatch.has(String(fact.batch_no)))return false;byBatch.set(String(fact.batch_no),fact);return true;
  };
  // Cross a company boundary only inside private handover validation; never expand its remaining stock into this count.
  const edges=[['production_batch_roots','root_batch_no','batch_no'],['inv_flock_source_links','origin_batch_no','batch_no'],
    ['wms_transfer_items','source_batch_no','target_batch_no'],['wms_defect_dispositions','batch_no','target_batch_no'],
    ...(tables.has('production_batch_derivation_parents')?[['production_batch_derivation_parents','parent_batch_no','batch_no'] as const]:[]),
    ...(columns.get('wms_transfer_items')?.has('damaged_batch_no')?[['wms_transfer_items','source_batch_no','damaged_batch_no'] as const]:[])] as const;
  const lineage:Record<string,Record<string,unknown>[]>={};
  async function packagingFor(tokens:string[]) {
    const sources=await rows('pkg_source_batches',`to_jsonb(f)->>'batch_code'=ANY($1::text[]) OR to_jsonb(f)->>'source_inbound_no'=ANY($1::text[])
      OR to_jsonb(f)->>'house_code'=ANY($2::text[])`,[tokens,houses]);
    const gradingLinks=await rows('pkg_grading_source_links',"to_jsonb(f)->>'source_batch_id'=ANY($1::text[])",[sources.map(f=>String(f.id))]);
    const grading=await rows('pkg_grading_records',"to_jsonb(f)->>'id'=ANY($1::text[])",[gradingLinks.map(f=>String(f.grading_id))]);
    const packing=await rows('pkg_packing_records',`to_jsonb(f)->>'code'=ANY($2::text[]) OR to_jsonb(f)->>'grading_code'=ANY($1::text[]) OR EXISTS(
      SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(f)->'grading_codes_json')='array' THEN to_jsonb(f)->'grading_codes_json' ELSE '[]'::jsonb END) code WHERE code=ANY($1::text[]))`,[grading.map(f=>String(f.code)),tokens]);
    return {sources,gradingLinks,grading,packing};
  }
  let packaging=await packagingFor([...byBatch.keys()]);
  let processing=await readCutoverProcessingEvidence(m,scope,[...byBatch.keys()],tables,columns);
  let expanded=true;
  while(expanded){expanded=false;const tokens=[...byBatch.keys()].sort();
    for(const [table,parent,child] of edges){
      const facts=await rows(table,`to_jsonb(f)->>'${parent}'=ANY($1::text[]) OR to_jsonb(f)->>'${child}'=ANY($1::text[])`,[tokens]);lineage[table]=sortFacts([...new Map([...(lineage[table]??[]),...facts].map(f=>[canonical(f),f])).values()]);
      const children=[...new Set(facts.flatMap(f=>[String(f[parent]??''),String(f[child]??'')]).filter(c=>c&&!byBatch.has(c)&&!foreignByBatch.has(c)))];
      if(children.length&&exists('inv_batches')){
        const actual=await rows('inv_batches','f.batch_no=ANY($1::text[])',[children]);
        for(const fact of actual)if(addBatch(fact))expanded=true;
        if(actual.length!==children.length)warnings.push(`MISSING_LINEAGE_BATCH:${table}`);
      }
    }
    packaging=await packagingFor([...new Set([...byBatch.keys(),...[...byBatch.values()].map(b=>String(b.packaging_batch_ref??'')).filter(Boolean)])]);
    if(exists('inv_batches')){
      const outputs=await rows('inv_batches',"to_jsonb(f)->>'packaging_batch_ref'=ANY($1::text[])",[packaging.packing.map(f=>String(f.code))]);
      for(const output of outputs)if(addBatch(output))expanded=true;
    }
    processing=await readCutoverProcessingEvidence(m,scope,[...byBatch.keys()],tables,columns);
    const processingBatches=processing.stockBatchNos.filter(no=>!byBatch.has(no)&&!foreignByBatch.has(no));
    if(processingBatches.length){
      const actual=await rows('inv_batches','f.batch_no=ANY($1::text[])',[processingBatches]);
      for(const fact of actual)if(addBatch(fact))expanded=true;
      if(actual.length!==processingBatches.length)warnings.push('MISSING_PROCESSING_BATCH');
    }
    if(byBatch.size>50000)throw new ConflictException('CUTOVER_EVIDENCE_SCOPE_TOO_LARGE');
  }
  missing.push(...processing.missing);warnings.push(...processing.warnings);
  // Missing physical ancestors cannot be assigned an owner safely. Never return their raw lineage to a scoped caller.
  if(warnings.some(w=>w.startsWith('MISSING_LINEAGE_BATCH:')))throw new ConflictException('CUTOVER_LINEAGE_OWNERSHIP_UNRESOLVED');
  const crossCompanyProofs:CrossCompanyCutoverProof[]=[],provenForeign=new Set<string>();
  const crossLocalBatches=new Set<string>(),proofByTransferLine=new Map<string,CrossCompanyCutoverProof>();
  for(const transfer of lineage.wms_transfer_items??[]){
    const source=String(transfer.source_batch_no??''),target=String(transfer.target_batch_no??'');
    const local=byBatch.get(source)??byBatch.get(target),foreign=foreignByBatch.get(source)??foreignByBatch.get(target);
    if(!local||!foreign)continue;
    await m.query('SAVEPOINT cutover_cross_proof');
    try{
      const validation=await proveCrossCompanyTransfer(m,local,foreign,cutoverEvidenceHash,!!options.lockCrossCompanyRoots,options.signer);
      crossCompanyProofs.push(validation.publicProof);proofByTransferLine.set(String(transfer.id),validation.publicProof);
      if(validation.publicProof.direction==='RECEIVED')crossLocalBatches.add(String(local.batch_no));provenForeign.add(validation.foreignBatchNo);
      for(const root of validation.rootNos)provenForeign.add(root);
      await m.query('RELEASE SAVEPOINT cutover_cross_proof');
    }catch{await m.query('ROLLBACK TO SAVEPOINT cutover_cross_proof');await m.query('RELEASE SAVEPOINT cutover_cross_proof');warnings.push('CROSS_COMPANY_SOURCE_PROOF_REQUIRED');}
  }
  const inheritedForeign=(lineage.production_batch_roots??[]).filter(r=>foreignByBatch.has(String(r.root_batch_no)));
  for(const root of inheritedForeign){const no=String(root.batch_no);if(!provenForeign.has(String(root.root_batch_no)))continue;
    const local=byBatch.get(no);if(!local||crossLocalBatches.has(no))continue;
    const incoming=(lineage.wms_transfer_items??[]).filter(r=>r.target_batch_no===no),parent=incoming.length===1?byBatch.get(String(incoming[0].source_batch_no)):undefined;
    if(!parent){warnings.push('CROSS_COMPANY_SOURCE_PROOF_REQUIRED');continue;}
    await m.query('SAVEPOINT cutover_cross_proof');
    try{const validation=await proveCrossCompanyTransfer(m,local,parent,cutoverEvidenceHash,!!options.lockCrossCompanyRoots,options.signer);
      crossCompanyProofs.push(validation.publicProof);proofByTransferLine.set(String(incoming[0].id),validation.publicProof);crossLocalBatches.add(no);
      await m.query('RELEASE SAVEPOINT cutover_cross_proof');
    }catch{await m.query('ROLLBACK TO SAVEPOINT cutover_cross_proof');await m.query('RELEASE SAVEPOINT cutover_cross_proof');warnings.push('CROSS_COMPANY_SOURCE_PROOF_REQUIRED');}
  }
  if([...foreignByBatch.keys()].some(no=>!provenForeign.has(no)))warnings.push('CROSS_COMPANY_DESCENDANTS_REQUIRE_SEPARATE_AUTHORITY');
  for(const [table,parent,child] of edges){
    lineage[table]=(lineage[table]??[]).filter(f=>!foreignByBatch.has(String(f[parent]??''))&&!foreignByBatch.has(String(f[child]??'')));
  }
  processing.evidence.derivationParents=processing.evidence.derivationParents.filter(row=>!foreignByBatch.has(String(row.parent_batch_no))&&!foreignByBatch.has(String(row.batch_no)));
  const selected=sortFacts([...byBatch.values()].map(b=>crossLocalBatches.has(String(b.batch_no))?{...b,
    collection_batch_ref:null,source_profile_code:null,source_profile_snapshot:null}:b)),batchNos=[...byBatch.keys()].sort();
  if(selected.some(b=>!b.company_code||b.company_code==='ALL'))warnings.push('UNCONFIRMED_LEGACY_STOCK_OWNERSHIP');
  if(selected.some(b=>b.product_code&&!scope.productCodes.includes(String(b.product_code))))warnings.push('UNDECLARED_RELATED_PRODUCT_BOUNDARY');
  const privateHandoverLedgerIds=new Set(crossCompanyProofs.flatMap(p=>p.localLedgerIds));
  const ledger=(await rows('inv_ledger','f.batch_no=ANY($1::text[])',[batchNos])).map(l=>crossLocalBatches.has(String(l.batch_no))
    ?{...l,note:null,...(privateHandoverLedgerIds.has(String(l.id))?{operator:null}:{})}:l);
  const sourceTokens=[...new Set([...batchNos,...selected.flatMap(b=>[b.source_no,b.packaging_batch_ref]).filter((v):v is string=>typeof v==='string'&&!!v)])].sort();
  const obligations:Record<string,Record<string,unknown>[]>={};
  for(const [table,fields] of Object.entries(references)){
    if(tables.has(table)&&!fields.some(f=>columns.get(table)?.has(f)))missing.push(`${table}.batch_reference`);
    obligations[table]=await rows(table,fields.map(f=>`to_jsonb(f)->>'${f}'=ANY($1::text[])`).join(' OR '),[sourceTokens]);
  }
  for(const [table,fields] of Object.entries(optionalReferences))obligations[table]=await rows(table,
    fields.map(f=>`to_jsonb(f)->>'${f}'=ANY($1::text[])`).join(' OR '),[sourceTokens],false);
  // Headers and downstream returns are reached through the real persisted item foreign keys.
  obligations.sal_order_items=await rows('sal_order_items',`to_jsonb(f)->>'id'=ANY($1::text[]) OR EXISTS(
    SELECT 1 FROM regexp_split_to_table(COALESCE(to_jsonb(f)->>'allocated_batch_no',''),',') token WHERE btrim(token)=ANY($2::text[]))`,
    [(obligations.sal_order_item_batch_allocations??[]).map(r=>String(r.sales_order_item_id)),batchNos]);
  obligations.sal_sales_orders=await rows('sal_sales_orders',"to_jsonb(f)->>'id'=ANY($1::text[])",
    [(obligations.sal_order_items??[]).map(r=>String(r.sales_order_id))]);
  obligations.sal_return_items=await rows('sal_return_items',"to_jsonb(f)->>'sales_order_item_id'=ANY($1::text[])",
    [(obligations.sal_order_items??[]).map(r=>String(r.id))]);
  obligations.sal_return_orders=await rows('sal_return_orders',"to_jsonb(f)->>'id'=ANY($1::text[])",
    [(obligations.sal_return_items??[]).map(r=>String(r.return_order_id))]);
  obligations.sal_store_sales=await rows('sal_store_sales',"to_jsonb(f)->>'id'=ANY($1::text[])",
    [(obligations.store_sale_allocations??[]).map(r=>String(r.sale_id))]);
  for(const [header,item,field] of [['wms_inbound','wms_inbound_items','inbound_no'],['wms_outbound','wms_outbound_items','outbound_no'],['wms_transfer','wms_transfer_items','transfer_no']]){
    const headers=await rows(header,`to_jsonb(f)->>'${field}'=ANY($1::text[])`,[(obligations[item]??[]).map(r=>String(r[field]??''))]);
    obligations[header]=sortFacts([...new Map([...(obligations[header]??[]),...headers].map(r=>[canonical(r),r])).values()]);
  }
  const discrepancyRows=await rows('wms_transfer_discrepancies',"to_jsonb(f)->>'transfer_item_id'=ANY($1::text[])",
    [(obligations.wms_transfer_items??[]).map(r=>String(r.id))],false);
  if(!tables.has('wms_transfer_discrepancies')&&(obligations.wms_transfer_items??[]).some(r=>Number(r.difference_qty)>0||Number(r.damaged_qty)>0))missing.push('wms_transfer_discrepancies');
  obligations.wms_transfer_discrepancies=discrepancyRows.filter(row=>{
    if(proofByTransferLine.has(String(row.transfer_item_id))){warnings.push('CROSS_COMPANY_SOURCE_PROOF_REQUIRED');return false;}return true;
  });
  obligations.production_raw_receipts=processing.evidence.rawReceipts;
  obligations.production_conversion_documents=processing.evidence.documents;
  obligations.qa_inspections=[];
  if(exists('qa_inspections'))for(const field of ['items_json','fail_items_json']){
    if(!columns.get('qa_inspections')?.has(field))missing.push(`qa_inspections.${field}`);
    const [invalid]=await m.query(`SELECT COUNT(*)::int AS n FROM qa_inspections f WHERE jsonb_typeof(to_jsonb(f)->$1)='string'
      AND NOT pg_input_is_valid(to_jsonb(f)->>$1,'jsonb')`,[field]);
    if(invalid.n)warnings.push(`UNPARSEABLE_QA_REFERENCE:${field}`);
    const facts=await m.query(`WITH decoded AS(SELECT to_jsonb(f) AS fact,CASE
      WHEN jsonb_typeof(to_jsonb(f)->$2)='string' THEN CASE WHEN pg_input_is_valid(to_jsonb(f)->>$2,'jsonb')
        THEN (to_jsonb(f)->>$2)::jsonb ELSE NULL END ELSE to_jsonb(f)->$2 END AS parsed FROM qa_inspections f)
      SELECT fact FROM decoded WHERE EXISTS(SELECT 1 FROM unnest($1::text[]) token WHERE position(token IN parsed::text)>0)`,[batchNos,field]);
    obligations.qa_inspections=sortFacts([...new Map([...obligations.qa_inspections,...facts.map((r:any)=>r.fact)].map(r=>[canonical(r),r])).values()]);
  }
  const finance:Record<string,Record<string,unknown>[]>={};
  for(const table of ['chanjet_voucher_drafts']){
    if(!exists(table))continue;
    // Never return arbitrary voucher raw_data, connector tokens or credentials as part of evidence.
    finance[table]=sortFacts(await m.query(`SELECT to_jsonb(f)->>'id' AS id,to_jsonb(f)->>'status' AS status,
      to_jsonb(f)->>'company_code' AS company_code,encode(sha256(convert_to(to_jsonb(f)::text,'UTF8')),'hex') AS row_sha256
      FROM ${table} f WHERE EXISTS(SELECT 1 FROM unnest($1::text[]) token WHERE position(token IN to_jsonb(f)::text)>0)`,[sourceTokens]));
  }
  if(exists('chanjet_writeback_outbox'))finance.chanjet_writeback_outbox=sortFacts(await m.query(`SELECT
    to_jsonb(f)->>'id' AS id,to_jsonb(f)->>'status' AS status,to_jsonb(f)->>'company_code' AS company_code,
    encode(sha256(convert_to(to_jsonb(f)::text,'UTF8')),'hex') AS row_sha256 FROM chanjet_writeback_outbox f
    WHERE to_jsonb(f)->>'draft_id'=ANY($1::text[])`,[(finance.chanjet_voucher_drafts??[]).map(r=>String(r.id))]));
  if(Object.values(finance).flat().some(r=>r.company_code&&r.company_code!==scope.companyCode))warnings.push('CROSS_COMPANY_FINANCIAL_REFERENCES_REQUIRE_SEPARATE_AUTHORITY');
  const proofByBatch=new Map(crossCompanyProofs.map(p=>[p.batchNo,p]));
  const qualification=(await rows('production_batch_qualifications','f.batch_no=ANY($1::text[])',[batchNos]))
    .map(q=>crossLocalBatches.has(String(q.batch_no))?{
      batch_no:q.batch_no,company_code:q.company_code,product_code:q.product_code,sku_code:q.sku_code,
      disposition:q.disposition,origin_kind:q.origin_kind,source_type:q.source_type,source_no:q.source_no,cost_status:q.cost_status,
      proof_sha256:proofByBatch.get(String(q.batch_no))?.proofSha256}:q);
  const sourceEvents=await rows('production_source_state_events','f.root_batch_no=ANY($1::text[])',[batchNos]);
  const sourceCompanies=[...new Set([scope.companyCode,...selected.map(b=>String(b.company_code??''))])];
  const sourceWarehouses=[...new Set([scope.warehouseCode,...selected.map(b=>String(b.warehouse_code??'')),...qualification.map(q=>String(q.source_warehouse_code??'')),...processing.evidence.rawReceipts.map(r=>String(r.warehouse_code??''))])];
  const inventoryDomains=await rows('production_inventory_domain_states',"f.company_code=ANY($1::text[]) AND f.warehouse_code=ANY($2::text[]) AND f.product_code=ANY($3::text[])",[sourceCompanies,sourceWarehouses,scope.productCodes]);
  const openingClaims=await rows('production_opening_domain_claims',"f.domain_id::text=ANY($1::text[])",[inventoryDomains.map(d=>String(d.id))]);
  const cutovers=await rows('production_cutover_scopes',"f.company_code=$1 AND (f.house_code=ANY($2::text[]) OR f.id::text=ANY($3::text[]))",[scope.companyCode,houses,[...qualification.map(q=>String(q.scope_id)),...processing.evidence.rawReceipts.map(r=>String(r.scope_id))]]);
  const domains=await rows('production_inventory_domains','f.company_code=$1 AND f.warehouse_code=$2 AND f.product_code=ANY($3::text[])',[scope.companyCode,scope.warehouseCode,scope.productCodes]);
  masters.profiles=await rows('md_egg_source_profiles','f.house_code=ANY($1::text[]) AND f.company_code=$2',[[...new Set([...houses,...processing.evidence.rawReceipts.map(r=>String(r.house_code))])],scope.companyCode]);
  const receiptByNo=new Map(crossCompanyProofs.map(p=>[p.transferNo,p]));
  obligations.wms_transfer_items=(obligations.wms_transfer_items??[]).map(row=>{
    const proof=proofByTransferLine.get(String(row.id));if(!proof)return row;
    return {id:row.id,transfer_no:proof.transferNo,company_code:scope.companyCode,warehouse_code:scope.warehouseCode,
      [proof.direction==='RECEIVED'?'target_batch_no':'source_batch_no']:proof.batchNo,
      expected_qty:proof.quantity,received_qty:proof.quantity,damaged_qty:0,difference_qty:0,remaining_quantity:0,
      proof_kind:'CROSS_COMPANY_VERIFIED',proof_sha256:proof.proofSha256};
  });
  obligations.wms_transfer=(obligations.wms_transfer??[]).map(row=>{
    const proof=receiptByNo.get(String(row.transfer_no));return proof?{transfer_no:proof.transferNo,status:row.status,
      company_code:scope.companyCode,warehouse_code:scope.warehouseCode,proof_kind:'CROSS_COMPANY_VERIFIED',proof_sha256:proof.proofSha256}:row;
  });
  lineage.wms_transfer_items=obligations.wms_transfer_items;
  const publicGroups:Record<string,Record<string,unknown>[]>[]=[obligations,packaging,finance];
  for(const bucket of publicGroups)for(const [table,facts] of Object.entries(bucket)){
    bucket[table]=facts.filter(f=>{
      const owner=f.company_code??f.companyCode;
      if(owner&&owner!=='ALL'&&owner!==scope.companyCode){warnings.push('CROSS_COMPANY_REFERENCE_REQUIRES_SEPARATE_AUTHORITY');return false;}return true;
    });
  }
  crossCompanyProofs.sort((a,b)=>a.batchNo.localeCompare(b.batchNo)||a.transferLineId.localeCompare(b.transferLineId));
  const stores=new Set<string>();
  if(columns.get('store_master')?.has('company_code')&&columns.get('store_master')?.has('store_code')){
    const codes=[...new Set([...selected,...ledger].filter(f=>crossLocalBatches.has(String(f.batch_no))).map(f=>f.store_code).filter(Boolean))];
    for(const row of await m.query('SELECT store_code FROM store_master WHERE company_code=$1 AND store_code=ANY($2::text[])',[scope.companyCode,codes]))stores.add(row.store_code);
  }
  const storeProjection=(f:Record<string,unknown>)=>crossLocalBatches.has(String(f.batch_no))&&f.store_code&&f.store_code!=='ALL'&&!stores.has(String(f.store_code))?{...f,store_code:null}:f;
  const snapshot={version:2,serializationTimeZone:'UTC',boundary:scope,warehouse,owners,masters,flocks,reports,batches:selected.map(storeProjection),ledger:ledger.map(storeProjection),lineage,obligations,
    packaging,finance,qualification,sourceEvents,inventoryDomains,openingClaims,cutovers,domains,crossCompanyProofs,
    processing:processing.evidence,missingTables:[...new Set(missing)].sort(),warnings:[...new Set(warnings)].sort()};
  return {snapshot,snapshotSha256:cutoverEvidenceHash(snapshot),releaseAdmission:false,activationAuthorized:false,
    assessment:'EVIDENCE_ONLY' as const};
}
/** UTC belongs to the evidence serialization scope; never leak it into subsequent business eligibility checks. */
export async function readProductionCutoverEvidence(m:EntityManager,input:CutoverEvidenceBoundary,options:{signer?:CutoverProvenanceSigner;lockCrossCompanyRoots?:boolean}={}){
  if(!m.queryRunner?.isTransactionActive)throw new ConflictException('CUTOVER_EVIDENCE_TRANSACTION_REQUIRED');
  const [previous]=await m.query("SELECT current_setting('TimeZone') AS zone");
  if(typeof previous?.zone!=='string'||!previous.zone)throw new ConflictException('CUTOVER_EVIDENCE_TIMEZONE_REQUIRED');
  await m.query("SELECT set_config('TimeZone','UTC',true)");
  let evidence:Awaited<ReturnType<typeof readProductionCutoverEvidenceUtc>>;
  try{evidence=await readProductionCutoverEvidenceUtc(m,input,options);}
  catch(error){
    // An aborted SQL transaction cannot restore settings; preserve the original failure for its owner to roll back.
    try{await m.query("SELECT set_config('TimeZone',$1,true)",[previous.zone]);}catch{/* rollback restores the transaction-local setting */}
    throw error;
  }
  await m.query("SELECT set_config('TimeZone',$1,true)",[previous.zone]);return evidence;
}
export async function inspectProductionCutoverEvidence(db:DataSource,input:CutoverEvidenceBoundary,options:{signer?:CutoverProvenanceSigner;lockCrossCompanyRoots?:boolean}={}){
  return db.transaction('REPEATABLE READ',async m=>{await m.query('SET TRANSACTION READ ONLY');return readProductionCutoverEvidence(m,input,options);});
}
