#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This audit supplements the unchanged whole-database inventory audit. PASS here is never release admission.
export const formalInstallmentChecks={
  receipt:`SELECT d.id,d.document_no FROM production_inbound_documents d WHERE d.state='POSTED' AND (
    d.receipt IS NULL OR d.receipt->>'documentId' IS DISTINCT FROM d.id::text
    OR d.receipt->>'documentNo' IS DISTINCT FROM d.document_no OR d.receipt->>'contentHash' IS DISTINCT FROM d.content_hash
    OR d.receipt->>'submitKey' IS DISTINCT FROM d.submit_key OR d.receipt->>'postingDate' IS DISTINCT FROM d.expected_posting_date::text
    OR (d.receipt->>CASE WHEN d.kind='INBOUND' THEN 'totalInbound' ELSE 'totalReversed' END)::numeric
      IS DISTINCT FROM (SELECT SUM(l.quantity) FROM production_inbound_lines l WHERE l.document_id=d.id)
    OR jsonb_typeof(d.receipt->'batches') IS DISTINCT FROM 'array'
    OR jsonb_array_length(d.receipt->'batches') IS DISTINCT FROM (SELECT COUNT(*)::int FROM production_inbound_lines l WHERE l.document_id=d.id)
    OR NOT EXISTS(SELECT 1 FROM production_inbound_lines l WHERE l.document_id=d.id))`,
  lines:`SELECT d.id,d.document_no,l.line_no FROM production_inbound_documents d JOIN production_inbound_lines l ON l.document_id=d.id
    LEFT JOIN inv_ledger v ON v.id=l.inventory_ledger_id LEFT JOIN inv_batches b ON b.batch_no=l.batch_no
    WHERE d.state='POSTED' AND (v.id IS NULL OR b.batch_no IS NULL OR v.batch_no IS DISTINCT FROM l.batch_no
      OR v.qty_change IS DISTINCT FROM l.quantity*CASE WHEN d.kind='INBOUND' THEN 1 ELSE -1 END
      OR v.change_type IS DISTINCT FROM CASE WHEN d.kind='INBOUND' THEN 'TEMP_PRODUCTION_INBOUND' ELSE 'PRODUCTION_INBOUND_REVERSAL' END
      OR v.ref_no IS DISTINCT FROM d.document_no OR v.company_code IS DISTINCT FROM d.company_code
      OR v.sku_code IS DISTINCT FROM l.sku_code OR v.quality_grade IS DISTINCT FROM l.grade_code
      OR v.warehouse_code IS DISTINCT FROM l.warehouse_code OR v.location_code IS DISTINCT FROM l.location_code
      OR v.log_date IS DISTINCT FROM d.expected_posting_date
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.receipt->'batches') r WHERE r->>'lineNo'=l.line_no::text
        AND r->>'batchNo'=l.batch_no AND r->>'quantity'=l.quantity::text AND r->>'inventoryLedgerId'=v.id::text)
      OR (SELECT SUM(a.quantity) FROM production_inbound_allocations a WHERE a.document_id=d.id AND a.line_no=l.line_no) IS DISTINCT FROM l.quantity::bigint)`,
  sourceIdentity:`SELECT d.id,d.document_no,a.id AS allocation_id FROM production_inbound_documents d
    JOIN production_inbound_allocations a ON a.document_id=d.id JOIN production_inbound_lines l ON l.document_id=d.id AND l.line_no=a.line_no
    LEFT JOIN brd_daily_logs r ON r.id=a.daily_log_id LEFT JOIN brd_flock_occupancies o ON o.id=r.occupancy_id
    WHERE d.state='POSTED' AND (r.id IS NULL OR o.id IS NULL OR r.house_code IS DISTINCT FROM d.house_code
      OR r.log_date IS DISTINCT FROM d.production_date OR o.company_code IS DISTINCT FROM d.company_code
      OR o.house_code IS DISTINCT FROM d.house_code OR o.flock_no IS DISTINCT FROM r.flock_no
      OR a.direction IS DISTINCT FROM CASE WHEN d.kind='INBOUND' THEN 1 ELSE -1 END
      OR d.production_date<o.began_on OR o.ended_on IS NOT NULL AND d.production_date>=o.ended_on
      OR (d.kind='INBOUND' AND a.original_allocation_id IS NOT NULL)
      OR (d.kind='REVERSAL' AND a.original_allocation_id IS NULL))`,
  netGradeCapacity:`WITH net AS(SELECT d.company_code,d.house_code,d.production_date,a.daily_log_id,l.grade_code,SUM(a.quantity*a.direction) AS quantity
    FROM production_inbound_documents d JOIN production_inbound_allocations a ON a.document_id=d.id
    JOIN production_inbound_lines l ON l.document_id=d.id AND l.line_no=a.line_no WHERE d.state='POSTED'
    GROUP BY d.company_code,d.house_code,d.production_date,a.daily_log_id,l.grade_code)
    SELECT n.*,r.eggs_by_grade->n.grade_code AS reported FROM net n LEFT JOIN brd_daily_logs r ON r.id=n.daily_log_id
    WHERE quantity<0 OR r.id IS NULL OR jsonb_typeof(r.eggs_by_grade) IS DISTINCT FROM 'object'
      OR quantity>CASE WHEN jsonb_typeof(r.eggs_by_grade->n.grade_code)='number' THEN (r.eggs_by_grade->>n.grade_code)::numeric ELSE 0 END`,
  reversalSegments:`SELECT d.id,d.document_no,a.id AS allocation_id FROM production_inbound_documents d
    JOIN production_inbound_allocations a ON a.document_id=d.id
    LEFT JOIN production_inbound_allocations original ON original.id=a.original_allocation_id
    LEFT JOIN production_inbound_documents od ON od.id=original.document_id
    LEFT JOIN production_inbound_lines ol ON ol.document_id=original.document_id AND ol.line_no=original.line_no
    JOIN production_inbound_lines l ON l.document_id=d.id AND l.line_no=a.line_no
    WHERE d.state='POSTED' AND d.kind='REVERSAL' AND (original.id IS NULL OR od.state IS DISTINCT FROM 'POSTED'
      OR od.kind IS DISTINCT FROM 'INBOUND' OR d.original_document_id IS DISTINCT FROM od.id OR original.direction IS DISTINCT FROM 1
      OR l.batch_no IS DISTINCT FROM ol.batch_no OR l.sku_code IS DISTINCT FROM ol.sku_code OR l.grade_code IS DISTINCT FROM ol.grade_code
      OR a.daily_log_id IS DISTINCT FROM original.daily_log_id OR a.report_hash IS DISTINCT FROM original.report_hash
      OR a.source_link_id IS DISTINCT FROM original.source_link_id OR a.source_snapshot IS DISTINCT FROM original.source_snapshot
      OR (SELECT SUM(reversed.quantity) FROM production_inbound_allocations reversed JOIN production_inbound_documents rd
        ON rd.id=reversed.document_id AND rd.state='POSTED' WHERE reversed.original_allocation_id=original.id)>original.quantity)`,
  productionRoots:`SELECT d.id,d.document_no,l.line_no FROM production_inbound_documents d JOIN production_inbound_lines l ON l.document_id=d.id
    LEFT JOIN inv_batches b ON b.batch_no=l.batch_no LEFT JOIN production_batch_qualifications q ON q.batch_no=l.batch_no
    WHERE d.state='POSTED' AND d.kind='INBOUND' AND (q.batch_no IS NULL OR q.disposition IS DISTINCT FROM 'QUALIFIED'
      OR q.origin_kind IS DISTINCT FROM 'PRODUCTION' OR q.origin_ref IS DISTINCT FROM d.document_no||':'||l.line_no::text
      OR q.scope_id IS DISTINCT FROM d.scope_id OR q.company_code IS DISTINCT FROM d.company_code OR q.product_code IS DISTINCT FROM l.product_code
      OR q.sku_code IS DISTINCT FROM l.sku_code OR b.source_type IS DISTINCT FROM 'TEMP_PRODUCTION' OR b.source_no IS DISTINCT FROM d.document_no
      OR NOT official_inventory_allows(b.batch_no,b.company_code,b.warehouse_code,b.product_code,b.sku_code,b.material_code))`,
  sourceFacts:`SELECT d.id,d.document_no,a.id AS allocation_id FROM production_inbound_documents d
    JOIN production_inbound_allocations a ON a.document_id=d.id JOIN production_inbound_lines l ON l.document_id=d.id AND l.line_no=a.line_no
    LEFT JOIN inv_flock_source_links s ON s.id=a.source_link_id LEFT JOIN brd_egg_source_receipts r ON r.company_code=d.company_code AND r.source_key=a.source_key
    LEFT JOIN production_physical_handovers h ON h.id::text=a.source_snapshot->>'handoverId'
    LEFT JOIN file_metadata f ON f.file_id=a.source_snapshot->>'evidenceFileId'
    WHERE d.state='POSTED' AND d.kind='INBOUND' AND (s.id IS NULL OR r.source_key IS NULL OR s.batch_no IS DISTINCT FROM l.batch_no
      OR s.daily_log_id IS DISTINCT FROM a.daily_log_id OR s.allocated_output_qty IS DISTINCT FROM a.quantity OR s.precision IS DISTINCT FROM 'EXACT'
      OR r.daily_log_id IS DISTINCT FROM a.daily_log_id OR r.quantity IS DISTINCT FROM a.quantity OR r.house_code IS DISTINCT FROM d.house_code
      OR h.state IS DISTINCT FROM 'CONFIRMED' OR h.house_code IS DISTINCT FROM d.house_code OR h.company_code IS DISTINCT FROM d.company_code
      OR h.production_date IS DISTINCT FROM d.production_date OR h.content_hash IS DISTINCT FROM a.source_snapshot->>'handoverContentHash'
      OR h.created_by IS NOT DISTINCT FROM h.confirmed_by OR f.checksum IS DISTINCT FROM a.source_snapshot->>'evidenceChecksum'
      OR f.status IS DISTINCT FROM 'ACTIVE' OR f.deleted_at IS NOT NULL OR f.company_code IS DISTINCT FROM d.company_code OR f.owner_id IS DISTINCT FROM d.house_code)`,
  approvals:`SELECT d.id,d.document_no FROM production_inbound_documents d LEFT JOIN production_financial_clearances c
    ON c.id::text=d.approval_evidence->>'clearanceId' LEFT JOIN production_inbound_documents original ON original.id=d.original_document_id
    WHERE d.state='POSTED' AND d.kind='REVERSAL' AND (d.approved_by IS NULL OR d.approved_by=d.created_by
      OR d.approved_hash IS DISTINCT FROM d.content_hash OR c.id IS NULL OR c.document_id IS DISTINCT FROM d.id OR c.signed_by=d.created_by
      OR c.content_hash IS DISTINCT FROM d.content_hash OR c.original_content_hash IS DISTINCT FROM original.content_hash
      OR c.posting_date IS DISTINCT FROM d.expected_posting_date OR c.period_status IS DISTINCT FROM 'OPEN' OR c.period_versions='[]'::jsonb)`,
  inventoryLedgerBalance:`SELECT b.batch_no,b.qty,COALESCE(SUM(v.qty_change),0) AS ledger_quantity FROM inv_batches b
    JOIN production_inbound_lines l ON l.batch_no=b.batch_no JOIN production_inbound_documents d ON d.id=l.document_id AND d.state='POSTED' AND d.kind='INBOUND'
    LEFT JOIN inv_ledger v ON v.batch_no=b.batch_no AND v.change_type IS DISTINCT FROM 'RESERVED' AND v.change_type IS DISTINCT FROM 'RELEASED' GROUP BY b.batch_no,b.qty HAVING b.qty IS NULL OR b.qty<0 OR b.qty IS DISTINCT FROM COALESCE(SUM(v.qty_change),0)`,
  orphanReversalLedger:`SELECT v.id,v.batch_no,v.ref_no FROM inv_ledger v WHERE v.change_type='PRODUCTION_INBOUND_REVERSAL'
    AND NOT EXISTS(SELECT 1 FROM production_inbound_lines l JOIN production_inbound_documents d ON d.id=l.document_id
      WHERE l.inventory_ledger_id=v.id AND d.state='POSTED' AND d.kind='REVERSAL')`,
};

