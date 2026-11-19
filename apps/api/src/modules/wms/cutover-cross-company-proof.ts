import { ConflictException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { EntityManager } from 'typeorm';

type Fact=Record<string,any>;
export const CUTOVER_PROVENANCE_SIGNER=Symbol('CUTOVER_PROVENANCE_SIGNER');
export interface CutoverProvenanceSigner {key:string;keyId:string}
export interface CrossCompanyCutoverProof {
  version:1;direction:'RECEIVED'|'DISPATCHED';batchNo:string;transferNo:string;transferLineId:string;
  skuCode:string;unit:string;quantity:number;localLedgerIds:string[];keyId:string;proofSha256:string;
}
const hold=():never=>{throw new ConflictException('CUTOVER_CROSS_COMPANY_SOURCE_HOLD');};
const amount=(value:unknown):number=>{
  if(value===null||value===undefined||value==='')return hold();
  const n=Number(value);if(!Number.isSafeInteger(n)||n<0)return hold();return n;
};
const sameRoots=(a:string[],b:string[])=>JSON.stringify([...new Set(a)].sort())===JSON.stringify([...new Set(b)].sort());

/** Private validation only. The caller must publish publicProof, never foreignBatch/rootNos or source facts. */
export async function proveCrossCompanyTransfer(m:EntityManager,local:Fact,foreign:Fact,hash:(facts:unknown)=>string,lock=false,signer?:CutoverProvenanceSigner,depth=0):Promise<{
  publicProof:CrossCompanyCutoverProof;rootNos:string[];foreignBatchNo:string
}>{
  if(!m.queryRunner?.isTransactionActive)return hold();
  const secret=signer?.key??process.env.CUTOVER_PROVENANCE_PROOF_KEY,keyId=signer?.keyId??process.env.CUTOVER_PROVENANCE_PROOF_KEY_ID??'v1';
  if(!secret||Buffer.byteLength(secret)<32||!/^[a-zA-Z0-9_-]{1,32}$/.test(keyId))throw new ConflictException('CUTOVER_PROVENANCE_SIGNER_UNAVAILABLE');
  if(depth>64||!local.company_code||!foreign.company_code||local.company_code==='ALL'||foreign.company_code==='ALL'||local.batch_no===foreign.batch_no)return hold();
  const candidates=await m.query(`SELECT to_jsonb(i) AS line,to_jsonb(t) AS header FROM wms_transfer_items i
    JOIN wms_transfer t ON t.transfer_no=i.transfer_no WHERE
      (i.source_batch_no=$1 AND i.target_batch_no=$2) OR (i.source_batch_no=$2 AND i.target_batch_no=$1)
      ORDER BY t.transfer_no,i.id`+(lock?' FOR SHARE OF t,i':''),[local.batch_no,foreign.batch_no]);
  if(candidates.length!==1)return hold();
  const {line,header}=candidates[0],received=line.target_batch_no===local.batch_no;
  const source=received?foreign:local,target=received?local:foreign;
  const qty=amount(line.expected_qty);
  if(!qty||amount(line.received_qty)!==qty||Number(line.damaged_qty??0)!==0||Number(line.difference_qty??0)!==0||header.status!=='COMPLETED'
    ||header.from_warehouse!==source.warehouse_code||header.to_warehouse!==target.warehouse_code
    ||target.source_type!=='TRANSFER'||target.source_no!==header.transfer_no||source.material_code!=null||target.material_code!=null
    ||!source.sku_code||source.sku_code!==target.sku_code||source.product_code!==target.product_code||source.unit!=='枚'||target.unit!=='枚'
    ||source.grade_code_std!==target.grade_code_std||source.base_quantity_version!==1||target.base_quantity_version!==1
    ||amount(target.qty)>qty||amount(target.qty_available)>amount(target.qty))return hold();
  const warehouses=await m.query('SELECT warehouse_code,company_code FROM wms_warehouses WHERE warehouse_code=ANY($1::text[])',[[source.warehouse_code,target.warehouse_code]]);
  if(![source,target].every(b=>warehouses.some((w:Fact)=>w.warehouse_code===b.warehouse_code&&w.company_code===b.company_code)))return hold();
  if((await m.query('SELECT 1 FROM wms_transfer_discrepancies WHERE transfer_no=$1 AND resolved_at IS NULL LIMIT 1',[header.transfer_no])).length)return hold();
  const qualifications=await m.query('SELECT * FROM production_batch_qualifications WHERE batch_no=ANY($1::text[]) ORDER BY batch_no',[[source.batch_no,target.batch_no]]);
  const parent=qualifications.find((q:Fact)=>q.batch_no===source.batch_no),child=qualifications.find((q:Fact)=>q.batch_no===target.batch_no);
  if(!parent||!child||qualifications.some((q:Fact)=>q.disposition!=='QUALIFIED')||child.origin_kind!=='DERIVED'
    ||child.company_code!==target.company_code||child.product_code!==target.product_code||child.sku_code!==target.sku_code
    ||child.source_type!=='TRANSFER'||child.source_no!==header.transfer_no||child.origin_ref!==header.transfer_no)return hold();
  const roots=async(batch:string,q:Fact):Promise<string[]>=>q.origin_kind==='DERIVED'
    ?(await m.query('SELECT root_batch_no FROM production_batch_roots WHERE batch_no=$1 ORDER BY root_batch_no',[batch])).map((r:Fact)=>r.root_batch_no):[batch];
  const rootNos=await roots(source.batch_no,parent),targetRoots=await roots(target.batch_no,child);
  if(!rootNos.length||!sameRoots(rootNos,targetRoots))return hold();
  if(received&&source.company_code!==target.company_code&&[foreign.batch_no,...rootNos].some(no=>String(local.batch_no).startsWith(String(no)+'-')))
    throw new ConflictException('CUTOVER_LEGACY_CROSS_COMPANY_IDENTIFIER_HOLD');
  let parentProofSha256:string|null=null;
  if(parent.origin_kind==='DERIVED'){
    if(source.source_type!=='TRANSFER')return hold();
    const parents=await m.query('SELECT source_batch_no FROM wms_transfer_items WHERE target_batch_no=$1',[source.batch_no]);
    if(parents.length!==1)return hold();
    const [previous]=await m.query('SELECT to_jsonb(b) AS fact FROM inv_batches b WHERE batch_no=$1',[parents[0].source_batch_no]);
    if(!previous)return hold();
    parentProofSha256=(await proveCrossCompanyTransfer(m,source,previous.fact,hash,lock,signer,depth+1)).publicProof.proofSha256;
  }
  const ledger=await m.query(`SELECT id::text,batch_no,company_code,warehouse_code,change_type,qty_change::text,ref_no,sku_code,unit
    FROM inv_ledger WHERE ref_no=$1 AND batch_no=ANY($2::text[]) AND change_type IN ('TRANSFER_IN','TRANSFER_OUT') ORDER BY id`,
    [header.transfer_no,[source.batch_no,target.batch_no]]);
  const outgoing=ledger.filter((l:Fact)=>l.batch_no===source.batch_no&&l.change_type==='TRANSFER_OUT'&&Number(l.qty_change)<0
    &&l.company_code===source.company_code&&l.warehouse_code===source.warehouse_code&&l.sku_code===source.sku_code&&l.unit===source.unit);
  const incoming=ledger.filter((l:Fact)=>l.batch_no===target.batch_no&&l.change_type==='TRANSFER_IN'&&Number(l.qty_change)===qty
    &&l.company_code===target.company_code&&l.warehouse_code===target.warehouse_code&&l.sku_code===target.sku_code&&l.unit===target.unit);
  const [dispatched]=await m.query(`SELECT COUNT(*)::int AS lines,SUM(expected_qty)::text AS quantity
    FROM wms_transfer_items WHERE transfer_no=$1 AND source_batch_no=$2`,[header.transfer_no,source.batch_no]);
  if(outgoing.length!==dispatched.lines||incoming.length!==1||-outgoing.reduce((n:number,l:Fact)=>n+Number(l.qty_change),0)!==Number(dispatched.quantity))return hold();
  const [targetFlow]=await m.query(`SELECT COALESCE(SUM(qty_change),0)::text AS balance,
    COALESCE(SUM(qty_change) FILTER(WHERE qty_change>0),0)::text AS admitted,
    COUNT(*) FILTER(WHERE qty_change<>0 AND (company_code IS DISTINCT FROM $2 OR warehouse_code IS DISTINCT FROM $3))::int AS invalid
    FROM inv_ledger WHERE batch_no=$1 AND change_type NOT IN ('RESERVED','RELEASED')`,[target.batch_no,target.company_code,target.warehouse_code]);
  if(targetFlow.invalid||Number(targetFlow.admitted)!==qty||Number(targetFlow.balance)!==Number(target.qty))return hold();
  const rootFacts:Fact[]=[];
  for(const root of [...new Set(rootNos)].sort()){
    if(lock){const [row]=await m.query("SELECT pg_try_advisory_xact_lock_shared(hashtext('phoenix:inventory-root-state'),hashtext($1)) AS locked",[root]);if(!row.locked)return hold();}
    const [q]=await m.query('SELECT * FROM production_batch_qualifications WHERE batch_no=$1'+(lock?' FOR SHARE':''),[root]);
    if(!q||q.origin_kind==='DERIVED'||q.disposition!=='QUALIFIED'||q.product_code!==local.product_code)return hold();
    const [state]=await m.query('SELECT state,version FROM production_source_state_events WHERE root_batch_no=$1 ORDER BY version DESC LIMIT 1',[root]);
    const [valid]=await m.query('SELECT official_inventory_source_allowed($1,true) AS allowed',[root]);if(valid.allowed!==true)return hold();
    let originalQuantity:number,origin:Fact;
    if(q.origin_kind==='PRODUCTION'){
      const original=await m.query(`SELECT d.id,d.document_no,d.state,d.content_hash,d.company_code AS document_company,d.scope_id,l.line_no,l.quantity,l.inventory_ledger_id,
          l.sku_code,l.product_code,ledger.qty_change::text,ledger.company_code,ledger.ref_no,
          (SELECT COALESCE(SUM(a.quantity),0) FROM production_inbound_allocations a WHERE a.document_id=d.id AND a.line_no=l.line_no AND a.direction=1)::text AS allocated,
          (SELECT COALESCE(SUM(r.quantity),0) FROM production_inbound_allocations r JOIN production_inbound_allocations a ON a.id=r.original_allocation_id
            JOIN production_inbound_documents rd ON rd.id=r.document_id AND rd.state='POSTED'
            WHERE a.document_id=d.id AND a.line_no=l.line_no AND r.direction=-1)::text AS reversed
        FROM production_inbound_lines l JOIN production_inbound_documents d ON d.id=l.document_id AND d.kind='INBOUND' AND d.state='POSTED'
        JOIN inv_ledger ledger ON ledger.id=l.inventory_ledger_id WHERE l.batch_no=$1`,[root]);
      if(original.length!==1)return hold();origin=original[0];originalQuantity=amount(origin.quantity)-amount(origin.reversed);
      if(!originalQuantity||origin.content_hash!==q.evidence_sha256||q.origin_ref!==`${origin.document_no}:${origin.line_no}`
        ||origin.document_no!==q.source_no||origin.sku_code!==q.sku_code||origin.product_code!==q.product_code
        ||origin.document_company!==q.company_code||origin.scope_id!==q.scope_id
        ||Number(origin.qty_change)!==Number(origin.quantity)||Number(origin.allocated)!==Number(origin.quantity)
        ||origin.company_code!==q.company_code||origin.ref_no!==q.source_no)return hold();
      if(lock)await m.query('SELECT id FROM production_cutover_scopes WHERE id=$1 FOR SHARE',[q.scope_id]);
    }else if(q.origin_kind==='PURCHASE'){
      const [receipt]=await m.query(`SELECT r.id,r.receipt_no,r.status,r.company_code,r.warehouse_code,i.id AS item_id,i.item_code,i.actual_qty::text,i.unit
        FROM prc2_receipts r JOIN prc2_receipt_items i ON i.receipt_id=r.id WHERE r.id=$1 AND i.id=$2`+(lock?' FOR SHARE OF r,i':''),[q.receipt_id,q.receipt_item_id]);
      if(!receipt)return hold();origin=receipt;originalQuantity=amount(q.source_quantity);
    }else if(q.origin_kind==='OPENING'){
      const [opening]=await m.query(`SELECT receipt.id,manifest.id AS manifest_id,manifest.state,manifest.content_hash,claim.domain_id
        FROM production_opening_domain_claims claim JOIN production_opening_receipts receipt ON receipt.id=claim.opening_receipt_id
        JOIN production_cutover_manifests manifest ON manifest.id=claim.manifest_id
        WHERE claim.domain_id=$1 AND claim.manifest_id=$2 AND manifest.state='APPLIED'`,[q.inventory_domain_id,q.opening_manifest_id]);
      if(!opening)return hold();origin=opening;originalQuantity=amount(q.source_quantity);
    }else return hold();
    // Validate only the original root's own ledger. A mixed-root return in the sender's remaining stock is not attributable in full to each root.
    const [balance]=await m.query(`SELECT b.qty::text AS quantity,COALESCE(SUM(l.qty_change),0)::text AS balance,
      COALESCE(SUM(l.qty_change) FILTER(WHERE l.qty_change>0),0)::text AS admitted
      FROM inv_batches b LEFT JOIN inv_ledger l ON l.batch_no=b.batch_no AND l.change_type NOT IN ('RESERVED','RELEASED')
      WHERE b.batch_no=$1 GROUP BY b.batch_no,b.qty`,[root]);
    const admitted=q.origin_kind==='PRODUCTION'?Number(origin.quantity):originalQuantity;
    if(!balance||Number(balance.balance)!==Number(balance.quantity)||Number(balance.admitted)!==admitted)return hold();
    const [fresh]=await m.query('SELECT official_inventory_source_allowed($1,true) AS allowed',[root]);if(fresh.allowed!==true)return hold();
    rootFacts.push({qualification:q,state:state??null,origin});
  }
  const privateFacts={version:1,line:{id:String(line.id),transferNo:header.transfer_no,source:source.batch_no,target:target.batch_no,quantity:qty,
      fromWarehouse:header.from_warehouse,toWarehouse:header.to_warehouse,status:header.status},ledger,qualifications,roots:rootFacts,parentProofSha256};
  const proofSha256=createHmac('sha256',secret).update('phoenix:cutover-transfer-proof:v1:'+hash(privateFacts)).digest('hex');
  const publicProof:CrossCompanyCutoverProof={version:1,direction:received?'RECEIVED':'DISPATCHED',batchNo:String(local.batch_no),
    transferNo:String(header.transfer_no),transferLineId:String(line.id),skuCode:String(local.sku_code),unit:'枚',quantity:qty,
    localLedgerIds:(received?incoming:outgoing).map((l:Fact)=>String(l.id)),keyId,proofSha256};
  return {publicProof,rootNos,foreignBatchNo:String(foreign.batch_no)};
}
