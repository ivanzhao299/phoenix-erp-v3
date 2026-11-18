import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: DDL-only trigger event declarations; no business rows are seeded or changed.
 * Expand only. No scope, archive decision, opening stock or qualification is seeded. */
export class OfficialInventoryCutover1794971000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD: READ COMMITTED required');
    await q.query(`
      CREATE TABLE IF NOT EXISTS production_cutover_scopes (
        id uuid PRIMARY KEY, company_code text NOT NULL, house_code text NOT NULL,
        version integer NOT NULL CHECK(version > 0), first_production_date date NOT NULL,
        business_timezone text NOT NULL DEFAULT 'Asia/Singapore'
          CHECK(business_timezone='Asia/Singapore'),
        state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','FENCED','ACTIVE','SUSPENDED')),
        warehouse_code text NOT NULL, flock_id text NOT NULL, source_profile_code text NOT NULL,
        manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
        evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
        confirmed_by text NOT NULL, activated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(company_code,house_code,version),
        CHECK(state<>'ACTIVE' OR activated_at IS NOT NULL)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_cutover_current_house
        ON production_cutover_scopes(company_code,house_code) WHERE state<>'DRAFT';
      -- Exact company/warehouse/product boundaries; never quarantine a whole shared warehouse.
      CREATE TABLE IF NOT EXISTS production_inventory_domains (
        scope_id uuid NOT NULL REFERENCES production_cutover_scopes(id),
        company_code text NOT NULL, warehouse_code text NOT NULL, product_code text NOT NULL,
        PRIMARY KEY(scope_id,company_code,warehouse_code,product_code)
      );
      CREATE INDEX IF NOT EXISTS ix_production_inventory_domain
        ON production_inventory_domains(company_code,warehouse_code,product_code);
      -- Archive entries travel with the batch, including after a warehouse/status change.
      -- Deliberately no inv_batches FK: qualification is established BEFORE controlled creation.
      CREATE TABLE IF NOT EXISTS production_batch_qualifications (
        batch_no text PRIMARY KEY, scope_id uuid NOT NULL REFERENCES production_cutover_scopes(id),
        company_code text NOT NULL, product_code text NOT NULL, sku_code text NOT NULL,
        disposition text NOT NULL CHECK(disposition IN ('QUALIFIED','ARCHIVED_TEST','UNRESOLVED')),
        origin_kind text NOT NULL CHECK(origin_kind IN ('PRODUCTION','OPENING','PURCHASE','EXISTING_VERIFIED','DERIVED')),
        origin_ref text NOT NULL CHECK(length(btrim(origin_ref))>0),
        source_type text NOT NULL DEFAULT '',source_no text NOT NULL DEFAULT '',
        cost_status text NOT NULL DEFAULT 'UNKNOWN' CHECK(cost_status IN ('UNKNOWN','CONFIRMED')),
        evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
        created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      -- Flattened original roots: transformations do not erase an archived ancestor.
      CREATE TABLE IF NOT EXISTS production_batch_roots (
        batch_no text NOT NULL REFERENCES production_batch_qualifications(batch_no),
        root_batch_no text NOT NULL REFERENCES production_batch_qualifications(batch_no),
        PRIMARY KEY(batch_no,root_batch_no), CHECK(batch_no<>root_batch_no)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_root_source ON production_batch_qualifications(company_code,origin_kind,origin_ref)
        WHERE disposition='QUALIFIED' AND origin_kind<>'DERIVED';
      CREATE INDEX IF NOT EXISTS ix_production_batch_root_ancestor ON production_batch_roots(root_batch_no);
      CREATE OR REPLACE FUNCTION official_inventory_allows(
        p_batch text,p_company text,p_warehouse text,p_product text,p_sku text,p_material text
      ) RETURNS boolean LANGUAGE sql STABLE AS $body$
        SELECT CASE
          WHEN EXISTS(SELECT 1 FROM production_batch_qualifications q
            JOIN production_cutover_scopes s ON s.id=q.scope_id WHERE q.batch_no=p_batch AND s.state<>'DRAFT')
          THEN EXISTS (
            SELECT 1 FROM production_batch_qualifications q
              JOIN production_cutover_scopes s ON s.id=q.scope_id
             WHERE q.batch_no=p_batch AND q.disposition='QUALIFIED' AND s.state IN ('ACTIVE','SUSPENDED')
               AND q.company_code IS NOT DISTINCT FROM p_company
               AND q.product_code IS NOT DISTINCT FROM p_product
               AND q.sku_code IS NOT DISTINCT FROM p_sku AND p_material IS NULL
               AND (q.origin_kind<>'DERIVED' OR (
                 EXISTS(SELECT 1 FROM production_batch_roots r WHERE r.batch_no=q.batch_no)
                 AND NOT EXISTS(
                   SELECT 1 FROM production_batch_roots r
                   JOIN production_batch_qualifications root ON root.batch_no=r.root_batch_no
                   JOIN production_cutover_scopes rs ON rs.id=root.scope_id
                   WHERE r.batch_no=q.batch_no AND (root.disposition<>'QUALIFIED'
                     OR root.origin_kind='DERIVED' OR rs.state NOT IN ('ACTIVE','SUSPENDED'))
                 )
               ))
          )
          ELSE NOT EXISTS (
            SELECT 1 FROM production_inventory_domains d
              JOIN production_cutover_scopes s ON s.id=d.scope_id
             WHERE s.state<>'DRAFT' AND d.company_code=p_company
               AND d.warehouse_code=p_warehouse
               AND (d.product_code=p_product OR EXISTS(SELECT 1 FROM product_skus sku
                 WHERE sku.sku_code=p_sku AND sku.product_code=d.product_code))
          )
        END
      $body$;
      -- Read eligibility survives a suspension; operation admission does not.
      CREATE OR REPLACE FUNCTION official_inventory_writable(
        p_batch text,p_company text,p_warehouse text,p_product text,p_sku text,p_material text
      ) RETURNS boolean LANGUAGE plpgsql VOLATILE AS $body$
      DECLARE fully_reversed boolean := false;
      BEGIN
        IF to_regclass('production_inbound_lines') IS NOT NULL THEN
          EXECUTE 'SELECT EXISTS(SELECT 1 FROM production_inbound_lines l
            JOIN production_inbound_documents d ON d.id=l.document_id AND d.kind=''INBOUND'' AND d.state=''POSTED''
            WHERE l.batch_no=$1 AND l.quantity<=COALESCE((SELECT SUM(r.quantity) FROM production_inbound_allocations r
              JOIN production_inbound_allocations a ON a.id=r.original_allocation_id AND a.document_id=l.document_id AND a.line_no=l.line_no
              JOIN production_inbound_documents rd ON rd.id=r.document_id AND rd.state=''POSTED''
              WHERE r.direction=-1),0))' INTO fully_reversed USING p_batch;
        END IF;
        IF fully_reversed THEN RETURN false; END IF;
        RETURN official_inventory_allows(p_batch,p_company,p_warehouse,p_product,p_sku,p_material)
          AND NOT EXISTS(
            SELECT 1 FROM production_batch_qualifications q
            JOIN production_cutover_scopes s ON s.id=q.scope_id
            WHERE q.batch_no=p_batch AND s.state='SUSPENDED'
          ) AND NOT EXISTS(
            SELECT 1 FROM production_batch_roots r
            JOIN production_batch_qualifications q ON q.batch_no=r.root_batch_no
            JOIN production_cutover_scopes s ON s.id=q.scope_id
            WHERE r.batch_no=p_batch AND s.state='SUSPENDED'
          );
      END $body$;
      CREATE OR REPLACE FUNCTION guard_production_cutover_metadata() RETURNS trigger
        LANGUAGE plpgsql AS $body$
        DECLARE sid uuid; current_state text; target_batch text;
        BEGIN
          IF current_setting('transaction_isolation')<>'read committed' THEN
            RAISE EXCEPTION 'OFFICIAL_INVENTORY_ISOLATION_HOLD: inventory writes require READ COMMITTED' USING ERRCODE='23514';
          END IF;
          IF TG_TABLE_NAME='production_cutover_scopes' THEN
            IF OLD.state<>'DRAFT' AND (TG_OP='DELETE' OR
                (to_jsonb(OLD)-'state'-'activated_at') IS DISTINCT FROM (to_jsonb(NEW)-'state'-'activated_at')
                OR NOT ((OLD.state='FENCED' AND NEW.state='ACTIVE')
                  OR (OLD.state='ACTIVE' AND NEW.state='SUSPENDED')
                  OR (OLD.state='SUSPENDED' AND NEW.state='ACTIVE') OR OLD.state=NEW.state)) THEN
              RAISE EXCEPTION 'CUTOVER_MANIFEST_FROZEN' USING ERRCODE='23514';
            END IF;
          ELSE
            IF TG_TABLE_NAME='production_inventory_domains' THEN
              IF TG_OP='UPDATE' AND NEW.scope_id IS DISTINCT FROM OLD.scope_id THEN
                RAISE EXCEPTION 'CUTOVER_DOMAIN_SCOPE_IMMUTABLE: replace DRAFT membership using delete and insert under scope locks' USING ERRCODE='23514';
              END IF;
            END IF;
            IF TG_OP='DELETE' THEN sid:=(to_jsonb(OLD)->>'scope_id')::uuid;
            ELSE sid:=(to_jsonb(NEW)->>'scope_id')::uuid; END IF;
            IF TG_TABLE_NAME='production_batch_roots' THEN
              IF TG_OP='DELETE' THEN target_batch:=OLD.batch_no; ELSE target_batch:=NEW.batch_no; END IF;
              SELECT scope_id INTO sid FROM production_batch_qualifications WHERE batch_no=target_batch;
            END IF;
            SELECT state INTO current_state FROM production_cutover_scopes WHERE id=sid FOR SHARE;
            IF TG_TABLE_NAME='production_inventory_domains' THEN
              IF current_state<>'DRAFT' OR (TG_OP='UPDATE' AND EXISTS(
                SELECT 1 FROM production_cutover_scopes WHERE id=OLD.scope_id AND state<>'DRAFT'
              )) THEN RAISE EXCEPTION 'CUTOVER_DOMAIN_FROZEN' USING ERRCODE='23514'; END IF;
            END IF;
            IF TG_TABLE_NAME='production_batch_qualifications' AND TG_OP<>'INSERT' THEN
              RAISE EXCEPTION 'CUTOVER_QUALIFICATION_IMMUTABLE' USING ERRCODE='23514';
            END IF;
            IF TG_TABLE_NAME='production_batch_roots' AND (TG_OP<>'INSERT'
                OR (current_state<>'DRAFT' AND EXISTS(SELECT 1 FROM inv_batches WHERE batch_no=target_batch))) THEN
              RAISE EXCEPTION 'CUTOVER_LINEAGE_IMMUTABLE' USING ERRCODE='23514';
            END IF;
          END IF;
          IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
        END $body$;
      DROP TRIGGER IF EXISTS trg_cutover_scope_frozen ON production_cutover_scopes;
      CREATE TRIGGER trg_cutover_scope_frozen BEFORE UPDATE OR DELETE ON production_cutover_scopes
        FOR EACH ROW EXECUTE FUNCTION guard_production_cutover_metadata();
      DROP TRIGGER IF EXISTS trg_cutover_domain_frozen ON production_inventory_domains;
      CREATE TRIGGER trg_cutover_domain_frozen BEFORE INSERT OR UPDATE OR DELETE ON production_inventory_domains
        FOR EACH ROW EXECUTE FUNCTION guard_production_cutover_metadata();
      DROP TRIGGER IF EXISTS trg_cutover_qualification_immutable ON production_batch_qualifications;
      CREATE TRIGGER trg_cutover_qualification_immutable BEFORE INSERT OR UPDATE OR DELETE ON production_batch_qualifications
        FOR EACH ROW EXECUTE FUNCTION guard_production_cutover_metadata();
      DROP TRIGGER IF EXISTS trg_cutover_lineage_immutable ON production_batch_roots;
      CREATE TRIGGER trg_cutover_lineage_immutable BEFORE INSERT OR UPDATE OR DELETE ON production_batch_roots
        FOR EACH ROW EXECUTE FUNCTION guard_production_cutover_metadata();
      CREATE OR REPLACE FUNCTION guard_official_inventory_batch() RETURNS trigger
        LANGUAGE plpgsql AS $body$
        DECLARE b record;
        BEGIN
          IF current_setting('transaction_isolation')<>'read committed' THEN
            RAISE EXCEPTION 'OFFICIAL_INVENTORY_ISOLATION_HOLD: inventory writes require READ COMMITTED' USING ERRCODE='23514';
          END IF;
          -- Lock DRAFT scopes too: FENCE waits for an earlier writer to finish, and
          -- a later writer rechecks using the VOLATILE admission function's fresh snapshot.
          IF TG_OP='DELETE' THEN b:=OLD; ELSE b:=NEW; END IF;
          PERFORM 1 FROM production_cutover_scopes s
            WHERE s.company_code=b.company_code OR s.id IN (
              SELECT scope_id FROM production_batch_qualifications WHERE batch_no=b.batch_no
              UNION SELECT q.scope_id FROM production_batch_roots r
                JOIN production_batch_qualifications q ON q.batch_no=r.root_batch_no WHERE r.batch_no=b.batch_no
            ) ORDER BY s.id FOR SHARE;
          IF TG_OP IN ('UPDATE','DELETE') THEN
            IF NOT official_inventory_writable(OLD.batch_no,OLD.company_code,OLD.warehouse_code,
                OLD.product_code,OLD.sku_code,OLD.material_code) THEN
              RAISE EXCEPTION 'OFFICIAL_INVENTORY_SOURCE_REJECTED: %',OLD.batch_no USING ERRCODE='23514';
            END IF;
            IF EXISTS(SELECT 1 FROM production_batch_qualifications q
                JOIN production_cutover_scopes s ON s.id=q.scope_id
                WHERE q.batch_no=OLD.batch_no AND s.state<>'DRAFT') AND (
                TG_OP='DELETE' OR (to_jsonb(OLD)-'qty'-'qty_available'-'status'-'updated_at'-'unit_cost')
                  IS DISTINCT FROM (to_jsonb(NEW)-'qty'-'qty_available'-'status'-'updated_at'-'unit_cost')) THEN
              RAISE EXCEPTION 'OFFICIAL_INVENTORY_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
            END IF;
          END IF;
          IF TG_OP='DELETE' THEN RETURN OLD; END IF;
          IF NEW.source_type IN ('TEMP_PRODUCTION','PACKAGING','PRODUCTION')
            AND NOT EXISTS(SELECT 1 FROM production_batch_qualifications WHERE batch_no=NEW.batch_no)
            AND EXISTS(SELECT 1 FROM production_cutover_scopes s WHERE s.company_code=NEW.company_code AND s.state<>'DRAFT'
              AND (to_jsonb(NEW)->>'collection_batch_ref'='HOUSE-'||s.house_code OR EXISTS(
                SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(to_jsonb(NEW)->'source_profile_snapshot')='array'
                  THEN to_jsonb(NEW)->'source_profile_snapshot' ELSE '[]'::jsonb END) profile
                WHERE profile->>'houseCode'=s.house_code))) THEN
            RAISE EXCEPTION 'OFFICIAL_INVENTORY_SOURCE_REJECTED: activated house requires controlled source' USING ERRCODE='23514';
          END IF;
          IF EXISTS(SELECT 1 FROM production_batch_qualifications q JOIN production_cutover_scopes s ON s.id=q.scope_id
            WHERE q.batch_no=NEW.batch_no AND q.disposition='QUALIFIED' AND s.state<>'DRAFT'
              AND (q.source_type='' OR q.source_no='' OR q.source_type IS DISTINCT FROM NEW.source_type
                OR q.source_no IS DISTINCT FROM NEW.source_no)) THEN
            RAISE EXCEPTION 'OFFICIAL_INVENTORY_SOURCE_IDENTITY_MISMATCH: %',NEW.batch_no USING ERRCODE='23514';
          END IF;
          IF NOT official_inventory_writable(NEW.batch_no,NEW.company_code,NEW.warehouse_code,
              NEW.product_code,NEW.sku_code,NEW.material_code) THEN
            RAISE EXCEPTION 'OFFICIAL_INVENTORY_SOURCE_REJECTED: %',NEW.batch_no USING ERRCODE='23514';
          END IF;
          RETURN NEW;
        END $body$;
      CREATE OR REPLACE FUNCTION guard_official_inventory_ledger() RETURNS trigger
        LANGUAGE plpgsql AS $body$
        DECLARE b record;
        BEGIN
          IF current_setting('transaction_isolation')<>'read committed' THEN
            RAISE EXCEPTION 'OFFICIAL_INVENTORY_ISOLATION_HOLD: inventory writes require READ COMMITTED' USING ERRCODE='23514';
          END IF;
          SELECT * INTO b FROM inv_batches WHERE batch_no=NEW.batch_no;
          IF FOUND THEN
            PERFORM 1 FROM production_cutover_scopes s
              WHERE s.company_code=b.company_code OR s.id IN (
                SELECT scope_id FROM production_batch_qualifications WHERE batch_no=b.batch_no
                UNION SELECT q.scope_id FROM production_batch_roots r
                  JOIN production_batch_qualifications q ON q.batch_no=r.root_batch_no WHERE r.batch_no=b.batch_no
              ) ORDER BY s.id FOR SHARE;
            IF NOT official_inventory_writable(b.batch_no,b.company_code,b.warehouse_code,
                b.product_code,b.sku_code,b.material_code) THEN
              RAISE EXCEPTION 'OFFICIAL_INVENTORY_SOURCE_REJECTED: %',b.batch_no USING ERRCODE='23514';
            END IF;
          END IF;
          RETURN NEW;
        END $body$;
    `);
    if (await q.hasTable('inv_batches')) {
      await q.query(`DROP TRIGGER IF EXISTS trg_official_inventory_batch ON inv_batches;
        CREATE TRIGGER trg_official_inventory_batch BEFORE INSERT OR UPDATE OR DELETE ON inv_batches
          FOR EACH ROW EXECUTE FUNCTION guard_official_inventory_batch()`);
    }
    if (await q.hasTable('inv_ledger')) {
      await q.query(`DROP TRIGGER IF EXISTS trg_official_inventory_ledger ON inv_ledger;
        CREATE TRIGGER trg_official_inventory_ledger BEFORE INSERT ON inv_ledger
          FOR EACH ROW EXECUTE FUNCTION guard_official_inventory_ledger()`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD: READ COMMITTED required');
    const ownTransaction = !q.isTransactionActive;
    if (ownTransaction) await q.startTransaction();
    try {
      // Exclude scope writers before the emptiness check, including an activation in flight.
      await q.query('LOCK TABLE production_cutover_scopes,production_inventory_domains,production_batch_qualifications,production_batch_roots IN ACCESS EXCLUSIVE MODE');
    // Never erase an archive boundary or an already-issued source fact during rollback.
    const used = await q.query(`SELECT 1 FROM production_cutover_scopes LIMIT 1`);
    if (used.length) throw new Error('OFFICIAL_INVENTORY_ROLLBACK_BLOCKED: cutover evidence exists');
    if (await q.hasTable('inv_batches')) await q.query('DROP TRIGGER IF EXISTS trg_official_inventory_batch ON inv_batches');
    if (await q.hasTable('inv_ledger')) await q.query('DROP TRIGGER IF EXISTS trg_official_inventory_ledger ON inv_ledger');
    await q.query(`DROP FUNCTION IF EXISTS guard_official_inventory_batch();
      DROP FUNCTION IF EXISTS guard_official_inventory_ledger();
      DROP TRIGGER IF EXISTS trg_cutover_scope_frozen ON production_cutover_scopes;
      DROP TRIGGER IF EXISTS trg_cutover_domain_frozen ON production_inventory_domains;
      DROP TRIGGER IF EXISTS trg_cutover_qualification_immutable ON production_batch_qualifications;
      DROP TRIGGER IF EXISTS trg_cutover_lineage_immutable ON production_batch_roots;
      DROP FUNCTION IF EXISTS guard_production_cutover_metadata();
      DROP FUNCTION IF EXISTS official_inventory_writable(text,text,text,text,text,text);
      DROP FUNCTION IF EXISTS official_inventory_allows(text,text,text,text,text,text);
      DROP TABLE IF EXISTS production_batch_roots;
      DROP TABLE IF EXISTS production_batch_qualifications;
      DROP TABLE IF EXISTS production_inventory_domains;
      DROP TABLE IF EXISTS production_cutover_scopes`);
      if (ownTransaction) await q.commitTransaction();
    } catch (error) {
      if (ownTransaction) await q.rollbackTransaction();
      throw error;
    }
  }
}
