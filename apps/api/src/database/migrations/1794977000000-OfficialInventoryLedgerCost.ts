import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: INSERT/UPDATE/DELETE below declare DDL triggers; no existing ledger or business row is changed. */
export class OfficialInventoryLedgerCost1794977000000 implements MigrationInterface {
  async up(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query('LOCK TABLE inv_ledger IN SHARE ROW EXCLUSIVE MODE');
      await q.query(`CREATE FUNCTION official_inventory_cost_known(p_batch text) RETURNS boolean LANGUAGE sql STABLE AS $body$
        SELECT COALESCE((SELECT b.unit_cost IS NOT NULL AND NOT EXISTS(
          SELECT 1 FROM production_batch_qualifications q JOIN production_cutover_scopes s ON s.id=q.scope_id
          WHERE q.batch_no=b.batch_no AND q.disposition='QUALIFIED' AND q.cost_status='UNKNOWN'
            AND (s.state<>'DRAFT' OR to_jsonb(q)->>'receipt_item_id' IS NOT NULL OR to_jsonb(q)->>'opening_manifest_id' IS NOT NULL
              OR EXISTS(SELECT 1 FROM production_batch_roots roots JOIN production_batch_qualifications root ON root.batch_no=roots.root_batch_no
                JOIN production_cutover_scopes rs ON rs.id=root.scope_id WHERE roots.batch_no=q.batch_no
                  AND (rs.state<>'DRAFT' OR to_jsonb(root)->>'receipt_item_id' IS NOT NULL OR to_jsonb(root)->>'opening_manifest_id' IS NOT NULL))))
          FROM inv_batches b WHERE b.batch_no=p_batch),false)
      $body$;
      CREATE FUNCTION guard_official_inventory_ledger_cost() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        -- The existing ledger guard runs first and retains the actual operation/root locks.
        IF NEW.change_type='PRODUCTION_INBOUND_REVERSAL' THEN
            IF NOT EXISTS(SELECT 1 FROM production_inbound_documents d
              JOIN production_financial_clearances c ON c.id::text=d.approval_evidence->>'clearanceId'
              JOIN file_metadata f ON f.file_id=c.evidence_file_id AND f.checksum=c.evidence_checksum
              JOIN inv_batches b ON b.batch_no=NEW.batch_no
              WHERE d.document_no=NEW.ref_no AND d.kind='REVERSAL' AND d.state='APPROVED'
                AND d.company_code=NEW.company_code AND d.content_hash=c.content_hash AND c.document_id=d.id
                AND d.approved_hash=d.content_hash AND d.approval_evidence->>'contentHash'=d.content_hash
                AND c.signed_by<>d.created_by AND d.approved_by<>d.created_by AND c.period_status='OPEN'
                AND f.status='ACTIVE' AND f.deleted_at IS NULL AND f.visibility IN ('PROTECTED','PRIVATE')
                AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.costs) cost WHERE cost->>'batchNo'=NEW.batch_no
                  AND (cost->>'costStatus'='UNKNOWN' AND NEW.cost_change IS NULL OR cost->>'costStatus'='CONFIRMED'
                    AND COALESCE(cost->>'recordedUnitCostDecimal',cost->>'recordedUnitCost')::numeric=b.unit_cost
                    AND NEW.cost_change=NEW.qty_change*b.unit_cost))
                AND EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'items') item WHERE item->>'batchNo'=NEW.batch_no
                  AND (item->>'quantity')::numeric=-NEW.qty_change)) THEN
              RAISE EXCEPTION 'OFFICIAL_LEDGER_COST_CLEARANCE_HOLD' USING ERRCODE='23514';END IF;
        ELSIF NEW.cost_change IS NOT NULL AND EXISTS(SELECT 1 FROM production_batch_qualifications q WHERE q.batch_no=NEW.batch_no AND q.disposition='QUALIFIED')
          AND NOT official_inventory_cost_known(NEW.batch_no) THEN
          IF NOT(NEW.change_type IN ('RESERVED','RELEASED') AND NEW.cost_change=0) THEN
            -- Includes old/new ordinary physical types. Availability-only zero is a proven absence of cost movement.
            NEW.cost_change:=NULL;
          END IF;
        END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_official_inventory_ledger_cost BEFORE INSERT ON inv_ledger
        FOR EACH ROW EXECUTE FUNCTION guard_official_inventory_ledger_cost();
      CREATE UNIQUE INDEX uq_official_reversal_ledger_source ON inv_ledger(ref_no,batch_no)
        WHERE change_type='PRODUCTION_INBOUND_REVERSAL';
      CREATE FUNCTION check_official_reversal_ledger_line() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.change_type='PRODUCTION_INBOUND_REVERSAL' AND NOT EXISTS(
          SELECT 1 FROM production_inbound_lines l JOIN production_inbound_documents d ON d.id=l.document_id
          WHERE l.inventory_ledger_id=NEW.id AND l.batch_no=NEW.batch_no AND l.quantity=-NEW.qty_change
            AND l.warehouse_code=NEW.warehouse_code AND d.document_no=NEW.ref_no AND d.company_code=NEW.company_code
            AND d.kind='REVERSAL' AND d.state='POSTED') THEN
          RAISE EXCEPTION 'OFFICIAL_REVERSAL_LEDGER_LINE_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE CONSTRAINT TRIGGER trg_official_reversal_ledger_line AFTER INSERT ON inv_ledger
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_official_reversal_ledger_line();
      CREATE FUNCTION guard_official_inventory_ledger_history() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE b record;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_ISOLATION_HOLD: ledger maintenance requires READ COMMITTED' USING ERRCODE='23514';END IF;
        FOR b IN SELECT keys.history_batch_no,stock.* FROM
          (SELECT OLD.batch_no AS history_batch_no UNION SELECT NEW.batch_no WHERE TG_OP='UPDATE') keys
          LEFT JOIN inv_batches stock ON stock.batch_no=keys.history_batch_no WHERE keys.history_batch_no IS NOT NULL
          ORDER BY stock.company_code,stock.product_code,keys.history_batch_no LOOP
          IF b.batch_no IS NULL THEN
            IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:inventory-root-state'),hashtext(b.history_batch_no)) THEN
              RAISE EXCEPTION 'OFFICIAL_INVENTORY_ROOT_BUSY' USING ERRCODE='23514';END IF;
          ELSE
            PERFORM official_inventory_lock_operation(b.batch_no,b.company_code,b.warehouse_code,b.product_code,b.sku_code,b.material_code,to_jsonb(b));
          END IF;
        END LOOP;
        IF OLD.change_type='PRODUCTION_INBOUND_REVERSAL' OR (TG_OP='UPDATE' AND NEW.change_type='PRODUCTION_INBOUND_REVERSAL')
          OR EXISTS(SELECT 1 FROM production_batch_qualifications q WHERE q.batch_no=OLD.batch_no OR (TG_OP='UPDATE' AND q.batch_no=NEW.batch_no)) THEN
          RAISE EXCEPTION 'OFFICIAL_LEDGER_HISTORY_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_official_inventory_ledger_history BEFORE UPDATE OR DELETE ON inv_ledger
        FOR EACH ROW EXECUTE FUNCTION guard_official_inventory_ledger_history()`);
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
  async down(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query('LOCK TABLE inv_ledger IN ACCESS EXCLUSIVE MODE');
      await q.query('LOCK TABLE production_cutover_scopes,production_inventory_domain_states,production_batch_qualifications IN ACCESS EXCLUSIVE MODE NOWAIT');
      if((await q.query("SELECT 1 FROM production_batch_qualifications UNION ALL SELECT 1 FROM production_cutover_scopes WHERE state<>'DRAFT' UNION ALL SELECT 1 FROM production_inventory_domain_states WHERE state<>'DRAFT' LIMIT 1")).length)
        throw new Error('OFFICIAL_LEDGER_COST_DOWN_HOLD: qualified or archived facts require forward repair');
      await q.query(`DROP TRIGGER trg_official_inventory_ledger_history ON inv_ledger;DROP FUNCTION guard_official_inventory_ledger_history();
        DROP TRIGGER trg_official_reversal_ledger_line ON inv_ledger;DROP FUNCTION check_official_reversal_ledger_line();
        DROP INDEX uq_official_reversal_ledger_source;DROP TRIGGER trg_official_inventory_ledger_cost ON inv_ledger;
        DROP FUNCTION guard_official_inventory_ledger_cost();DROP FUNCTION official_inventory_cost_known(text)`);
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
}
