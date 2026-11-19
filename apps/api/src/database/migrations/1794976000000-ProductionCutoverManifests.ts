import { MigrationInterface, QueryRunner } from 'typeorm';
import { OfficialInventoryCutover1794971000000 } from './1794971000000-OfficialInventoryCutover';

/** @allow-data-dml: Immutable trigger DDL and owned sys_dict entries only; no business rows or activation are seeded. */
export class ProductionCutoverManifests1794976000000 implements MigrationInterface {
  async up(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD: READ COMMITTED required');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
    await q.query('LOCK TABLE production_cutover_scopes,production_batch_qualifications,production_inventory_domains IN ACCESS EXCLUSIVE MODE');
    await q.query(`
      CREATE TABLE production_inventory_domain_states (
        id uuid PRIMARY KEY,company_code text NOT NULL,warehouse_code text NOT NULL,product_code text NOT NULL,
        state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','FENCED','ACTIVE','SUSPENDED')),
        version integer NOT NULL DEFAULT 0 CHECK(version>=0),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(company_code,warehouse_code,product_code)
      );
      CREATE TABLE production_cutover_manifests (
        id uuid PRIMARY KEY,document_no text NOT NULL UNIQUE,company_code text NOT NULL,warehouse_code text NOT NULL,
        intent_key text NOT NULL,creation_hash text NOT NULL CHECK(creation_hash ~ '^[a-f0-9]{64}$'),
        state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','READY','APPROVED','APPLIED','CANCELLED')),
        version integer NOT NULL DEFAULT 0 CHECK(version>=0),boundary jsonb NOT NULL CHECK(jsonb_typeof(boundary)='object'),
        payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),snapshot jsonb,
        snapshot_sha256 text,content_hash text,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
        applied_at timestamptz,receipt jsonb,
        UNIQUE(company_code,intent_key),
        CHECK(state IN ('DRAFT','CANCELLED') OR (snapshot_sha256 IS NOT NULL AND snapshot_sha256 ~ '^[a-f0-9]{64}$'
          AND content_hash IS NOT NULL AND content_hash ~ '^[a-f0-9]{64}$' AND snapshot IS NOT NULL AND jsonb_typeof(snapshot)='object')),
        CHECK(state<>'APPLIED' OR (receipt IS NOT NULL AND applied_at IS NOT NULL))
      );
      CREATE TABLE production_cutover_signatures (
        id uuid PRIMARY KEY,manifest_id uuid NOT NULL REFERENCES production_cutover_manifests(id),
        signature_role text NOT NULL CHECK(signature_role IN ('BUSINESS','FINANCE')),content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
        snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),signed_by text NOT NULL,
        evidence_file_id text NOT NULL,evidence_checksum text NOT NULL CHECK(evidence_checksum ~ '^[a-f0-9]{64}$'),
        reason text NOT NULL CHECK(btrim(reason)<>''),signed_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(manifest_id,signature_role,content_hash)
      );
      CREATE TABLE production_inventory_domain_events (
        id uuid PRIMARY KEY,domain_id uuid NOT NULL REFERENCES production_inventory_domain_states(id),
        state text NOT NULL CHECK(state IN ('FENCED','ACTIVE','SUSPENDED')),version integer NOT NULL CHECK(version>0),
        manifest_id uuid REFERENCES production_cutover_manifests(id),intent_key text NOT NULL,
        content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),reason text NOT NULL CHECK(btrim(reason)<>''),
        signed_by text NOT NULL,evidence_file_id text NOT NULL,evidence_checksum text NOT NULL CHECK(evidence_checksum ~ '^[a-f0-9]{64}$'),
        created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(domain_id,version),UNIQUE(domain_id,intent_key)
      );
      CREATE TABLE production_opening_domain_claims (
        domain_id uuid PRIMARY KEY REFERENCES production_inventory_domain_states(id),
        manifest_id uuid NOT NULL REFERENCES production_cutover_manifests(id),
        opening_receipt_id uuid NOT NULL REFERENCES production_opening_receipts(id) DEFERRABLE INITIALLY DEFERRED,
        scope_id uuid NOT NULL REFERENCES production_cutover_scopes(id),
        content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
        claimed_by text NOT NULL,claimed_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE production_inventory_domains ADD COLUMN inventory_domain_id uuid REFERENCES production_inventory_domain_states(id);
      ALTER TABLE production_batch_qualifications
        ADD COLUMN inventory_domain_id uuid REFERENCES production_inventory_domain_states(id),
        ADD COLUMN receipt_id bigint,ADD COLUMN receipt_item_id bigint,ADD COLUMN source_warehouse_code text,
        ADD COLUMN source_quantity numeric,ADD COLUMN source_unit text,
        ADD COLUMN opening_manifest_id uuid REFERENCES production_cutover_manifests(id);
      CREATE TABLE production_source_state_events (
        id uuid PRIMARY KEY,root_batch_no text NOT NULL REFERENCES production_batch_qualifications(batch_no),
        company_code text NOT NULL,source_warehouse_code text NOT NULL,state text NOT NULL CHECK(state IN ('ACTIVE','SUSPENDED')),
        version integer NOT NULL CHECK(version>0),intent_key text NOT NULL,content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
        reason text NOT NULL CHECK(btrim(reason)<>''),signed_by text NOT NULL,evidence_file_id text NOT NULL,
        evidence_checksum text NOT NULL CHECK(evidence_checksum ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(root_batch_no,version),UNIQUE(root_batch_no,intent_key)
      );
    `);
    // Expand only. Preparation may record drafts and signatures; no runtime activation entry is registered.
    await this.installGuards(q);
    await this.installStateGuards(q);
    await this.installAdmission(q);
    await this.installOperationGuards(q);
    await this.dictionaries(q,true);
    if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }

