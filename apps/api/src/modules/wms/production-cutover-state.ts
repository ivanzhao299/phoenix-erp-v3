import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { cutoverEvidenceHash } from './production-cutover-evidence';
import { CutoverStateDto } from './production-cutover.dto';

type Manifest = { id:string; state:string; company_code:string; warehouse_code:string };
export interface CutoverStateMember {
  scope_id:string; house_code:string; scope_state:string; manifest_id:string; manifest_hash:string;
  domain_id:string; product_code:string; domain_state:string; version:number; opening_receipt_id:string;
  edge_manifest_ids:string[]; scope_intent:string|null; prior_intent:string; prior_evidence:string; original:boolean;
}

// Every edge in the connected component participates, including houses attached by a later manifest.
export async function previewCutoverState(m:EntityManager, d:Manifest,houseCode?:string) {
  if(d.state!=='APPLIED')throw new ConflictException('CUTOVER_ORIGINAL_APPLY_REQUIRED');
  const rows:CutoverStateMember[]=await m.query(`WITH RECURSIVE edges AS (
    SELECT scope_id,inventory_domain_id AS domain_id FROM production_inventory_domains
  ), connected(id,kind) AS (
    SELECT origin.scope_id AS id,'scope'::text FROM production_cutover_state_origins origin WHERE origin.manifest_id::text=$1
    UNION
    SELECT id,'scope'::text FROM production_cutover_scopes WHERE evidence->>'manifestId'=$1
    UNION
    SELECT CASE WHEN c.kind='scope' THEN e.domain_id ELSE e.scope_id END,
      CASE WHEN c.kind='scope' THEN 'domain' ELSE 'scope' END FROM connected c
      JOIN edges e ON (c.kind='scope' AND c.id=e.scope_id) OR (c.kind='domain' AND c.id=e.domain_id)
  )
  SELECT s.id AS scope_id,s.house_code,s.state AS scope_state,doc.id AS manifest_id,s.manifest_sha256 AS manifest_hash,
    dom.id AS domain_id,dom.product_code,dom.state AS domain_state,dom.version,claim.opening_receipt_id,
    ARRAY(SELECT o.manifest_id::text FROM production_cutover_state_origins o WHERE o.scope_id=s.id AND o.domain_id=dom.id
      AND o.opening_receipt_id=claim.opening_receipt_id ORDER BY o.manifest_id) AS edge_manifest_ids,
    previous.intent_key AS scope_intent,event.intent_key AS prior_intent,event.evidence_file_id AS prior_evidence,
    (doc.state='APPLIED' AND doc.content_hash=s.manifest_sha256 AND doc.receipt IS NOT NULL
      AND s.company_code=$2 AND s.warehouse_code=$3 AND dom.company_code=$2 AND dom.warehouse_code=$3
      AND EXISTS(SELECT 1 FROM production_cutover_state_origins o
        JOIN production_cutover_manifests edge_manifest ON edge_manifest.id=o.manifest_id
        WHERE o.scope_id=s.id AND o.domain_id=dom.id AND o.opening_receipt_id=claim.opening_receipt_id
          AND (o.manifest_id=doc.id OR edge_manifest.payload->'extension'->>'scopeId'=s.id::text
            AND edge_manifest.payload->'extension'->>'scopeManifestSha256'=s.manifest_sha256))
      AND original.state='APPLIED' AND original.content_hash=claim.content_hash AND opening.cutover_manifest_id=original.id) AS original
  FROM connected c JOIN production_cutover_scopes s ON c.kind='scope' AND s.id=c.id
  JOIN edges e ON e.scope_id=s.id JOIN production_inventory_domain_states dom ON dom.id=e.domain_id
  LEFT JOIN production_cutover_manifests doc ON doc.id::text=s.evidence->>'manifestId'
  LEFT JOIN production_opening_domain_claims claim ON claim.domain_id=dom.id
  LEFT JOIN production_cutover_manifests original ON original.id=claim.manifest_id
  LEFT JOIN production_opening_receipts opening ON opening.id=claim.opening_receipt_id
  LEFT JOIN production_inventory_domain_events event ON event.domain_id=dom.id AND event.version=dom.version
  LEFT JOIN LATERAL (SELECT intent_key,receipt FROM production_cutover_state_receipts
    WHERE receipt->'scopes' ? s.id::text ORDER BY created_at DESC LIMIT 1) previous ON true
  WHERE ($4::text IS NULL OR (s.house_code=$4 AND (doc.id=$1::uuid OR EXISTS(SELECT 1 FROM production_cutover_state_origins edge
    WHERE edge.manifest_id=$1::uuid AND edge.scope_id=s.id AND edge.domain_id=dom.id))))
  ORDER BY s.id,dom.id`,[d.id,d.company_code,d.warehouse_code,houseCode??null]);
  if(!rows.length||rows.some(r=>!r.original||!r.prior_intent))throw new ConflictException('CUTOVER_ORIGINAL_APPLY_REQUIRED');
  return {boundaryHash:cutoverEvidenceHash(rows),members:rows};
}