/** Caller supplies an already-connected client. All reads share one enforced read-only repeatable snapshot. */
export async function auditProductionInstallments(client,{schema}={}) {
  if(schema&&!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))throw new Error('Invalid schema identifier');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    if(schema)await client.query(`SET LOCAL search_path TO "${schema}"`);
    const {rows:[transaction]}=await client.query("SELECT current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,txid_current_snapshot()::text AS snapshot");
    const {rows:[relations]}=await client.query(`SELECT to_regclass('production_cutover_scopes') AS scopes,
      to_regclass('production_inbound_documents') AS documents,to_regclass('production_physical_handovers') AS handovers`);
    const installed=Object.values(relations).filter(Boolean).length;
    if(!installed){await client.query('COMMIT');return {transaction,schema:'ABSENT',scopeState:'OFF',integrityStatus:'NOT_APPLICABLE',releaseAdmission:false,checks:[]};}
    if(installed!==3)throw new Error('Incomplete formal installment schema');
    const {rows:scopes}=await client.query(`SELECT id,company_code,house_code,state,version,first_production_date::text,manifest_sha256
      FROM production_cutover_scopes ORDER BY company_code,house_code,version`);
    const checks=[];for(const [name,sql] of Object.entries(formalInstallmentChecks)) {
      const {rows:[result]}=await client.query(`WITH violations AS(${sql}) SELECT COUNT(*)::int AS count,
        COALESCE((SELECT jsonb_agg(sample) FROM (SELECT * FROM violations LIMIT 20) sample),'[]'::jsonb) AS samples FROM violations`);
      checks.push({name,status:result.count?'HOLD':'PASS',...result});
    }
    const {rows:[counts]}=await client.query(`SELECT (SELECT COUNT(*)::int FROM production_inbound_documents WHERE state='POSTED' AND kind='INBOUND') AS posted_inbound,
      (SELECT COUNT(*)::int FROM production_inbound_documents WHERE state='POSTED' AND kind='REVERSAL') AS posted_reversals`);
    await client.query('COMMIT');return {transaction,schema:'PRESENT',scopeState:scopes.length?'CONFIGURED':'OFF',scopes,counts,
      integrityStatus:checks.some(c=>c.status==='HOLD')?'HOLD':'PASS',releaseAdmission:false,checks};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