  private async installGuards(q:QueryRunner):Promise<void>{
    await q.query(`CREATE FUNCTION guard_cutover_manifest_facts() RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE d record;
    BEGIN
      IF current_setting('transaction_isolation')<>'read committed' THEN
        RAISE EXCEPTION 'OFFICIAL_INVENTORY_ISOLATION_HOLD: controlled writes require READ COMMITTED' USING ERRCODE='23514';
      END IF;
      IF TG_TABLE_NAME='production_cutover_manifests' THEN
        IF TG_OP='INSERT' THEN
          IF NEW.state<>'DRAFT' OR NEW.version<>0 OR NEW.snapshot IS NOT NULL OR NEW.snapshot_sha256 IS NOT NULL
            OR NEW.content_hash IS NOT NULL OR NEW.applied_at IS NOT NULL OR NEW.receipt IS NOT NULL THEN
            RAISE EXCEPTION 'CUTOVER_MANIFEST_INITIAL_STATE_HOLD' USING ERRCODE='23514';END IF;
          RETURN NEW;
        END IF;
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CUTOVER_MANIFEST_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF (OLD.id,OLD.document_no,OLD.company_code,OLD.warehouse_code,OLD.intent_key,OLD.creation_hash,OLD.created_by,OLD.created_at) IS DISTINCT FROM
          (NEW.id,NEW.document_no,NEW.company_code,NEW.warehouse_code,NEW.intent_key,NEW.creation_hash,NEW.created_by,NEW.created_at)
          OR OLD.state IN ('APPLIED','CANCELLED') OR NEW.version<>OLD.version+1
          OR (OLD.state<>'DRAFT' AND (to_jsonb(OLD)-ARRAY['state','version','receipt','applied_at']) IS DISTINCT FROM
            (to_jsonb(NEW)-ARRAY['state','version','receipt','applied_at']))
          OR (OLD.state='DRAFT' AND NEW.state NOT IN ('DRAFT','READY','CANCELLED'))
          OR (OLD.state='READY' AND NEW.state NOT IN ('APPROVED','CANCELLED'))
          OR (OLD.state='APPROVED' AND NEW.state NOT IN ('APPLIED','CANCELLED')) THEN
          RAISE EXCEPTION 'CUTOVER_MANIFEST_IMMUTABLE' USING ERRCODE='23514';
        END IF;
        IF NEW.state IN ('APPROVED','APPLIED') AND
          (SELECT count(DISTINCT signature_role) FROM production_cutover_signatures WHERE manifest_id=NEW.id
            AND content_hash=NEW.content_hash AND snapshot_sha256=NEW.snapshot_sha256)<>2 THEN
          RAISE EXCEPTION 'CUTOVER_MANIFEST_SIGNATURES_REQUIRED' USING ERRCODE='23514';
        END IF;
      ELSIF TG_TABLE_NAME='production_cutover_signatures' THEN
        IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CUTOVER_SIGNATURE_IMMUTABLE' USING ERRCODE='23514';END IF;
        SELECT * INTO d FROM production_cutover_manifests WHERE id=NEW.manifest_id FOR SHARE;
        IF d.state<>'READY' OR NEW.signed_by=d.created_by OR NEW.content_hash IS DISTINCT FROM d.content_hash
          OR NEW.snapshot_sha256 IS DISTINCT FROM d.snapshot_sha256 THEN
          RAISE EXCEPTION 'CUTOVER_SIGNATURE_IDENTITY_HOLD' USING ERRCODE='23514';
        END IF;
        IF NOT EXISTS(SELECT 1 FROM file_metadata f JOIN sys_user u ON u.username=f.uploaded_by AND u.user_id::text=NEW.signed_by
          WHERE COALESCE(to_jsonb(u)->>'status','') IN ('1','ACTIVE') AND f.file_id=NEW.evidence_file_id AND f.checksum=NEW.evidence_checksum AND f.status='ACTIVE' AND f.deleted_at IS NULL
            AND f.visibility IN ('PROTECTED','PRIVATE') AND f.module_code='PRODUCTION_CUTOVER' AND f.owner_type='WAREHOUSE'
            AND f.owner_id=d.warehouse_code AND f.company_code=d.company_code) THEN
          RAISE EXCEPTION 'CUTOVER_SIGNATURE_EVIDENCE_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_OP<>'INSERT' THEN
        RAISE EXCEPTION 'CUTOVER_POSTED_FACT_IMMUTABLE' USING ERRCODE='23514';
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
    END $body$;
    CREATE TRIGGER trg_cutover_manifest_guard BEFORE INSERT OR UPDATE OR DELETE ON production_cutover_manifests
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_manifest_facts();
    CREATE TRIGGER trg_cutover_signature_guard BEFORE INSERT OR UPDATE OR DELETE ON production_cutover_signatures
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_manifest_facts();
    CREATE TRIGGER trg_cutover_opening_claim_guard BEFORE UPDATE OR DELETE ON production_opening_domain_claims
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_manifest_facts();
    CREATE TRIGGER trg_cutover_source_event_guard BEFORE UPDATE OR DELETE ON production_source_state_events
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_manifest_facts()`);
  }

