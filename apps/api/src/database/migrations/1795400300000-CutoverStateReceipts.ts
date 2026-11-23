import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: DDL-only UPDATE/DELETE/TRUNCATE trigger declarations. The migration creates no business, authority or activation records. */
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
      REVOKE ALL ON production_cutover_state_origins,production_cutover_state_receipts FROM PUBLIC;
      CREATE FUNCTION require_cutover_state_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,${schema},pg_temp AS $body$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM production_cutover_state_receipts r
          JOIN production_cutover_manifests d ON d.id=r.manifest_id AND d.state='APPLIED'
          JOIN sys_user u ON u.user_id::text=r.receipt->>'actor' AND COALESCE(to_jsonb(u)->>'status','') IN ('1','ACTIVE')
          JOIN sys_user_role ur ON ur.user_id=u.user_id AND coalesce(ur.is_visible,true)
          JOIN sys_role role ON role.role_id=ur.role_id AND role.role_code='ROLE_PRODUCTION_PILOT_CONTROL' AND role.status='ACTIVE'
          JOIN file_metadata f ON f.file_id=r.receipt->>'evidenceFileId' AND f.checksum=r.receipt->>'evidenceChecksum'
            AND f.uploaded_by=u.username AND f.owner_type='WAREHOUSE' AND f.owner_id=d.warehouse_code AND f.company_code=d.company_code
            AND f.module_code='PRODUCTION_CUTOVER' AND f.status='ACTIVE' AND f.deleted_at IS NULL AND f.visibility IN('PROTECTED','PRIVATE')
          WHERE r.xmin::text::numeric=mod(pg_current_xact_id()::text::numeric,4294967296) AND r.receipt->>'state'=NEW.state
            AND d.company_code=NEW.company_code AND d.warehouse_code=NEW.warehouse_code
            AND CASE TG_TABLE_NAME WHEN 'production_cutover_scopes' THEN
              r.receipt->'scopes' ? NEW.id::text AND EXISTS(SELECT 1 FROM production_cutover_state_origins o WHERE o.scope_id=NEW.id)
            ELSE EXISTS(SELECT 1 FROM jsonb_array_elements(r.receipt->'domains') v
              JOIN production_inventory_domain_events e ON e.domain_id=NEW.id AND e.version=NEW.version AND e.intent_key=r.intent_key::text
                AND e.content_hash=r.request_hash AND e.state=NEW.state
              WHERE v->>'id'=NEW.id::text AND (v->>'version')::int=NEW.version) END)
          THEN RAISE EXCEPTION 'CUTOVER_STATE_OPERATION_RECEIPT_REQUIRED' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END $body$;
      CREATE CONSTRAINT TRIGGER trg_cutover_scope_operation_receipt AFTER UPDATE ON production_cutover_scopes DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW WHEN(OLD.state IN('ACTIVE','SUSPENDED') AND NEW.state IN('ACTIVE','SUSPENDED') AND OLD.state<>NEW.state)
        EXECUTE FUNCTION require_cutover_state_receipt();
      CREATE CONSTRAINT TRIGGER trg_cutover_domain_operation_receipt AFTER UPDATE ON production_inventory_domain_states DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW WHEN(OLD.state IN('ACTIVE','SUSPENDED') AND NEW.state IN('ACTIVE','SUSPENDED') AND OLD.state<>NEW.state)
        EXECUTE FUNCTION require_cutover_state_receipt();
      CREATE FUNCTION reject_cutover_state_receipt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'CUTOVER_STATE_RECEIPT_IMMUTABLE'; END $$;
      CREATE TRIGGER trg_cutover_state_receipt_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON production_cutover_state_receipts
        FOR EACH STATEMENT EXECUTE FUNCTION reject_cutover_state_receipt_mutation();`);
    // Existing enrollments receive only the public origin projection. Later site enrollment must grant the same view.
    const principals=await q.query(`WITH current_environment AS (
      SELECT * FROM production_cutover_control_environments ORDER BY generation DESC LIMIT 1
    ), enrolled AS (
      SELECT api.name,api.oid,true AS is_api FROM current_environment e
        CROSS JOIN LATERAL unnest(e.api_roles,e.api_role_oids) api(name,oid)
      UNION ALL SELECT issuer_role,issuer_role_oid,false FROM current_environment
      UNION ALL SELECT executor_role,executor_role_oid,false FROM current_environment
    )
    SELECT r.rolname AS role,b.is_api FROM enrolled b JOIN pg_roles r ON r.oid=b.oid AND r.rolname=b.name`);
    for(const {role,is_api} of principals){
      const quoted='"'+String(role).replace(/"/g,'""')+'"';
      await q.query('REVOKE ALL ON production_cutover_state_origins,production_cutover_state_receipts FROM '+quoted);
      if(is_api){
        await q.query('GRANT SELECT ON production_cutover_state_origins TO '+quoted);
        await q.query('GRANT SELECT, INSERT ON production_cutover_state_receipts TO '+quoted);
      }
    }
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query('LOCK TABLE production_cutover_state_receipts IN ACCESS EXCLUSIVE MODE');
    if((await q.query('SELECT 1 FROM production_cutover_state_receipts LIMIT 1')).length)throw Error('CUTOVER_STATE_HISTORY_PRESENT');
    await q.query('DROP TRIGGER trg_cutover_scope_operation_receipt ON production_cutover_scopes; DROP TRIGGER trg_cutover_domain_operation_receipt ON production_inventory_domain_states; DROP FUNCTION require_cutover_state_receipt()');
    await q.query('DROP TABLE production_cutover_state_receipts; DROP FUNCTION reject_cutover_state_receipt_mutation(); DROP VIEW production_cutover_state_origins');
  }
}