async function main() {
  const args=process.argv.slice(2);if(args.includes('--help')){console.log('Read-only formal installment audit; supplements the unchanged global audit and cannot admit a release.\nOptions: --database-url-env NAME --schema NAME');return;}
  let schema,urlName='DATABASE_URL';for(let i=0;i<args.length;i+=2){if(args[i]==='--database-url-env')urlName=args[i+1];else if(args[i]==='--schema')schema=args[i+1];else throw new Error('Unsupported argument');}
  if(!/^[A-Z][A-Z0-9_]*$/.test(urlName))throw new Error('Invalid environment variable name');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const require=createRequire(path.join(root,'apps/api/package.json'));const {Client}=require('pg');
  const connectionString=process.env[urlName];if(!connectionString)throw new Error('Explicit database URL environment required');
  const client=new Client({connectionString,options:'-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000'});
  try{await client.connect();const result=await auditProductionInstallments(client,{schema});console.log(JSON.stringify(result,null,2));if(result.integrityStatus==='HOLD')process.exitCode=2;}
  finally{await client.end();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{
  console.error(JSON.stringify({integrityStatus:'HOLD',error:'FORMAL_INSTALLMENT_AUDIT_FAILED',causeCode:/^[A-Z0-9_]{1,30}$/.test(error?.code??'')?error.code:'AUDIT_INPUT_OR_SCHEMA',releaseAdmission:false}));process.exitCode=2;
});