  private async installStateGuards(q:QueryRunner):Promise<void>{
    await q.query(`CREATE FUNCTION guard_cutover_control_states() RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE owner record; manifest record; source record; actual_warehouse text; expected integer;
    BEGIN
      IF current_setting('transaction_isolation')<>'read committed' THEN
        RAISE EXCEPTION 'OFFICIAL_INVENTORY_ISOLATION_HOLD: controlled state writes require READ COMMITTED' USING ERRCODE='23514';
      END IF;
      IF TG_TABLE_NAME='production_inventory_domain_states' THEN
        IF TG_OP='INSERT' THEN
          IF NEW.state<>'DRAFT' OR NEW.version<>0 THEN RAISE EXCEPTION 'INVENTORY_DOMAIN_INITIAL_STATE_HOLD' USING ERRCODE='23514';END IF;
          RETURN NEW;
        END IF;
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'INVENTORY_DOMAIN_IDENTITY_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF (OLD.id,OLD.company_code,OLD.warehouse_code,OLD.product_code,OLD.created_by,OLD.created_at) IS DISTINCT FROM
          (NEW.id,NEW.company_code,NEW.warehouse_code,NEW.product_code,NEW.created_by,NEW.created_at)
          OR NEW.version<>OLD.version+1 OR NOT EXISTS(SELECT 1 FROM production_inventory_domain_events e
            WHERE e.domain_id=OLD.id AND e.version=NEW.version AND e.state=NEW.state) THEN
          RAISE EXCEPTION 'INVENTORY_DOMAIN_STATE_EVENT_REQUIRED' USING ERRCODE='23514';
        END IF;
      ELSIF TG_TABLE_NAME='production_inventory_domain_events' THEN
        IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'INVENTORY_DOMAIN_EVENT_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:inventory-domain-state'),hashtext(NEW.domain_id::text)) THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_DOMAIN_BUSY' USING ERRCODE='23514';END IF;
        SELECT * INTO owner FROM production_inventory_domain_states WHERE id=NEW.domain_id FOR SHARE;
        IF owner.id IS NOT NULL AND owner.state IN ('DRAFT','FENCED') AND NOT pg_try_advisory_xact_lock(hashtext('phoenix:inventory-product'),hashtext(owner.company_code||':'||owner.product_code)) THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_PRODUCT_BUSY' USING ERRCODE='23514';END IF;
        IF owner.id IS NULL OR NEW.version<>owner.version+1 OR NOT ((owner.state='DRAFT' AND NEW.state='FENCED')
          OR(owner.state='FENCED' AND NEW.state='ACTIVE') OR(owner.state='ACTIVE' AND NEW.state='SUSPENDED')
          OR(owner.state='SUSPENDED' AND NEW.state='ACTIVE')) THEN RAISE EXCEPTION 'INVENTORY_DOMAIN_TRANSITION_HOLD' USING ERRCODE='23514';END IF;
        IF owner.state IN ('DRAFT','FENCED') THEN
          SELECT * INTO manifest FROM production_cutover_manifests WHERE id=NEW.manifest_id FOR SHARE;
          IF manifest.id IS NULL OR manifest.state<>'APPROVED' OR manifest.company_code<>owner.company_code
            OR manifest.warehouse_code<>owner.warehouse_code OR NEW.content_hash IS DISTINCT FROM manifest.content_hash
            OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(manifest.boundary->'productCodes') p WHERE p=owner.product_code) THEN
            RAISE EXCEPTION 'INVENTORY_DOMAIN_APPROVED_MANIFEST_REQUIRED' USING ERRCODE='23514';END IF;
        END IF;
        IF NOT EXISTS(SELECT 1 FROM file_metadata f JOIN sys_user u ON u.username=f.uploaded_by AND u.user_id::text=NEW.signed_by
          WHERE COALESCE(to_jsonb(u)->>'status','') IN ('1','ACTIVE') AND f.file_id=NEW.evidence_file_id AND f.checksum=NEW.evidence_checksum AND f.status='ACTIVE' AND f.deleted_at IS NULL
          AND f.visibility IN ('PROTECTED','PRIVATE') AND f.module_code='PRODUCTION_CUTOVER' AND f.owner_type='WAREHOUSE'
          AND f.owner_id=owner.warehouse_code AND f.company_code=owner.company_code) THEN
          RAISE EXCEPTION 'INVENTORY_DOMAIN_EVIDENCE_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_source_state_events' THEN
        IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'CUTOVER_POSTED_FACT_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:inventory-root-state'),hashtext(NEW.root_batch_no)) THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_ROOT_BUSY' USING ERRCODE='23514';END IF;
        SELECT * INTO source FROM production_batch_qualifications WHERE batch_no=NEW.root_batch_no FOR SHARE;
        SELECT COALESCE(source.source_warehouse_code,b.warehouse_code) INTO actual_warehouse FROM inv_batches b WHERE b.batch_no=NEW.root_batch_no;
        SELECT COALESCE(MAX(version),0)+1 INTO expected FROM production_source_state_events WHERE root_batch_no=NEW.root_batch_no;
        IF source.batch_no IS NULL OR source.origin_kind='DERIVED' OR source.disposition<>'QUALIFIED'
          OR source.company_code IS DISTINCT FROM NEW.company_code OR actual_warehouse IS DISTINCT FROM NEW.source_warehouse_code
          OR NEW.version<>expected OR NOT official_inventory_source_allowed(NEW.root_batch_no,false) THEN
          RAISE EXCEPTION 'INVENTORY_SOURCE_CONTROL_IDENTITY_HOLD' USING ERRCODE='23514';END IF;
        IF NOT EXISTS(SELECT 1 FROM file_metadata f JOIN sys_user u ON u.username=f.uploaded_by AND u.user_id::text=NEW.signed_by
          WHERE COALESCE(to_jsonb(u)->>'status','') IN ('1','ACTIVE') AND f.file_id=NEW.evidence_file_id AND f.checksum=NEW.evidence_checksum AND f.status='ACTIVE' AND f.deleted_at IS NULL
          AND f.visibility IN ('PROTECTED','PRIVATE') AND f.module_code='INVENTORY_SOURCE_CONTROL' AND f.owner_type='BATCH'
          AND f.owner_id=source.batch_no AND f.company_code=source.company_code) THEN
          RAISE EXCEPTION 'INVENTORY_SOURCE_CONTROL_EVIDENCE_HOLD' USING ERRCODE='23514';END IF;
      ELSIF TG_TABLE_NAME='production_opening_domain_claims' THEN
        SELECT * INTO owner FROM production_inventory_domain_states WHERE id=NEW.domain_id FOR SHARE;
        SELECT * INTO manifest FROM production_cutover_manifests WHERE id=NEW.manifest_id FOR SHARE;
        SELECT * INTO source FROM production_cutover_scopes WHERE id=NEW.scope_id FOR SHARE;
        IF owner.id IS NULL OR manifest.id IS NULL OR source.id IS NULL OR manifest.state<>'APPROVED'
          OR owner.state NOT IN ('DRAFT','FENCED') OR owner.company_code<>manifest.company_code
          OR owner.warehouse_code<>manifest.warehouse_code OR source.company_code<>manifest.company_code
          OR NEW.content_hash IS DISTINCT FROM manifest.content_hash
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(manifest.boundary->'productCodes') p WHERE p=owner.product_code)
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest.boundary->'houses') h WHERE h->>'houseCode'=source.house_code) THEN
          RAISE EXCEPTION 'OPENING_DOMAIN_CLAIM_IDENTITY_HOLD' USING ERRCODE='23514';END IF;
      END IF;
      RETURN NEW;
    END $body$;
    CREATE TRIGGER trg_inventory_domain_state_guard BEFORE INSERT OR UPDATE OR DELETE ON production_inventory_domain_states
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_control_states();
    CREATE TRIGGER trg_inventory_domain_event_guard BEFORE INSERT OR UPDATE OR DELETE ON production_inventory_domain_events
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_control_states();
    CREATE TRIGGER trg_inventory_source_event_insert BEFORE INSERT ON production_source_state_events
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_control_states();
    CREATE TRIGGER trg_inventory_opening_claim_insert BEFORE INSERT ON production_opening_domain_claims
      FOR EACH ROW EXECUTE FUNCTION guard_cutover_control_states();
    CREATE FUNCTION guard_cutover_state_projection() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM production_inventory_domain_states d WHERE d.id=NEW.domain_id AND d.version>=NEW.version)
        OR EXISTS(SELECT 1 FROM production_inventory_domain_states d WHERE d.id=NEW.domain_id AND d.version=NEW.version AND d.state<>NEW.state) THEN
        RAISE EXCEPTION 'INVENTORY_DOMAIN_EVENT_PROJECTION_REQUIRED' USING ERRCODE='23514';END IF;
      IF NEW.state='ACTIVE' AND NEW.manifest_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM production_opening_domain_claims c JOIN production_opening_receipts r ON r.id=c.opening_receipt_id
          JOIN production_cutover_manifests m ON m.id=c.manifest_id WHERE c.domain_id=NEW.domain_id AND c.manifest_id=NEW.manifest_id
            AND m.state='APPLIED' AND c.content_hash=m.content_hash AND r.evidence_sha256=m.content_hash) THEN
        RAISE EXCEPTION 'INVENTORY_DOMAIN_OPENING_RECEIPT_REQUIRED' USING ERRCODE='23514';END IF;
      RETURN NEW;
    END $body$;
    CREATE CONSTRAINT TRIGGER trg_inventory_domain_event_projection AFTER INSERT ON production_inventory_domain_events
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_cutover_state_projection()`);
  }

