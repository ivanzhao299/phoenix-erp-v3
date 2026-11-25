import { QueryRunner } from 'typeorm';
import { applyApprovedProductionCutover } from './production-cutover-executor';

export interface HostPermit {
  admissionId:string; manifestId:string; manifestVersion:number; contentHash:string; snapshotSha256:string;
  mode:'INIT'|'ATTACH'; sourceSha:string; fenceOwner:string; fenceGeneration:number; environmentId:string;
  environmentGeneration:number; operatorId:string; authoritySha256:string; deploymentEvidenceSha256:string;
}

async function matchingPermit(q:QueryRunner,p:HostPermit){
  const [row]=await q.query(`SELECT a.admission_digest,a.consumed_xid::text
    FROM production_cutover_apply_admissions a JOIN production_cutover_control_environments e
      ON e.environment_id=a.environment_id AND e.generation=a.environment_generation
    WHERE a.id=$1 AND a.manifest_id=$2 AND a.manifest_version=$3 AND a.content_hash=$4 AND a.snapshot_sha256=$5
      AND a.mode=$6 AND a.source_sha=$7 AND a.fence_owner=$8 AND a.fence_generation=$9 AND a.environment_id=$10
      AND a.environment_generation=$11 AND a.operator_id=$12 AND a.authority_sha256=$13 AND e.deployment_evidence_sha256=$14
      AND e.database_name=current_database() AND e.database_oid=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND e.schema_oid=current_schema()::regnamespace AND e.executor_role=session_user AND current_user=session_user
      AND e.executor_role_oid=session_user::regrole AND NOT pg_is_in_recovery()`,
    [p.admissionId,p.manifestId,p.manifestVersion,p.contentHash,p.snapshotSha256,p.mode,p.sourceSha,p.fenceOwner,p.fenceGeneration,
      p.environmentId,p.environmentGeneration,p.operatorId,p.authoritySha256,p.deploymentEvidenceSha256]);
  return row as {admission_digest:string;consumed_xid:string|null}|undefined;
}

export async function recoverCutoverOutcome(q:QueryRunner,p:HostPermit){
  if(q.isTransactionActive)throw Error('CUTOVER_FRESH_READER_REQUIRED');
  await q.startTransaction('REPEATABLE READ');
  try{
    await q.query('SET TRANSACTION READ ONLY');
    const permit=await matchingPermit(q,p);
    if(!permit?.consumed_xid)return {status:'UNPROVEN' as const};
    const [row]=await q.query(`SELECT r.result FROM production_cutover_apply_results r
      JOIN production_cutover_manifests d ON d.id=r.manifest_id
      WHERE r.admission_id=$1 AND r.manifest_id=$2 AND r.mode=$3 AND d.state='APPLIED'
        AND d.version=$4::int+1 AND d.content_hash=$5 AND d.snapshot_sha256=$6 AND d.receipt=r.result
        AND cardinality(r.scope_ids)>0 AND cardinality(r.domain_ids)>0
        AND NOT EXISTS(SELECT 1 FROM unnest(r.scope_ids) scope(id) WHERE NOT EXISTS(
          SELECT 1 FROM production_cutover_scopes s WHERE s.id=scope.id AND s.state IN ('ACTIVE','SUSPENDED') AND (
            NOT (d.payload ? 'extension') AND s.manifest_sha256=d.content_hash AND s.evidence->>'manifestId'=d.id::text
            OR s.id::text=d.payload->'extension'->>'scopeId' AND s.manifest_sha256=d.payload->'extension'->>'scopeManifestSha256'
              AND EXISTS (SELECT 1 FROM production_inventory_domains membership
                WHERE membership.scope_id=s.id AND membership.inventory_domain_id=ANY(r.domain_ids)
                  AND membership.company_code=s.company_code AND membership.warehouse_code=s.warehouse_code
                  AND membership.product_code=d.boundary->'productCodes'->>0))))
        AND NOT EXISTS(SELECT 1 FROM unnest(r.domain_ids) domain(id) WHERE NOT EXISTS(
          SELECT 1 FROM production_opening_domain_claims c JOIN production_opening_receipts o ON o.id=c.opening_receipt_id
          JOIN production_cutover_manifests initial ON initial.id=c.manifest_id AND initial.state='APPLIED'
          WHERE c.domain_id=domain.id AND o.cutover_manifest_id=initial.id AND o.evidence_sha256=initial.content_hash
            AND o.receipt=initial.receipt AND ((r.mode='INIT' AND o.id=r.opening_receipt_id AND initial.id=d.id)
              OR (r.mode='ATTACH' AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.result->'domains') v
                WHERE v->>'domainId'=domain.id::text AND v->>'openingReceiptId'=o.id::text)))))
        AND (r.mode='INIT' OR (r.opening_receipt_id IS NULL AND NOT EXISTS(SELECT 1 FROM production_opening_receipts WHERE cutover_manifest_id=d.id)))
        AND (SELECT count(*) FROM inv_ledger WHERE ref_no=d.document_no AND change_type='OPENING_INBOUND')=jsonb_array_length(d.payload->'openingLines')
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'openingLines') WITH ORDINALITY line(fact,n) WHERE NOT EXISTS(
          SELECT 1 FROM inv_ledger l JOIN production_batch_qualifications b ON b.batch_no=l.batch_no
          WHERE b.opening_manifest_id=d.id AND b.inventory_domain_id=ANY(r.domain_ids)
            AND l.batch_no='OPN-'||replace(d.id::text,'-','')||'-'||line.n::text AND l.ref_no=d.document_no
            AND l.change_type='OPENING_INBOUND' AND l.qty_change=(line.fact->>'quantity')::numeric
            AND l.sku_code=line.fact->>'skuCode' AND l.location_code=line.fact->>'locationCode' AND l.warehouse_code=d.warehouse_code
            AND l.company_code=d.company_code AND l.cost_change IS NOT DISTINCT FROM
              CASE WHEN line.fact->>'costStatus'='CONFIRMED' THEN (line.fact->>'quantity')::numeric*(line.fact->>'unitCost')::numeric END))`,
      [p.admissionId,p.manifestId,p.mode,p.manifestVersion,p.contentHash,p.snapshotSha256]);
    return row?{status:'COMMITTED' as const,receipt:row.result}:{status:'UNPROVEN' as const};
  }finally{await q.rollbackTransaction();}
}

export async function executeBoundCutover(q:QueryRunner,p:HostPermit,fence:()=>Promise<void>){
  if(q.isTransactionActive)throw Error('CUTOVER_IDLE_SESSION_REQUIRED');
  await fence();
  await q.startTransaction('READ COMMITTED');
  let committing=false;
  try{
    const permit=await matchingPermit(q,p);
    if(!permit||permit.consumed_xid)throw Error('CUTOVER_ORIGINAL_UNUSED_PERMIT_REQUIRED');
    const receipt=await applyApprovedProductionCutover(q,{admissionId:p.admissionId,admissionDigest:permit.admission_digest});
    await fence();committing=true;
    await q.commitTransaction();
    return {status:'COMMITTED' as const,receipt};
  }catch(error){
    // A failed COMMIT acknowledgement is ambiguous. Caller destroys the dedicated connection.
    if(committing)return {status:'UNPROVEN' as const};
    if(q.isTransactionActive)await q.rollbackTransaction();
    throw error;
  }
}
