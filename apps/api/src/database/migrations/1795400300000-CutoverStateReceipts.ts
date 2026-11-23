import { MigrationInterface, QueryRunner } from 'typeorm';

export class CutoverStateReceipts1795400300000 implements MigrationInterface {
  async up(q:QueryRunner):Promise<void>{
    const [{name}]=await q.query('SELECT current_schema() AS name');
    const schema='"'+String(name).replace(/"/g,'""')+'"';
    await q.query(`CREATE TABLE production_cutover_state_receipts(
      intent_key uuid PRIMARY KEY, manifest_id uuid NOT NULL REFERENCES production_cutover_manifests(id),
      request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),receipt jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CHECK((jsonb_typeof(receipt)='object' AND receipt ?& ARRAY['manifestId','intentKey','state','actor','boundaryHash','domains','scopes','reason','evidenceFileId']
        AND jsonb_typeof(receipt->'actor')='string' AND jsonb_typeof(receipt->'reason')='string'
        AND jsonb_typeof(receipt->'evidenceFileId')='string' AND jsonb_typeof(receipt->'boundaryHash')='string'
        AND jsonb_typeof(receipt->'domains')='array' AND jsonb_typeof(receipt->'scopes')='array'
        AND jsonb_typeof(receipt->'manifestId')='string' AND jsonb_typeof(receipt->'intentKey')='string'
        AND jsonb_typeof(receipt->'state')='string' AND receipt->>'state' IN ('ACTIVE','SUSPENDED') AND receipt->>'manifestId'=manifest_id::text AND receipt->>'intentKey'=intent_key::text) IS TRUE));
      CREATE VIEW production_cutover_state_origins WITH (security_barrier=true) AS
        SELECT m.id AS manifest_id, scope.id AS scope_id, domain.id AS domain_id, c.opening_receipt_id
          FROM ${schema}.production_cutover_apply_results r
          JOIN ${schema}.production_cutover_apply_admissions a ON a.id=r.admission_id AND a.consumed_xid IS NOT NULL
          JOIN ${schema}.production_cutover_manifests m ON m.id=a.manifest_id AND m.id=r.manifest_id AND m.state='APPLIED'
            AND m.content_hash=a.content_hash AND m.snapshot_sha256=a.snapshot_sha256 AND m.receipt=r.result
          CROSS JOIN LATERAL unnest(r.scope_ids) scope(id) CROSS JOIN LATERAL unnest(r.domain_ids) domain(id)
          JOIN ${schema}.production_opening_domain_claims c ON c.domain_id=domain.id
          JOIN ${schema}.production_cutover_apply_results initial ON initial.manifest_id=c.manifest_id AND initial.opening_receipt_id=c.opening_receipt_id
            AND domain.id=ANY(initial.domain_ids);
      REVOKE ALL ON production_cutover_state_origins FROM PUBLIC;
      CREATE FUNCTION reject_cutover_state_receipt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'CUTOVER_STATE_RECEIPT_IMMUTABLE'; END $$;
      CREATE TRIGGER trg_cutover_state_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON production_cutover_state_receipts
        FOR EACH STATEMENT EXECUTE FUNCTION reject_cutover_state_receipt_mutation();`);
    // Existing enrollments receive only the public origin projection. Later site enrollment must grant the same view.
    const apis=await q.query('SELECT unnest(api_roles)::text AS role FROM production_cutover_control_environments ORDER BY role');
    for(const {role} of apis){
      const quoted='"'+String(role).replace(/"/g,'""')+'"';
      await q.query('GRANT SELECT ON production_cutover_state_origins TO '+quoted);
      await q.query('GRANT SELECT, INSERT ON production_cutover_state_receipts TO '+quoted);
    }
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query('LOCK TABLE production_cutover_state_receipts IN ACCESS EXCLUSIVE MODE');
    if((await q.query('SELECT 1 FROM production_cutover_state_receipts LIMIT 1')).length)throw Error('CUTOVER_STATE_HISTORY_PRESENT');
    await q.query('DROP TABLE production_cutover_state_receipts; DROP FUNCTION reject_cutover_state_receipt_mutation(); DROP VIEW production_cutover_state_origins');
  }
}