  private async installAdmission(q:QueryRunner):Promise<void>{
    await q.query(`CREATE FUNCTION official_inventory_source_allowed(p_batch text,p_operation boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE AS $body$
    DECLARE source record; actual record; controller text; valid_receipt boolean:=false; domain uuid;
    BEGIN
      SELECT q.*,q.xmin::text::numeric=mod(pg_current_xact_id_if_assigned()::text::numeric,4294967296) AS inserted_here
        INTO source FROM production_batch_qualifications q WHERE batch_no=p_batch;
      IF NOT FOUND OR source.disposition<>'QUALIFIED' OR source.origin_kind='DERIVED' THEN RETURN false;END IF;
      IF NOT EXISTS(SELECT 1 FROM product_skus sku WHERE sku.sku_code=source.sku_code AND sku.product_code=source.product_code) THEN RETURN false;END IF;
      SELECT * INTO actual FROM inv_batches WHERE batch_no=p_batch;
      IF NOT FOUND THEN
        IF NOT COALESCE(source.inserted_here,false) THEN RETURN false;END IF;
      ELSIF actual.company_code IS DISTINCT FROM source.company_code OR actual.product_code IS DISTINCT FROM source.product_code
        OR actual.sku_code IS DISTINCT FROM source.sku_code OR actual.material_code IS NOT NULL OR actual.qty IS NULL OR actual.qty<0
        OR COALESCE(actual.source_type,'') IS DISTINCT FROM source.source_type OR COALESCE(actual.source_no,'') IS DISTINCT FROM source.source_no THEN
        RETURN false;
      END IF;
      IF p_operation AND EXISTS(SELECT 1 FROM production_source_state_events e WHERE e.root_batch_no=p_batch
        AND e.version=(SELECT MAX(version) FROM production_source_state_events WHERE root_batch_no=p_batch) AND e.state='SUSPENDED') THEN RETURN false;END IF;
      IF source.origin_kind='PRODUCTION' THEN
        SELECT state INTO controller FROM production_cutover_scopes WHERE id=source.scope_id;
        RETURN COALESCE(controller=ANY(CASE WHEN p_operation THEN ARRAY['ACTIVE'] ELSE ARRAY['ACTIVE','SUSPENDED'] END),false);
      ELSIF source.origin_kind='PURCHASE' THEN
        IF source.receipt_id IS NULL OR source.receipt_item_id IS NULL OR source.source_warehouse_code IS NULL
          OR source.source_quantity IS NULL OR source.source_unit IS NULL OR source.source_type<>'PURCHASE'
          OR to_regclass('prc2_receipts') IS NULL OR to_regclass('prc2_receipt_items') IS NULL THEN RETURN false;END IF;
        EXECUTE 'SELECT EXISTS(SELECT 1 FROM prc2_receipts r JOIN prc2_receipt_items i ON i.receipt_id=r.id
          WHERE r.id=$1 AND i.id=$2 AND r.status=''CONFIRMED'' AND r.company_code=$3 AND r.warehouse_code=$4
          AND r.receipt_no=$5 AND i.item_code=ANY($6::text[]) AND i.actual_qty=$7 AND i.unit=$8)'
          INTO valid_receipt USING source.receipt_id,source.receipt_item_id,source.company_code,source.source_warehouse_code,
            source.source_no,ARRAY[source.sku_code,source.product_code],source.source_quantity,source.source_unit;
        IF NOT valid_receipt OR source.origin_ref IS DISTINCT FROM source.source_no||':'||source.receipt_item_id::text THEN RETURN false;END IF;
        IF source.source_quantity<=0 OR NOT EXISTS(SELECT 1 FROM product_skus sku JOIN packaging_specs spec ON spec.spec_code=sku.spec_code
          LEFT JOIN mst_products p ON p.product_code=sku.product_code WHERE sku.sku_code=source.sku_code AND sku.product_code=source.product_code
          AND COALESCE(NULLIF(spec.base_unit,''),to_jsonb(p)->>'unit',to_jsonb(p)->>'unit_zh')=source.source_unit)
          OR source.source_unit='枚' AND source.source_quantity<>trunc(source.source_quantity) THEN RETURN false;END IF;
        SELECT * INTO actual FROM inv_batches WHERE batch_no=p_batch;
        IF NOT FOUND THEN RETURN COALESCE(source.inserted_here,false);END IF;
        RETURN actual.company_code IS NOT DISTINCT FROM source.company_code AND actual.warehouse_code IS NOT DISTINCT FROM source.source_warehouse_code
          AND actual.product_code IS NOT DISTINCT FROM source.product_code AND actual.sku_code IS NOT DISTINCT FROM source.sku_code
          AND actual.material_code IS NULL AND actual.unit IS NOT DISTINCT FROM source.source_unit
          AND actual.source_type IS NOT DISTINCT FROM source.source_type AND actual.source_no IS NOT DISTINCT FROM source.source_no
          AND actual.qty>=0 AND actual.qty<=source.source_quantity AND actual.qty_available IS NOT NULL
          AND actual.qty_available>=0 AND actual.qty_available<=actual.qty;
      ELSIF source.origin_kind='OPENING' THEN
        SELECT state INTO controller FROM production_inventory_domain_states WHERE id=source.inventory_domain_id
          AND company_code=source.company_code AND product_code=source.product_code;
        IF NOT COALESCE(controller=ANY(ARRAY['FENCED','ACTIVE','SUSPENDED']),false) THEN RETURN false;END IF;
        RETURN EXISTS(SELECT 1 FROM production_cutover_manifests m JOIN production_opening_domain_claims c
          ON c.manifest_id=m.id AND c.domain_id=source.inventory_domain_id WHERE m.id=source.opening_manifest_id
          AND m.company_code=source.company_code AND m.state IN ('APPROVED','APPLIED') AND c.content_hash=m.content_hash
          AND source.scope_id=c.scope_id AND source.source_warehouse_code=m.warehouse_code AND source.source_type='OPENING'
          AND source.source_no=m.document_no AND source.evidence_sha256=m.content_hash AND source.source_unit='枚'
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(m.payload->'openingLines') WITH ORDINALITY l(line,n)
            WHERE source.batch_no='OPN-'||replace(m.id::text,'-','')||'-'||l.n::text
              AND source.origin_ref=m.document_no||':'||l.n::text AND source.sku_code=l.line->>'skuCode'
              AND source.product_code=l.line->>'productCode' AND source.source_quantity=(l.line->>'quantity')::numeric
              AND source.cost_status=l.line->>'costStatus')
          AND EXISTS(SELECT 1 FROM production_inventory_domain_events e WHERE e.domain_id=source.inventory_domain_id
            AND e.manifest_id=m.id AND e.state='ACTIVE'));
      END IF;
      RETURN false;
    END $body$;
    CREATE FUNCTION official_inventory_qualification_controlled(p_batch text) RETURNS boolean LANGUAGE sql STABLE AS $body$
      SELECT EXISTS(SELECT 1 FROM production_batch_qualifications q JOIN production_cutover_scopes s ON s.id=q.scope_id
        LEFT JOIN production_inventory_domain_states d ON d.id=q.inventory_domain_id WHERE q.batch_no=p_batch
        AND (s.state<>'DRAFT' OR q.origin_kind='PURCHASE' AND q.receipt_item_id IS NOT NULL OR d.state<>'DRAFT'))
      OR EXISTS(SELECT 1 FROM production_batch_roots r JOIN production_batch_qualifications q ON q.batch_no=r.root_batch_no
        JOIN production_cutover_scopes s ON s.id=q.scope_id LEFT JOIN production_inventory_domain_states d ON d.id=q.inventory_domain_id
        WHERE r.batch_no=p_batch AND (s.state<>'DRAFT' OR q.origin_kind='PURCHASE' AND q.receipt_item_id IS NOT NULL OR d.state<>'DRAFT'))
    $body$;
    CREATE OR REPLACE FUNCTION official_inventory_allows(p_batch text,p_company text,p_warehouse text,p_product text,p_sku text,p_material text)
    RETURNS boolean LANGUAGE plpgsql STABLE AS $body$
    DECLARE q record; controlled boolean; sku_product text;warehouse_company text;
    BEGIN
      SELECT product_code INTO sku_product FROM product_skus WHERE sku_code=p_sku;
      SELECT company_code INTO warehouse_company FROM wms_warehouses WHERE warehouse_code=p_warehouse;
      SELECT * INTO q FROM production_batch_qualifications WHERE batch_no=p_batch;
      controlled:=official_inventory_qualification_controlled(p_batch);
      IF controlled THEN
        IF q.disposition IS DISTINCT FROM 'QUALIFIED' OR q.company_code IS DISTINCT FROM p_company OR q.product_code IS DISTINCT FROM p_product
          OR q.sku_code IS DISTINCT FROM p_sku OR sku_product IS DISTINCT FROM q.product_code OR p_material IS NOT NULL
          OR warehouse_company IS DISTINCT FROM p_company THEN RETURN false;END IF;
        IF q.origin_kind='DERIVED' THEN
          IF NOT EXISTS(SELECT 1 FROM production_batch_roots WHERE batch_no=p_batch) OR EXISTS(
            SELECT 1 FROM production_batch_roots r WHERE r.batch_no=p_batch AND (NOT official_inventory_source_allowed(r.root_batch_no,false) OR EXISTS(SELECT 1 FROM production_batch_qualifications root
              WHERE root.batch_no=r.root_batch_no AND root.product_code IS DISTINCT FROM q.product_code))) THEN RETURN false;END IF;
        ELSIF NOT official_inventory_source_allowed(p_batch,false) THEN RETURN false;END IF;
        RETURN true;
      END IF;
      IF EXISTS(SELECT 1 FROM production_inventory_domain_states d WHERE d.company_code=COALESCE(NULLIF(p_company,'ALL'),warehouse_company) AND d.warehouse_code=p_warehouse
        AND (d.product_code=sku_product OR p_material IS NULL AND d.product_code=p_product) AND d.state<>'DRAFT') THEN RETURN false;END IF;
      RETURN NOT EXISTS(SELECT 1 FROM production_inventory_domains d JOIN production_cutover_scopes s ON s.id=d.scope_id
        WHERE d.company_code=COALESCE(NULLIF(p_company,'ALL'),warehouse_company) AND d.warehouse_code=p_warehouse
        AND (d.product_code=sku_product OR p_material IS NULL AND d.product_code=p_product) AND s.state<>'DRAFT');
    END $body$;
    CREATE OR REPLACE FUNCTION official_inventory_writable(p_batch text,p_company text,p_warehouse text,p_product text,p_sku text,p_material text)
    RETURNS boolean LANGUAGE plpgsql VOLATILE AS $body$
    DECLARE q record; fully_reversed boolean:=false; sku_product text;warehouse_company text;
    BEGIN
      IF NOT official_inventory_allows(p_batch,p_company,p_warehouse,p_product,p_sku,p_material) THEN RETURN false;END IF;
      SELECT product_code INTO sku_product FROM product_skus WHERE sku_code=p_sku;
      SELECT company_code INTO warehouse_company FROM wms_warehouses WHERE warehouse_code=p_warehouse;
      IF EXISTS(SELECT 1 FROM production_inventory_domain_states d WHERE d.company_code=COALESCE(NULLIF(p_company,'ALL'),warehouse_company) AND d.warehouse_code=p_warehouse
        AND (d.product_code=sku_product OR p_material IS NULL AND d.product_code=p_product) AND d.state NOT IN ('DRAFT','ACTIVE')) THEN RETURN false;END IF;
      IF official_inventory_qualification_controlled(p_batch) THEN
        SELECT * INTO q FROM production_batch_qualifications WHERE batch_no=p_batch;
        IF q.origin_kind='DERIVED' THEN
          IF EXISTS(SELECT 1 FROM production_batch_roots r WHERE r.batch_no=p_batch AND NOT official_inventory_source_allowed(r.root_batch_no,true)) THEN RETURN false;END IF;
        ELSIF NOT official_inventory_source_allowed(p_batch,true) THEN RETURN false;END IF;
      END IF;
      IF to_regclass('production_inbound_lines') IS NOT NULL THEN
        EXECUTE 'SELECT EXISTS(SELECT 1 FROM production_inbound_lines l JOIN production_inbound_documents d
          ON d.id=l.document_id AND d.kind=''INBOUND'' AND d.state=''POSTED'' WHERE l.batch_no=$1 AND l.quantity<=COALESCE((
            SELECT SUM(r.quantity) FROM production_inbound_allocations r JOIN production_inbound_allocations a
              ON a.id=r.original_allocation_id AND a.document_id=l.document_id AND a.line_no=l.line_no
            JOIN production_inbound_documents rd ON rd.id=r.document_id AND rd.state=''POSTED'' WHERE r.direction=-1),0))'
          INTO fully_reversed USING p_batch;
      END IF;
      RETURN NOT fully_reversed;
    END $body$;`);
  }

