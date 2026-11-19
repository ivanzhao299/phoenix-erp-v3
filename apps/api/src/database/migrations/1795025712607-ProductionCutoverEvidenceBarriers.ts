import { MigrationInterface,QueryRunner } from 'typeorm';

/** @allow-data-dml: Trigger DDL only; no activation, counts, source facts or other business DML are seeded. */
export class ProductionCutoverEvidenceBarriers1795025712607 implements MigrationInterface {
  name='ProductionCutoverEvidenceBarriers1795025712607';
  async up(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query(`CREATE FUNCTION guard_cutover_evidence_read_barrier() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE company text;product text;resource text;keys text[];old_key text;new_key text;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_ISOLATION_HOLD: evidence control writes require READ COMMITTED' USING ERRCODE='23514';END IF;
        IF TG_TABLE_NAME='product_skus' THEN
          IF TG_OP<>'INSERT' THEN old_key:=OLD.product_code;END IF;
          IF TG_OP<>'DELETE' THEN new_key:=NEW.product_code;END IF;
          SELECT array_agg(DISTINCT value ORDER BY value) INTO keys FROM unnest(ARRAY[old_key,new_key]) value WHERE value IS NOT NULL;
          FOREACH resource IN ARRAY COALESCE(keys,'{}'::text[]) LOOP
            IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:product-sku-membership'),hashtext(resource)) THEN
              RAISE EXCEPTION 'OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY' USING ERRCODE='23514';END IF;
          END LOOP;
        ELSIF TG_TABLE_NAME IN('production_cutover_scopes','md_egg_source_profiles') THEN
          IF TG_OP<>'INSERT' THEN old_key:=OLD.house_code;END IF;
          IF TG_OP<>'DELETE' THEN new_key:=NEW.house_code;END IF;
          SELECT array_agg(DISTINCT value ORDER BY value) INTO keys FROM unnest(ARRAY[old_key,new_key]) value WHERE value IS NOT NULL;
          FOREACH resource IN ARRAY COALESCE(keys,'{}'::text[]) LOOP
            IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(resource)) THEN
              RAISE EXCEPTION 'OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY' USING ERRCODE='23514';END IF;
          END LOOP;
        ELSE
          IF TG_TABLE_NAME IN('production_inventory_domain_states','production_inventory_domains') THEN
            IF TG_OP<>'INSERT' THEN old_key:=OLD.company_code||':'||OLD.product_code;END IF;
            IF TG_OP<>'DELETE' THEN new_key:=NEW.company_code||':'||NEW.product_code;END IF;
          ELSIF TG_TABLE_NAME='production_inventory_domain_events' AND TG_OP='INSERT' THEN
            SELECT company_code,product_code INTO company,product FROM production_inventory_domain_states WHERE id=NEW.domain_id;
            new_key:=company||':'||product;
          ELSIF TG_TABLE_NAME='production_source_state_events' AND TG_OP='INSERT' THEN
            SELECT company_code,product_code INTO company,product FROM production_batch_qualifications WHERE batch_no=NEW.root_batch_no;
            new_key:=company||':'||product;
          END IF;
          SELECT array_agg(DISTINCT value ORDER BY value) INTO keys FROM unnest(ARRAY[old_key,new_key]) value WHERE value IS NOT NULL;
          FOREACH resource IN ARRAY COALESCE(keys,'{}'::text[]) LOOP
            IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:inventory-product'),hashtext(resource)) THEN
              RAISE EXCEPTION 'OFFICIAL_INVENTORY_CUTOVER_EVIDENCE_BUSY' USING ERRCODE='23514';END IF;
          END LOOP;
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END $body$`);
      for(const table of ['product_skus','production_cutover_scopes','md_egg_source_profiles','production_inventory_domains','production_inventory_domain_states','production_inventory_domain_events','production_source_state_events'])
        await q.query(`CREATE TRIGGER trg_cutover_evidence_barrier BEFORE INSERT OR UPDATE OR DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION guard_cutover_evidence_read_barrier()`);
      if(own)await q.commitTransaction();
    }catch(e){if(own)await q.rollbackTransaction();throw e;}
  }
  async down(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query(`LOCK TABLE production_cutover_manifests,production_inventory_domains,production_inventory_domain_states,
        production_inventory_domain_events,production_source_state_events,production_cutover_scopes,md_egg_source_profiles,product_skus IN SHARE ROW EXCLUSIVE MODE NOWAIT`);
      if((await q.query("SELECT 1 FROM production_cutover_manifests WHERE snapshot IS NOT NULL AND snapshot->>'version' IS DISTINCT FROM '1' LIMIT 1")).length)
        throw new Error('CUTOVER_V2_SNAPSHOT_FACTS_HOLD');
      for(const table of ['product_skus','production_cutover_scopes','md_egg_source_profiles','production_inventory_domains','production_inventory_domain_states','production_inventory_domain_events','production_source_state_events'])
        await q.query(`DROP TRIGGER trg_cutover_evidence_barrier ON ${table}`);
      await q.query('DROP FUNCTION guard_cutover_evidence_read_barrier()');
      if(own)await q.commitTransaction();
    }catch(e){if(own)await q.rollbackTransaction();throw e;}
  }
}