export async function changeCutoverState(m:EntityManager,d:Manifest,body:CutoverStateDto,actor:string,
  proof:()=>Promise<{checksum:string}>) {
  if(!(await m.query('SELECT pg_try_advisory_xact_lock(17455,2) AS ok'))[0].ok)throw new ConflictException({code:'CUTOVER_CONTROL_BUSY',message:'CUTOVER_CONTROL_BUSY'});
  const requestHash=cutoverEvidenceHash({manifestId:d.id,actor,...body});
  const [prior]=await m.query('SELECT request_hash,receipt FROM production_cutover_state_receipts WHERE intent_key=$1',[body.intentKey]);
  if(prior){
    if(prior.request_hash!==requestHash)throw new ConflictException('CUTOVER_INTENT_REUSED');
    return prior.receipt;
  }
  const boundary=await previewCutoverState(m,d,body.houseCode);
  if(boundary.boundaryHash!==body.boundaryHash)throw new ConflictException('CUTOVER_BOUNDARY_CHANGED');
  const originalState=body.state==='ACTIVE'?'SUSPENDED':'ACTIVE';
  if(boundary.members.some(row=>row.scope_state!==originalState||row.domain_state!==(body.houseCode?'ACTIVE':originalState)))
    throw new ConflictException('CUTOVER_STATE_CHANGED');
  const file=await proof();
  if(body.state==='ACTIVE'){
    const [pause]=await m.query('SELECT receipt FROM production_cutover_state_receipts WHERE intent_key=$1',[body.pauseIntentKey]);
    if(!pause||pause.receipt.state!=='SUSPENDED'||pause.receipt.manifestId!==d.id
      ||pause.receipt.houseCode!==(body.houseCode??null)||pause.receipt.evidenceFileId===body.evidenceFileId||pause.receipt.evidenceChecksum===file.checksum
      ||boundary.members.some(row=>row.scope_intent!==body.pauseIntentKey||(!body.houseCode&&row.prior_intent!==body.pauseIntentKey)))
      throw new ConflictException('CUTOVER_ORIGINAL_PAUSE_AND_REPAIR_REQUIRED');
  }
  const scopes=[...new Set(boundary.members.map(row=>row.scope_id))].sort();
  const houses=[...new Set(boundary.members.map(row=>row.house_code))].sort();
  const domains=new Map(boundary.members.map(row=>[row.domain_id,row]));
  for(const house of houses){
    if(!(await m.query("SELECT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1)) AS ok",[house]))[0].ok)
      throw new ConflictException({code:'CUTOVER_HOUSE_BUSY',message:'CUTOVER_HOUSE_BUSY'});
  }
  for(const id of body.houseCode?[]:[...domains.keys()].sort()){
    const row=domains.get(id)!;
    await m.query(`INSERT INTO production_inventory_domain_events
      (id,domain_id,state,version,intent_key,content_hash,reason,signed_by,evidence_file_id,evidence_checksum)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[randomUUID(),id,body.state,row.version+1,body.intentKey,requestHash,body.reason,actor,body.evidenceFileId,file.checksum]);
    const changed=await m.query(`UPDATE production_inventory_domain_states SET state=$2,version=version+1
      WHERE id=$1 AND version=$3 AND state=$4 RETURNING id`,[id,body.state,row.version,originalState]);
    if(changed[1]!==1)throw new ConflictException('CUTOVER_STATE_CHANGED');
  }
  const changed=await m.query('UPDATE production_cutover_scopes SET state=$2 WHERE id=ANY($1::uuid[]) AND state=$3 RETURNING id',[scopes,body.state,originalState]);
  if(changed[1]!==scopes.length)throw new ConflictException('CUTOVER_STATE_CHANGED');
  const receipt={manifestId:d.id,houseCode:body.houseCode??null,intentKey:body.intentKey,state:body.state,actor,reason:body.reason,
    evidenceFileId:body.evidenceFileId,evidenceChecksum:file.checksum,pauseIntentKey:body.pauseIntentKey??null,
    boundaryHash:body.boundaryHash,houses,scopes,domains:[...domains.values()].map(row=>({id:row.domain_id,
      version:body.houseCode?row.version:row.version+1,productCode:row.product_code,openingReceiptId:row.opening_receipt_id}))};
  await m.query('INSERT INTO production_cutover_state_receipts(intent_key,manifest_id,request_hash,receipt) VALUES($1,$2,$3,$4)',[body.intentKey,d.id,requestHash,receipt]);
  return receipt;
}