  private async installOperationGuards(q:QueryRunner):Promise<void>{
    await q.query(`CREATE FUNCTION official_inventory_lock_operation(p_batch text,p_company text,p_warehouse text,p_product text,p_sku text,p_material text,p_snapshot jsonb DEFAULT '{}'::jsonb)
    RETURNS void LANGUAGE plpgsql VOLATILE AS $body$
    DECLARE item record;effective_company text;sku_product text;
    BEGIN
      IF current_setting('transaction_isolation')<>'read committed' THEN
        RAISE EXCEPTION 'OFFICIAL_INVENTORY_ISOLATION_HOLD: inventory operations require READ COMMITTED' USING ERRCODE='23514';END IF;
      SELECT COALESCE(NULLIF(p_company,'ALL'),w.company_code) INTO effective_company FROM wms_warehouses w WHERE w.warehouse_code=p_warehouse;
      effective_company:=COALESCE(effective_company,NULLIF(p_company,'ALL'));
      SELECT product_code INTO sku_product FROM product_skus WHERE sku_code=p_sku;
      FOR item IN SELECT company_code,product_code FROM (
        SELECT effective_company AS company_code,CASE WHEN p_material IS NULL THEN p_product END AS product_code
        UNION SELECT effective_company,sku_product
        UNION SELECT root.company_code,root.product_code FROM production_batch_qualifications root
          WHERE root.batch_no=p_batch OR root.batch_no IN (SELECT root_batch_no FROM production_batch_roots WHERE batch_no=p_batch)
      ) candidates WHERE company_code IS NOT NULL AND product_code IS NOT NULL ORDER BY company_code,product_code LOOP
        IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:inventory-product'),hashtext(item.company_code||':'||item.product_code)) THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_PRODUCT_BUSY' USING ERRCODE='23514';END IF;
      END LOOP;
      FOR item IN SELECT d.id FROM production_inventory_domain_states d WHERE d.company_code=effective_company AND d.warehouse_code=p_warehouse
        AND (d.product_code=sku_product OR p_material IS NULL AND d.product_code=p_product) ORDER BY d.id LOOP
        IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:inventory-domain-state'),hashtext(item.id::text)) THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_DOMAIN_BUSY' USING ERRCODE='23514';END IF;
      END LOOP;
      FOR item IN SELECT batch_no FROM (SELECT p_batch AS batch_no UNION SELECT root_batch_no AS batch_no FROM production_batch_roots WHERE batch_no=p_batch) roots WHERE batch_no IS NOT NULL ORDER BY batch_no LOOP
        IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:inventory-root-state'),hashtext(item.batch_no)) THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_ROOT_BUSY' USING ERRCODE='23514';END IF;
      END LOOP;
      PERFORM 1 FROM production_cutover_scopes s WHERE s.id IN (
        SELECT root.scope_id FROM production_batch_qualifications root WHERE root.origin_kind='PRODUCTION' AND
          (root.batch_no=p_batch OR root.batch_no IN (SELECT root_batch_no FROM production_batch_roots WHERE batch_no=p_batch)))
        OR s.state='DRAFT' AND s.company_code=effective_company AND (EXISTS(SELECT 1 FROM production_inventory_domains d
          WHERE d.scope_id=s.id AND d.warehouse_code=p_warehouse AND (d.product_code=sku_product OR p_material IS NULL AND d.product_code=p_product))
          OR p_snapshot->>'source_type' IN ('TEMP_PRODUCTION','PRODUCTION','PACKAGING') AND (
            p_snapshot->>'collection_batch_ref'='HOUSE-'||s.house_code OR EXISTS(SELECT 1 FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(p_snapshot->'source_profile_snapshot')='array' THEN p_snapshot->'source_profile_snapshot' ELSE '[]'::jsonb END) p WHERE p->>'houseCode'=s.house_code)))
        ORDER BY s.id FOR SHARE;
    END $body$;`);
    // Guard source-only operations too; the second statement in the TS assertion observes committed state after acquiring its batch lock.
    const [{definition}]=await q.query("SELECT pg_get_functiondef('official_inventory_writable(text,text,text,text,text,text)'::regprocedure) AS definition");
    await q.query(definition.replace('BEGIN\n',`BEGIN\n      PERFORM official_inventory_lock_operation(p_batch,p_company,p_warehouse,p_product,p_sku,p_material,COALESCE((SELECT to_jsonb(b) FROM inv_batches b WHERE b.batch_no=p_batch),'{}'::jsonb));\n`));
    for(const name of ['guard_official_inventory_batch','guard_official_inventory_ledger']){
      const [{definition:prior}]=await q.query('SELECT pg_get_functiondef($1::regprocedure) AS definition',[name+'()']);
      const call=name.endsWith('_batch')?`IF TG_OP='DELETE' THEN b:=OLD;ELSE b:=NEW;END IF;
          PERFORM official_inventory_lock_operation(b.batch_no,b.company_code,b.warehouse_code,b.product_code,b.sku_code,b.material_code,to_jsonb(b));
          IF TG_OP<>'DELETE' AND NEW.unit='枚' AND official_inventory_qualification_controlled(NEW.batch_no)
            AND (NEW.qty<>trunc(NEW.qty) OR NEW.qty_available<>trunc(NEW.qty_available)) THEN
            RAISE EXCEPTION 'OFFICIAL_INVENTORY_INTEGER_BASE_QUANTITY_REQUIRED' USING ERRCODE='23514';END IF;
          IF TG_OP<>'DELETE' AND EXISTS(SELECT 1 FROM production_batch_qualifications source WHERE source.batch_no=NEW.batch_no
            AND source.disposition='QUALIFIED' AND source.origin_kind IN ('PURCHASE','OPENING','EXISTING_VERIFIED') AND (
              source.source_warehouse_code IS DISTINCT FROM NEW.warehouse_code OR source.source_unit IS DISTINCT FROM NEW.unit
              OR NEW.qty IS NULL OR NEW.qty<0 OR source.source_quantity IS NULL OR NEW.qty>source.source_quantity
              OR NEW.qty_available IS NULL OR NEW.qty_available<0 OR NEW.qty_available>NEW.qty)) THEN
            RAISE EXCEPTION 'OFFICIAL_INVENTORY_SOURCE_QUANTITY_IDENTITY_HOLD' USING ERRCODE='23514';END IF;`:

        `SELECT * INTO b FROM inv_batches WHERE batch_no=NEW.batch_no;
          IF FOUND THEN PERFORM official_inventory_lock_operation(b.batch_no,b.company_code,b.warehouse_code,b.product_code,b.sku_code,b.material_code,to_jsonb(b));END IF;`;
      const next=prior.replace('BEGIN\n','BEGIN\n          '+call+'\n')
        .replace("q.batch_no=OLD.batch_no AND s.state<>'DRAFT'","q.batch_no=OLD.batch_no AND official_inventory_qualification_controlled(OLD.batch_no)")
        .replace("q.batch_no=NEW.batch_no AND q.disposition='QUALIFIED' AND s.state<>'DRAFT'","q.batch_no=NEW.batch_no AND q.disposition='QUALIFIED' AND official_inventory_qualification_controlled(NEW.batch_no)").replace(/PERFORM 1 FROM production_cutover_scopes s[\s\S]*?ORDER BY s.id FOR SHARE;/,'-- Relevant scope/controller locks are held by official_inventory_lock_operation.');
      if(next===prior)throw new Error('CUTOVER_GUARD_INSTALL_HOLD: source guard definition changed');
      await q.query(next);
    }
    await q.query(`CREATE FUNCTION guard_qualified_source_credits() RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE source record; already numeric; expected_change text;
    BEGIN
      IF NEW.qty_change<=0 OR NEW.change_type IN ('RESERVED','RELEASED') THEN RETURN NEW;END IF;
      SELECT * INTO source FROM production_batch_qualifications WHERE batch_no=NEW.batch_no AND disposition='QUALIFIED' AND origin_kind IN ('PURCHASE','OPENING');
      IF FOUND THEN
        IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:inventory-source-credit'),hashtext(NEW.batch_no)) THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_SOURCE_CREDIT_BUSY' USING ERRCODE='23514';END IF;
        expected_change:=CASE WHEN source.origin_kind='PURCHASE' THEN 'PURCHASE_INBOUND' ELSE 'OPENING_INBOUND' END;
        SELECT COALESCE(SUM(qty_change),0) INTO already FROM inv_ledger WHERE batch_no=NEW.batch_no AND change_type=expected_change;
        IF NEW.change_type<>expected_change OR NEW.ref_no IS DISTINCT FROM source.source_no OR already+NEW.qty_change>source.source_quantity THEN
          RAISE EXCEPTION 'OFFICIAL_INVENTORY_NEW_SOURCE_REQUIRED: additional physical admission needs its own approved source' USING ERRCODE='23514';END IF;
      END IF;
      RETURN NEW;
    END $body$;
    CREATE TRIGGER trg_qualified_source_credits BEFORE INSERT ON inv_ledger FOR EACH ROW EXECUTE FUNCTION guard_qualified_source_credits();
    CREATE FUNCTION guard_inventory_qualification_registration() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:inventory-root-state'),hashtext(NEW.batch_no)) THEN
        RAISE EXCEPTION 'OFFICIAL_INVENTORY_ROOT_BUSY' USING ERRCODE='23514';END IF;
      RETURN NEW;
    END $body$;
    CREATE TRIGGER trg_inventory_qualification_registration BEFORE INSERT ON production_batch_qualifications
      FOR EACH ROW EXECUTE FUNCTION guard_inventory_qualification_registration()`);
  }

  private async dictionaries(q:QueryRunner,up:boolean):Promise<void>{
    const entries=[
      ['PRODUCTION_CUTOVER_STATE','DRAFT','盘点草稿','Count draft','ຮ່າງກວດນັບ'],
      ['PRODUCTION_CUTOVER_STATE','READY','待签认','Awaiting signatures','ລໍຖ້າລົງນາມ'],
      ['PRODUCTION_CUTOVER_STATE','APPROVED','已双角色签认','Both roles signed','ສອງບົດບາດລົງນາມແລ້ວ'],
      ['PRODUCTION_CUTOVER_STATE','APPLIED','期初已应用','Opening applied','ລົງຍອດເປີດແລ້ວ'],
      ['PRODUCTION_CUTOVER_STATE','CANCELLED','已取消','Cancelled','ຍົກເລີກແລ້ວ'],
      ['PRODUCTION_CUTOVER_DISPOSITION','ARCHIVED_TEST','测试资料归档','Archive test facts','ເກັບຂໍ້ມູນທົດລອງ'],
      ['PRODUCTION_CUTOVER_DISPOSITION','CARRY_FORWARD','已有合法来源接续','Carry verified stock','ສືບຕໍ່ສິນຄ້າທີ່ກວດແລ້ວ'],
      ['PRODUCTION_CUTOVER_REFERENCE','TEST','已核实为测试','Verified test reference','ຢືນຢັນວ່າເປັນການທົດລອງ'],
      ['PRODUCTION_CUTOVER_REFERENCE','RESOLVED','已实际终结','Actually resolved','ດຳເນີນການສຳເລັດແລ້ວ'],
      ['PRODUCTION_CUTOVER_ROLE','BUSINESS','业务签认','Business signature','ລົງນາມຝ່າຍທຸລະກິດ'],
      ['PRODUCTION_CUTOVER_ROLE','FINANCE','财务签认','Finance signature','ລົງນາມຝ່າຍການເງິນ'],
      ['PRODUCTION_INVENTORY_DOMAIN_STATE','DRAFT','未启用','Off','ຍັງບໍ່ເປີດ'],
      ['PRODUCTION_INVENTORY_DOMAIN_STATE','FENCED','已围栏','Fenced','ຢຸດການຂຽນຊົ່ວຄາວ'],
      ['PRODUCTION_INVENTORY_DOMAIN_STATE','ACTIVE','已启用','Active','ເປີດໃຊ້ແລ້ວ'],
      ['PRODUCTION_INVENTORY_DOMAIN_STATE','SUSPENDED','已暂停','Suspended','ຢຸດຊົ່ວຄາວ'],
    ];
    for(const [index,[type,code,zh,en,lo]] of entries.entries()){
      if(up){
        const inserted=await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_value,dict_label_zh,dict_label_en,dict_label_lo,sort_no,status)
          VALUES($1,$2,$2,$3,$4,$5,$6,'ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING RETURNING dict_code`,[type,code,zh,en,lo,220+index]);
        if(!(await q.query("SELECT 1 FROM sys_dict WHERE dict_type=$1 AND dict_code=$2 AND dict_value=$2 AND status='ACTIVE'",[type,code])).length)
          throw new Error('CUTOVER_DICTIONARY_SEMANTICS_HOLD');
        if(inserted.length)await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('PRODUCTION_CUTOVER_DICT','sys_dict',$1,$2)`,[type,code]);
      }else{
        if(!(await q.query(`SELECT 1 FROM typeorm_metadata WHERE "type"='PRODUCTION_CUTOVER_DICT' AND "name"=$1 AND "value"=$2`,[type,code])).length)continue;
        await q.query('DELETE FROM sys_dict WHERE dict_type=$1 AND dict_code=$2 AND dict_label_zh=$3 AND dict_label_en=$4 AND dict_label_lo=$5 AND dict_value=$2',[type,code,zh,en,lo]);
        await q.query(`DELETE FROM typeorm_metadata WHERE "type"='PRODUCTION_CUTOVER_DICT' AND "name"=$1 AND "value"=$2`,[type,code]);
      }
    }
  }

  async down(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD: READ COMMITTED required');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query('LOCK TABLE production_cutover_scopes,production_inventory_domain_states,production_cutover_manifests,production_cutover_signatures,production_opening_domain_claims,production_source_state_events,production_inventory_domain_events,production_batch_qualifications IN ACCESS EXCLUSIVE MODE');
      for(const table of ['production_cutover_scopes','production_inventory_domain_states','production_cutover_manifests','production_cutover_signatures','production_opening_domain_claims','production_source_state_events','production_inventory_domain_events']){
        if((await q.query(`SELECT 1 FROM ${table} LIMIT 1`)).length)throw new Error('CUTOVER_MANIFEST_DOWN_HOLD: signed or scoped facts exist');
      }
      await this.dictionaries(q,false);
      await new OfficialInventoryCutover1794971000000().up(q);
      await q.query(`DROP TRIGGER trg_inventory_qualification_registration ON production_batch_qualifications;
        DROP FUNCTION guard_inventory_qualification_registration();
        DROP TRIGGER trg_qualified_source_credits ON inv_ledger;
        DROP FUNCTION guard_qualified_source_credits();
        DROP FUNCTION official_inventory_lock_operation(text,text,text,text,text,text,jsonb);
        DROP TRIGGER trg_inventory_opening_claim_insert ON production_opening_domain_claims;
        DROP TRIGGER trg_inventory_source_event_insert ON production_source_state_events;
        DROP TRIGGER trg_inventory_domain_event_guard ON production_inventory_domain_events;
        DROP TRIGGER trg_inventory_domain_state_guard ON production_inventory_domain_states;
        DROP FUNCTION guard_cutover_control_states();
        DROP TRIGGER trg_inventory_domain_event_projection ON production_inventory_domain_events;
        DROP FUNCTION guard_cutover_state_projection();
        DROP TABLE production_inventory_domain_events;
        DROP FUNCTION official_inventory_qualification_controlled(text);
        DROP FUNCTION official_inventory_source_allowed(text,boolean);
        DROP TRIGGER trg_cutover_source_event_guard ON production_source_state_events;
        DROP TRIGGER trg_cutover_opening_claim_guard ON production_opening_domain_claims;
        DROP TRIGGER trg_cutover_signature_guard ON production_cutover_signatures;
        DROP TRIGGER trg_cutover_manifest_guard ON production_cutover_manifests;
        DROP FUNCTION guard_cutover_manifest_facts();
        DROP TABLE production_source_state_events;
        ALTER TABLE production_batch_qualifications DROP COLUMN opening_manifest_id,DROP COLUMN source_unit,DROP COLUMN source_quantity,
          DROP COLUMN source_warehouse_code,DROP COLUMN receipt_item_id,DROP COLUMN receipt_id,DROP COLUMN inventory_domain_id;
        ALTER TABLE production_inventory_domains DROP COLUMN inventory_domain_id;
        DROP TABLE production_opening_domain_claims;
        DROP TABLE production_cutover_signatures;
        DROP TABLE production_cutover_manifests;
        DROP TABLE production_inventory_domain_states`);
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
}
