import { MigrationInterface,QueryRunner } from 'typeorm';

/** @allow-data-dml: Immutable guard DDL and owned sys_dict vocabulary only; no conversion, stock or activation facts are seeded. */
export class OfficialInventoryConversions1795011331222 implements MigrationInterface {
  private readonly dictionaries=[
    ['INV_LEDGER_CHANGE_TYPE','CONVERSION_IN','实际转换入库','Physical conversion inbound','ຮັບເຂົ້າຈາກການແປຮູບ'],
    ['INV_LEDGER_CHANGE_TYPE','CONVERSION_OUT','实际转换领用','Physical conversion input','ເບີກໃຊ້ເພື່ອແປຮູບ'],
    ['PRODUCTION_CONVERSION_KIND','GRADING','实际分级','Grading','ຈັດຊັ້ນໄຂ່'],
    ['PRODUCTION_CONVERSION_KIND','PACKING','实际包装','Packing','ບັນຈຸໄຂ່'],
    ['PRODUCTION_CONVERSION_KIND','REPACKING','实际再包装','Repacking','ບັນຈຸໃໝ່'],
    ['PRODUCTION_CONVERSION_OUTPUT_KIND','STOCK','成品实物','Finished stock','ສິນຄ້າສຳເລັດ'],
    ['PRODUCTION_CONVERSION_OUTPUT_KIND','WIP','实际在制品','Physical work in progress','ສິນຄ້າລະຫວ່າງຜະລິດ'],
    ['PRODUCTION_CONVERSION_OUTPUT_KIND','LOSS','实际损耗','Measured loss','ການສູນເສຍທີ່ວັດແທກ'],
    ['PRODUCTION_CONVERSION_LOSS_REASON','PROCESSING_LOSS','实际作业损耗','Measured processing loss','ການສູນເສຍໃນການຜະລິດ'],
  ];
  async up(queryRunner:QueryRunner):Promise<void>{
    if((await queryRunner.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!queryRunner.isTransactionActive;if(own)await queryRunner.startTransaction();
    try{
      await queryRunner.query(`CREATE TABLE production_conversion_documents(
        id uuid PRIMARY KEY,document_no text NOT NULL UNIQUE,company_code text NOT NULL,warehouse_code text NOT NULL,product_code text NOT NULL,
        operation_kind text NOT NULL CHECK(operation_kind IN('GRADING','PACKING','REPACKING')),
        physical_group_ref text NOT NULL CHECK(length(btrim(physical_group_ref)) BETWEEN 1 AND 128),
        operation_date date NOT NULL,intent_key text NOT NULL,creation_hash text NOT NULL CHECK(creation_hash ~ '^[a-f0-9]{64}$'),
        state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN('DRAFT','READY','APPROVED','POSTED','CANCELLED')),
        version integer NOT NULL DEFAULT 0 CHECK(version>=0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
        submit_key text,content_hash text,expected_posting_date date,ready_by text,ready_at timestamptz,
        approved_by text,approved_at timestamptz,approved_hash text,posting_date date,receipt jsonb,posted_by text,posted_at timestamptz,
        created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),cancelled_by text,cancelled_at timestamptz,
        UNIQUE(company_code,intent_key),
        CHECK(state IN('DRAFT','CANCELLED') OR(content_hash IS NOT NULL AND content_hash ~ '^[a-f0-9]{64}$'
          AND submit_key IS NOT NULL AND expected_posting_date IS NOT NULL AND ready_by IS NOT NULL AND ready_at IS NOT NULL)),
        CHECK(state NOT IN('APPROVED','POSTED') OR(approved_by IS NOT NULL AND approved_by<>created_by AND approved_by<>ready_by
          AND approved_hash IS NOT NULL AND approved_hash=content_hash AND approved_at IS NOT NULL)),
        CHECK(state<>'POSTED' OR(posting_date IS NOT NULL AND receipt IS NOT NULL AND posted_by IS NOT NULL AND posted_at IS NOT NULL)),
        CHECK(state<>'CANCELLED' OR(cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))
      );
      CREATE UNIQUE INDEX uq_production_conversion_group ON production_conversion_documents(company_code,physical_group_ref) WHERE state<>'CANCELLED';
      CREATE UNIQUE INDEX uq_production_conversion_submit ON production_conversion_documents(company_code,submit_key) WHERE submit_key IS NOT NULL;
      CREATE TABLE production_conversion_inputs(
        id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES production_conversion_documents(id),line_no integer NOT NULL CHECK(line_no>0),
        raw_segment_id uuid REFERENCES production_raw_receipt_segments(id),parent_batch_no text REFERENCES inv_batches(batch_no),
        quantity integer NOT NULL CHECK(quantity>0),grade_code text NOT NULL,inventory_ledger_id bigint REFERENCES inv_ledger(id),
        source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
        posting_transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(),ledger_ids_before bigint[] NOT NULL DEFAULT '{}',
        recorded_unit_cost numeric(18,6),recorded_amount numeric,
        cost_status text NOT NULL CHECK(cost_status IN('UNKNOWN','CONFIRMED')),unit_cost numeric(18,6),known_amount numeric,
        currency_code text,UNIQUE(document_id,line_no),
        CHECK((raw_segment_id IS NOT NULL)<>(parent_batch_no IS NOT NULL)),
        CHECK(raw_segment_id IS NULL OR(inventory_ledger_id IS NULL AND cost_status='UNKNOWN' AND unit_cost IS NULL AND known_amount IS NULL AND recorded_unit_cost IS NULL AND recorded_amount IS NULL AND currency_code IS NULL)),
        CHECK(cost_status<>'CONFIRMED' OR(unit_cost IS NOT NULL AND unit_cost>=0 AND known_amount IS NOT NULL AND known_amount=quantity*unit_cost AND currency_code IS NOT NULL))
      );
      CREATE UNIQUE INDEX uq_conversion_raw_segment_input ON production_conversion_inputs(document_id,raw_segment_id) WHERE raw_segment_id IS NOT NULL;
      CREATE UNIQUE INDEX uq_conversion_parent_input ON production_conversion_inputs(document_id,parent_batch_no) WHERE parent_batch_no IS NOT NULL;
      CREATE UNIQUE INDEX uq_conversion_transaction_parent ON production_conversion_inputs(parent_batch_no,posting_transaction_id) WHERE parent_batch_no IS NOT NULL;
      CREATE UNIQUE INDEX uq_conversion_debit_ledger ON production_conversion_inputs(inventory_ledger_id) WHERE inventory_ledger_id IS NOT NULL;
      CREATE INDEX ix_conversion_raw_consumption ON production_conversion_inputs(raw_segment_id);
      CREATE TABLE production_conversion_inventory_debits(
        input_id uuid PRIMARY KEY REFERENCES production_conversion_inputs(id),parent_batch_no text NOT NULL,
        quantity_before numeric NOT NULL,quantity_after numeric NOT NULL,available_before numeric NOT NULL,available_after numeric NOT NULL,
        CHECK(quantity_before>=quantity_after AND available_before>=available_after)
      );
      CREATE TABLE production_conversion_outputs(
        id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES production_conversion_documents(id),line_no integer NOT NULL CHECK(line_no>0),
        output_kind text NOT NULL CHECK(output_kind IN('STOCK','WIP','LOSS')),grade_code text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),
        batch_no text UNIQUE REFERENCES inv_batches(batch_no),sku_code text,location_code text,
        inventory_ledger_id bigint UNIQUE REFERENCES inv_ledger(id),loss_reason text,evidence_file_id text NOT NULL,
        source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
        UNIQUE(document_id,line_no),
        CHECK(output_kind='LOSS' AND batch_no IS NULL AND inventory_ledger_id IS NULL AND sku_code IS NULL AND location_code IS NULL
          AND loss_reason IS NOT NULL AND length(btrim(loss_reason))>0
          OR output_kind IN('STOCK','WIP') AND batch_no IS NOT NULL AND inventory_ledger_id IS NOT NULL AND sku_code IS NOT NULL
          AND location_code IS NOT NULL AND loss_reason IS NULL)
      );
      ALTER TABLE production_batch_qualifications ADD COLUMN processing_stage text NOT NULL DEFAULT 'FINISHED'
        CHECK(processing_stage IN('FINISHED','WIP')),
        ADD COLUMN conversion_document_id uuid REFERENCES production_conversion_documents(id),ADD COLUMN conversion_output_no integer;
      ALTER TABLE production_batch_qualifications ADD CONSTRAINT ck_conversion_qualification_pair
        CHECK((conversion_document_id IS NULL)=(conversion_output_no IS NULL));
      CREATE TABLE production_batch_raw_roots(
        batch_no text NOT NULL REFERENCES production_batch_qualifications(batch_no),
        raw_segment_id uuid NOT NULL REFERENCES production_raw_receipt_segments(id),PRIMARY KEY(batch_no,raw_segment_id)
      );
      CREATE TABLE production_batch_derivation_parents(
        batch_no text NOT NULL REFERENCES production_batch_qualifications(batch_no),parent_batch_no text NOT NULL REFERENCES inv_batches(batch_no),
        PRIMARY KEY(batch_no,parent_batch_no),CHECK(batch_no<>parent_batch_no)
      );
      CREATE INDEX ix_production_batch_raw_ancestor ON production_batch_raw_roots(raw_segment_id);
      ALTER TABLE inv_batches DROP CONSTRAINT IF EXISTS inv_batches_inventory_class_check;
      ALTER TABLE inv_batches ADD CONSTRAINT inv_batches_inventory_class_check CHECK(inventory_class IN('STANDARD','DEFECT_SALE','WIP'));
      `);
      for(const [table,column] of [['wms_transfer_items','damaged_batch_no']]){
        if(await queryRunner.hasTable(table))await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN ${column} text REFERENCES inv_batches(batch_no) DEFERRABLE INITIALLY DEFERRED`);
      }
      if(await queryRunner.hasTable('wms_transfer_items'))await queryRunner.query(`CREATE INDEX ix_conversion_transfer_target ON wms_transfer_items(target_batch_no) WHERE target_batch_no IS NOT NULL;
        CREATE INDEX ix_conversion_transfer_damage_target ON wms_transfer_items(damaged_batch_no) WHERE damaged_batch_no IS NOT NULL`);
      if(await queryRunner.hasTable('wms_defect_dispositions'))await queryRunner.query('CREATE INDEX ix_conversion_defect_target ON wms_defect_dispositions(target_batch_no) WHERE target_batch_no IS NOT NULL');
      await this.installEligibility(queryRunner);
      await this.installGuards(queryRunner);
      await this.installPostingChecks(queryRunner);
      for(const [index,[type,code,zh,en,lo]] of this.dictionaries.entries()){
        const inserted=await queryRunner.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_value,dict_label_zh,dict_label_en,dict_label_lo,sort_no,status)
          VALUES($1,$2,$2,$3,$4,$5,$6,'ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING RETURNING dict_code`,[type,code,zh,en,lo,310+index]);
        if(!(await queryRunner.query("SELECT 1 FROM sys_dict WHERE dict_type=$1 AND dict_code=$2 AND dict_value=$2 AND status='ACTIVE'",[type,code])).length)
          throw new Error('OFFICIAL_CONVERSION_DICTIONARY_HOLD');
        if(inserted.length)await queryRunner.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('OFFICIAL_CONVERSION_DICT','sys_dict',$1,$2)`,[type,code]);
      }
      if(own)await queryRunner.commitTransaction();
    }catch(error){if(own)await queryRunner.rollbackTransaction();throw error;}
  }

  private async installEligibility(q:QueryRunner):Promise<void>{
    const signatures=['official_inventory_qualification_controlled(text)','official_inventory_allows(text,text,text,text,text,text)',
      'official_inventory_writable(text,text,text,text,text,text)','official_inventory_lock_operation(text,text,text,text,text,text,jsonb)','official_inventory_cost_known(text)'];
    const definitions=new Map<string,string>();
    for(const signature of signatures){
      const [{definition}]=await q.query('SELECT pg_get_functiondef($1::regprocedure) AS definition',[signature]);
      definitions.set(signature,definition);
      await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('OFFICIAL_CONVERSION_FUNCTION','',$1,$2)`,[signature,definition]);
    }
    await q.query(`CREATE FUNCTION official_inventory_conversion_related(p_batch text) RETURNS boolean LANGUAGE sql STABLE AS $body$
      WITH RECURSIVE ancestors(batch_no) AS(SELECT p_batch UNION SELECT relation.parent_batch_no FROM production_batch_derivation_parents relation
        JOIN ancestors ON ancestors.batch_no=relation.batch_no)
      SELECT EXISTS(SELECT 1 FROM ancestors JOIN production_batch_qualifications q USING(batch_no) WHERE q.conversion_document_id IS NOT NULL)
      $body$;
      CREATE FUNCTION official_conversion_parent_available_on(p_batch text) RETURNS date LANGUAGE plpgsql VOLATILE AS $body$
      DECLARE batch record;qualifier record;available_on date;
      BEGIN
        SELECT * INTO batch FROM inv_batches WHERE batch_no=p_batch;
        SELECT * INTO qualifier FROM production_batch_qualifications WHERE batch_no=p_batch;
        IF qualifier.conversion_document_id IS NOT NULL THEN
          SELECT operation_date INTO available_on FROM production_conversion_documents WHERE id=qualifier.conversion_document_id AND state='POSTED' FOR SHARE;
        ELSIF batch.source_type IN('TRANSFER','TRANSFER_DAMAGE') THEN
          IF to_regclass('wms_transfer') IS NULL THEN RETURN NULL;END IF;
          SELECT(received_at AT TIME ZONE 'Asia/Singapore')::date INTO available_on FROM wms_transfer
            WHERE transfer_no=batch.source_no AND status IN('RECEIVED','COMPLETED') FOR SHARE;
        ELSIF batch.source_type='DEFECT_TRANSFER' THEN
          IF to_regclass('wms_defect_dispositions') IS NULL THEN RETURN NULL;END IF;
          SELECT(updated_at AT TIME ZONE 'Asia/Singapore')::date INTO available_on FROM wms_defect_dispositions
            WHERE disposition_no=batch.source_no AND target_batch_no=p_batch AND status='DONE' FOR SHARE;
        ELSE available_on=batch.inbound_date;END IF;
        RETURN available_on;
      END $body$;
      CREATE FUNCTION official_inventory_proven_currency(p_batch text) RETURNS text LANGUAGE plpgsql VOLATILE AS $body$
      DECLARE root record;currency text;result text;found_root boolean:=false;
      BEGIN
        FOR root IN SELECT q.* FROM production_batch_qualifications q WHERE q.batch_no IN(
          SELECT batch_no FROM production_batch_qualifications WHERE batch_no=p_batch AND origin_kind<>'DERIVED'
          UNION SELECT root_batch_no FROM production_batch_roots WHERE batch_no=p_batch) ORDER BY q.batch_no LOOP
          found_root=true;
          IF root.origin_kind<>'PURCHASE' OR root.receipt_id IS NULL OR to_regclass('prc2_receipts') IS NULL
            OR to_regclass('prc2_purchase_orders') IS NULL THEN RETURN NULL;END IF;
          BEGIN
            EXECUTE 'SELECT po.currency_code FROM prc2_receipts receipt JOIN prc2_purchase_orders po ON po.id=receipt.po_id
              WHERE receipt.id=$1 AND receipt.status=''CONFIRMED'' AND receipt.company_code=$2 AND po.company_code=$2 FOR SHARE OF receipt,po'
              INTO currency USING root.receipt_id,root.company_code;
          EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN NULL;END;
          IF currency IS NULL OR currency !~ '^[A-Z]{3}$' OR result IS NOT NULL AND result<>currency THEN RETURN NULL;END IF;
          result=currency;
        END LOOP;
        RETURN CASE WHEN found_root THEN result ELSE NULL END;
      END $body$;
      CREATE FUNCTION official_inventory_raw_roots_allowed(p_batch text,p_operation boolean) RETURNS boolean LANGUAGE sql STABLE AS $body$
      SELECT NOT EXISTS(SELECT 1 FROM production_batch_raw_roots root
        JOIN production_raw_receipt_segments segment ON segment.id=root.raw_segment_id
        JOIN production_raw_receipts receipt ON receipt.id=segment.receipt_id JOIN production_cutover_scopes scope ON scope.id=receipt.scope_id
        JOIN production_batch_qualifications q ON q.batch_no=root.batch_no
        LEFT JOIN mst_products p ON p.product_code=q.product_code WHERE root.batch_no=p_batch AND(
          receipt.state<>'POSTED' OR receipt.company_code<>q.company_code
          OR scope.state<>ALL(CASE WHEN p_operation THEN ARRAY['ACTIVE'] ELSE ARRAY['ACTIVE','SUSPENDED'] END)
          OR p.product_code IS NULL OR p.variety_code IS DISTINCT FROM(receipt.payload->'profile'->>'varietyCode')))
    $body$;
    CREATE OR REPLACE FUNCTION official_inventory_qualification_controlled(p_batch text) RETURNS boolean LANGUAGE sql STABLE AS $body$
      SELECT EXISTS(SELECT 1 FROM production_batch_qualifications q JOIN production_cutover_scopes s ON s.id=q.scope_id
        LEFT JOIN production_inventory_domain_states d ON d.id=q.inventory_domain_id WHERE q.batch_no=p_batch
        AND(s.state<>'DRAFT' OR q.origin_kind='PURCHASE' AND q.receipt_item_id IS NOT NULL OR d.state<>'DRAFT'))
      OR EXISTS(SELECT 1 FROM production_batch_roots r JOIN production_batch_qualifications q ON q.batch_no=r.root_batch_no
        JOIN production_cutover_scopes s ON s.id=q.scope_id LEFT JOIN production_inventory_domain_states d ON d.id=q.inventory_domain_id
        WHERE r.batch_no=p_batch AND(s.state<>'DRAFT' OR q.origin_kind='PURCHASE' AND q.receipt_item_id IS NOT NULL OR d.state<>'DRAFT'))
      OR EXISTS(SELECT 1 FROM production_batch_raw_roots root JOIN production_raw_receipt_segments segment ON segment.id=root.raw_segment_id
        JOIN production_raw_receipts receipt ON receipt.id=segment.receipt_id JOIN production_cutover_scopes scope ON scope.id=receipt.scope_id
        WHERE root.batch_no=p_batch AND scope.state<>'DRAFT')
    $body$;`);
    const allowed=definitions.get(signatures[1])!;
    await q.query(`CREATE OR REPLACE FUNCTION official_inventory_cost_known(p_batch text) RETURNS boolean LANGUAGE sql STABLE AS $body$
      SELECT COALESCE((SELECT b.unit_cost IS NOT NULL AND NOT EXISTS(SELECT 1 FROM production_batch_qualifications q
        WHERE q.batch_no=b.batch_no AND q.disposition='QUALIFIED' AND q.cost_status='UNKNOWN' AND official_inventory_qualification_controlled(q.batch_no))
        FROM inv_batches b WHERE b.batch_no=p_batch),false)
      $body$;`);
    const needle="IF NOT EXISTS(SELECT 1 FROM production_batch_roots WHERE batch_no=p_batch) OR EXISTS(";
    if(!allowed.includes(needle))throw new Error('OFFICIAL_CONVERSION_PREDICATE_INSTALL_HOLD');
    await q.query(allowed.replace(needle,"IF NOT official_inventory_raw_roots_allowed(p_batch,false) OR(NOT EXISTS(SELECT 1 FROM production_batch_roots WHERE batch_no=p_batch) AND NOT EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=p_batch)) OR EXISTS("));
    const writable=definitions.get(signatures[2])!;
    if(!writable.includes("IF q.origin_kind='DERIVED' THEN"))throw new Error('OFFICIAL_CONVERSION_WRITABLE_INSTALL_HOLD');
    await q.query(writable.replace("IF q.origin_kind='DERIVED' THEN","IF q.origin_kind='DERIVED' THEN\n          IF NOT official_inventory_raw_roots_allowed(p_batch,true) THEN RETURN false;END IF;"));
    const locks=definitions.get(signatures[3])!;
    const end=locks.lastIndexOf('END');if(end<0)throw new Error('OFFICIAL_CONVERSION_LOCK_INSTALL_HOLD');
    await q.query(locks.slice(0,end)+`PERFORM 1 FROM production_cutover_scopes scope WHERE scope.id IN(
        SELECT receipt.scope_id FROM production_batch_raw_roots root JOIN production_raw_receipt_segments segment ON segment.id=root.raw_segment_id
          JOIN production_raw_receipts receipt ON receipt.id=segment.receipt_id WHERE root.batch_no=p_batch)
        ORDER BY scope.id FOR SHARE;\n    `+locks.slice(end));
    await q.query(`CREATE FUNCTION guard_conversion_raw_root() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE owner record;source record;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_ROOT_IMMUTABLE' USING ERRCODE='23514';END IF;
        SELECT * INTO owner FROM production_batch_qualifications WHERE batch_no=NEW.batch_no FOR SHARE;
        SELECT receipt.* INTO source FROM production_raw_receipt_segments segment JOIN production_raw_receipts receipt ON receipt.id=segment.receipt_id
          WHERE segment.id=NEW.raw_segment_id FOR SHARE OF receipt;
        PERFORM 1 FROM production_cutover_scopes WHERE id=source.scope_id FOR SHARE;
        IF owner.batch_no IS NULL OR owner.origin_kind<>'DERIVED' OR owner.disposition<>'QUALIFIED'
          OR source.id IS NULL OR source.state<>'POSTED' OR source.company_code<>owner.company_code
          OR NOT EXISTS(SELECT 1 FROM production_cutover_scopes WHERE id=source.scope_id AND state='ACTIVE')
          OR EXISTS(SELECT 1 FROM inv_batches WHERE batch_no=NEW.batch_no) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_ROOT_ADMISSION_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_raw_root BEFORE INSERT OR UPDATE OR DELETE ON production_batch_raw_roots
        FOR EACH ROW EXECUTE FUNCTION guard_conversion_raw_root();
      CREATE FUNCTION project_conversion_processing_class() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE stage text;
      BEGIN
        SELECT processing_stage INTO stage FROM production_batch_qualifications WHERE batch_no=NEW.batch_no;
        IF stage='WIP' THEN NEW.inventory_class='WIP';
        ELSIF NEW.inventory_class='WIP' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_WIP_ADMISSION_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_processing_class BEFORE INSERT OR UPDATE ON inv_batches
        FOR EACH ROW EXECUTE FUNCTION project_conversion_processing_class();`);
  }

  private async installGuards(q:QueryRunner):Promise<void>{
    await q.query(`CREATE FUNCTION lock_official_conversion_period(p_document uuid) RETURNS void LANGUAGE plpgsql AS $body$
      DECLARE d record;period record;
      BEGIN
        SELECT * INTO d FROM production_conversion_documents WHERE id=p_document;
        PERFORM pg_advisory_xact_lock(hashtext('production-period:'||d.company_code||':'||to_char(d.expected_posting_date,'YYYY-MM')));
        SELECT p.* INTO period FROM production_posting_periods p JOIN file_metadata f ON f.file_id=p.evidence_file_id
          AND f.checksum=p.evidence_checksum AND f.status='ACTIVE' AND f.deleted_at IS NULL AND f.company_code=p.company_code
          AND f.module_code='PRODUCTION_INBOUND' AND f.owner_type='HOUSE' AND f.owner_id=p.owner_house_code AND f.visibility IN('PROTECTED','PRIVATE')
          JOIN sys_user u ON u.user_id::text=p.signed_by AND u.username=f.uploaded_by AND u.status::text IN('1','ACTIVE')
          WHERE p.company_code=d.company_code AND p.period_month=to_char(d.expected_posting_date,'YYYY-MM') AND p.state='OPEN' FOR SHARE OF p,f,u;
        IF period.company_code IS NULL OR d.payload->'postingPeriod' IS DISTINCT FROM jsonb_build_object('periodMonth',period.period_month,
          'version',period.version,'evidenceChecksum',period.evidence_checksum) THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_PERIOD_HOLD' USING ERRCODE='23514';END IF;
      END $body$;
      CREATE FUNCTION guard_conversion_document() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_DOCUMENT_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF TG_OP='INSERT' THEN
          IF NEW.state<>'DRAFT' OR NEW.version<>0 OR NEW.submit_key IS NOT NULL OR NEW.content_hash IS NOT NULL
            OR NEW.expected_posting_date IS NOT NULL OR NEW.ready_by IS NOT NULL OR NEW.ready_at IS NOT NULL
            OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.approved_hash IS NOT NULL
            OR NEW.posting_date IS NOT NULL OR NEW.receipt IS NOT NULL OR NEW.posted_by IS NOT NULL OR NEW.posted_at IS NOT NULL
            OR NEW.cancelled_by IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_INITIAL_STATE_HOLD' USING ERRCODE='23514';END IF;
          RETURN NEW;
        END IF;
        IF NEW.payload->>'productCode' IS DISTINCT FROM NEW.product_code THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_PRODUCT_IDENTITY_HOLD' USING ERRCODE='23514';END IF;
        IF OLD.state IN('POSTED','CANCELLED') OR NEW.version<>OLD.version+1
          OR(to_jsonb(OLD)-ARRAY['state','version','payload','submit_key','content_hash','expected_posting_date','ready_by','ready_at',
            'approved_by','approved_at','approved_hash','posting_date','receipt','posted_by','posted_at','cancelled_by','cancelled_at']) IS DISTINCT FROM
            (to_jsonb(NEW)-ARRAY['state','version','payload','submit_key','content_hash','expected_posting_date','ready_by','ready_at',
            'approved_by','approved_at','approved_hash','posting_date','receipt','posted_by','posted_at','cancelled_by','cancelled_at'])
          OR OLD.state<>'DRAFT' AND(OLD.payload,OLD.submit_key,OLD.content_hash,OLD.expected_posting_date,OLD.ready_by,OLD.ready_at) IS DISTINCT FROM
            (NEW.payload,NEW.submit_key,NEW.content_hash,NEW.expected_posting_date,NEW.ready_by,NEW.ready_at)
          OR OLD.state='DRAFT' AND NEW.state NOT IN('DRAFT','READY','CANCELLED')
          OR OLD.state='READY' AND NEW.state NOT IN('APPROVED','CANCELLED')
          OR OLD.state='APPROVED' AND NEW.state NOT IN('POSTED','CANCELLED') THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_DOCUMENT_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF OLD.state='APPROVED' AND(OLD.approved_by,OLD.approved_at,OLD.approved_hash) IS DISTINCT FROM(NEW.approved_by,NEW.approved_at,NEW.approved_hash) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_SIGNATURE_IMMUTABLE' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_document BEFORE INSERT OR UPDATE OR DELETE ON production_conversion_documents
        FOR EACH ROW EXECUTE FUNCTION guard_conversion_document();
      CREATE FUNCTION guard_conversion_qualification() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE d record;
      BEGIN
        IF NEW.conversion_document_id IS NULL THEN RETURN NEW;END IF;
        SELECT * INTO d FROM production_conversion_documents WHERE id=NEW.conversion_document_id FOR SHARE;
        IF d.state IS DISTINCT FROM 'APPROVED' OR NEW.origin_kind<>'DERIVED' OR NEW.disposition<>'QUALIFIED'
          OR NEW.batch_no IS DISTINCT FROM 'CVT-'||replace(d.id::text,'-','')||'-'||NEW.conversion_output_no::text
          OR NEW.company_code IS DISTINCT FROM d.company_code OR NEW.product_code IS DISTINCT FROM d.product_code
          OR NOT EXISTS(SELECT 1 FROM production_cutover_scopes scope JOIN production_inventory_domains domain ON domain.scope_id=scope.id
            WHERE scope.id=NEW.scope_id AND scope.state IN('ACTIVE','SUSPENDED') AND domain.company_code=d.company_code
              AND domain.warehouse_code=d.warehouse_code AND domain.product_code=d.product_code)
          OR EXISTS(SELECT 1 FROM inv_batches WHERE batch_no=NEW.batch_no) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_QUALIFICATION_PLAN_HOLD' USING ERRCODE='23514';END IF;
        IF to_regclass('wms_transfer_items') IS NOT NULL THEN
          IF EXISTS(SELECT 1 FROM wms_transfer_items WHERE target_batch_no=NEW.batch_no OR damaged_batch_no=NEW.batch_no) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_QUALIFICATION_PLAN_HOLD' USING ERRCODE='23514';END IF;
        END IF;
        IF to_regclass('wms_defect_dispositions') IS NOT NULL THEN
          IF EXISTS(SELECT 1 FROM wms_defect_dispositions WHERE target_batch_no=NEW.batch_no) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_QUALIFICATION_PLAN_HOLD' USING ERRCODE='23514';END IF;
        END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_qualification_plan BEFORE INSERT ON production_batch_qualifications FOR EACH ROW EXECUTE FUNCTION guard_conversion_qualification();
      CREATE FUNCTION guard_conversion_parent_binding() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE qualifier record;
      BEGIN
        SELECT * INTO qualifier FROM production_batch_qualifications WHERE batch_no=NEW.batch_no;
        IF current_setting('transaction_isolation')<>'read committed' OR qualifier.origin_kind IS DISTINCT FROM 'DERIVED'
          OR qualifier.conversion_document_id IS NOT NULL OR EXISTS(SELECT 1 FROM inv_batches WHERE batch_no=NEW.batch_no) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_PARENT_BINDING_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_parent_plan BEFORE INSERT ON production_batch_derivation_parents FOR EACH ROW EXECUTE FUNCTION guard_conversion_parent_binding();
      CREATE FUNCTION guard_conversion_lineage_extension() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF EXISTS(SELECT 1 FROM inv_batches WHERE batch_no=NEW.batch_no) AND EXISTS(SELECT 1 FROM production_batch_qualifications qualifier WHERE qualifier.batch_no=NEW.batch_no
          AND(official_inventory_conversion_related(qualifier.batch_no) OR qualifier.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=qualifier.batch_no))) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_LINEAGE_IMMUTABLE' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_lineage_extension BEFORE INSERT ON production_batch_roots FOR EACH ROW EXECUTE FUNCTION guard_conversion_lineage_extension();
      CREATE FUNCTION guard_conversion_input() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE d record;r record;b record;planned jsonb;used bigint;known boolean;currency text;available_on date;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_FACT_IMMUTABLE' USING ERRCODE='23514';END IF;
        SELECT * INTO d FROM production_conversion_documents WHERE id=NEW.document_id FOR SHARE;
        IF d.state IS DISTINCT FROM 'APPROVED' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_APPROVED_PARENT_REQUIRED' USING ERRCODE='23514';END IF;
        PERFORM official_inventory_lock_operation(NULL,d.company_code,d.warehouse_code,d.product_code,NULL,NULL,'{}'::jsonb);
        PERFORM lock_official_conversion_period(d.id);
        IF TG_OP='UPDATE' THEN
          IF OLD.inventory_ledger_id IS NOT NULL OR NEW.inventory_ledger_id IS NULL OR OLD.parent_batch_no IS NULL
            OR(to_jsonb(OLD)-'inventory_ledger_id') IS DISTINCT FROM(to_jsonb(NEW)-'inventory_ledger_id')
            OR OLD.posting_transaction_id<>pg_current_xact_id() THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_FACT_IMMUTABLE' USING ERRCODE='23514';END IF;
          RETURN NEW;
        END IF;
        planned=d.payload->'inputs'->(NEW.line_no-1);
        IF planned IS NULL OR NEW.source_snapshot IS DISTINCT FROM planned OR NEW.quantity IS DISTINCT FROM(planned->>'quantity')::integer
          OR NEW.grade_code IS DISTINCT FROM planned->>'gradeCode' OR NEW.inventory_ledger_id IS NOT NULL
          OR NEW.raw_segment_id::text IS DISTINCT FROM planned->>'rawSegmentId' OR NEW.parent_batch_no IS DISTINCT FROM planned->>'parentBatchNo'
          OR NEW.cost_status IS DISTINCT FROM planned->>'costStatus' OR NEW.unit_cost IS DISTINCT FROM(planned->>'unitCost')::numeric
          OR NEW.known_amount IS DISTINCT FROM(planned->>'knownAmount')::numeric OR NEW.currency_code IS DISTINCT FROM planned->>'currencyCode'
          OR NEW.posting_transaction_id<>pg_current_xact_id()
          OR NEW.recorded_unit_cost IS DISTINCT FROM(planned->>'recordedUnitCost')::numeric
          OR NEW.recorded_amount IS DISTINCT FROM(planned->>'recordedAmount')::numeric
          OR planned->>'companyCode' IS DISTINCT FROM d.company_code OR planned->>'warehouseCode' IS DISTINCT FROM d.warehouse_code THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_INPUT_PLAN_HOLD' USING ERRCODE='23514';END IF;
        IF NEW.raw_segment_id IS NOT NULL THEN
          SELECT s.*,receipt.company_code,receipt.warehouse_code,receipt.production_date,receipt.state AS receipt_state,receipt.scope_id,receipt.payload->'profile' AS profile INTO r
            FROM production_raw_receipt_segments s JOIN production_raw_receipts receipt ON receipt.id=s.receipt_id WHERE s.id=NEW.raw_segment_id FOR UPDATE OF s;
          PERFORM 1 FROM production_cutover_scopes WHERE id=r.scope_id FOR SHARE;
          IF r.id IS NULL OR r.receipt_state<>'POSTED' OR r.company_code<>d.company_code OR r.warehouse_code<>d.warehouse_code
            OR r.grade_code<>NEW.grade_code OR r.production_date+30<d.expected_posting_date OR r.production_date>d.operation_date
            OR planned->>'productionDate' IS DISTINCT FROM r.production_date::text OR planned->>'expireDate' IS DISTINCT FROM(r.production_date+30)::text
            OR planned->>'rawReceiptId' IS DISTINCT FROM r.receipt_id::text
            OR planned->'actualSourceSnapshot' IS DISTINCT FROM r.snapshot OR planned->>'sourceKey' IS DISTINCT FROM r.source_key
            OR planned->>'reportHash' IS DISTINCT FROM r.report_hash
            OR NOT EXISTS(SELECT 1 FROM mst_products WHERE product_code=d.product_code AND variety_code IS NOT DISTINCT FROM(r.profile->>'varietyCode'))
            OR NOT EXISTS(SELECT 1 FROM production_cutover_scopes scope WHERE scope.id=r.scope_id AND scope.state='ACTIVE') THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_RAW_SOURCE_HOLD' USING ERRCODE='23514';END IF;
          SELECT COALESCE(SUM(i.quantity),0) INTO used FROM production_conversion_inputs i JOIN production_conversion_documents doc ON doc.id=i.document_id
            WHERE i.raw_segment_id=NEW.raw_segment_id AND(doc.state='POSTED' OR doc.id=d.id);
          IF used+NEW.quantity>r.quantity THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_RAW_CAPACITY_HOLD' USING ERRCODE='23514';END IF;
        ELSE
          SELECT * INTO b FROM inv_batches WHERE batch_no=NEW.parent_batch_no FOR UPDATE;
          available_on=official_conversion_parent_available_on(NEW.parent_batch_no);
          IF b.batch_no IS NULL OR b.company_code<>d.company_code OR b.warehouse_code<>d.warehouse_code OR b.unit IS DISTINCT FROM '枚'
            OR b.status IS DISTINCT FROM 'AVAILABLE' OR b.qty<NEW.quantity OR b.qty_available<NEW.quantity
            OR b.egg_date IS NULL OR b.expire_date IS NULL OR b.expire_date<d.expected_posting_date
            OR COALESCE(b.grade_code_std,b.quality_grade) IS DISTINCT FROM NEW.grade_code OR b.egg_date>d.operation_date
            OR available_on IS NULL OR available_on>d.operation_date OR planned->>'availableOn' IS DISTINCT FROM available_on::text
            OR planned->>'productCode' IS DISTINCT FROM b.product_code OR planned->>'skuCode' IS DISTINCT FROM b.sku_code
            OR planned->>'productionDate' IS DISTINCT FROM b.egg_date::text OR planned->>'expireDate' IS DISTINCT FROM b.expire_date::text
            OR NOT official_inventory_writable(b.batch_no,b.company_code,b.warehouse_code,b.product_code,b.sku_code,b.material_code)
            OR NOT EXISTS(SELECT 1 FROM production_batch_qualifications qualifier WHERE qualifier.batch_no=b.batch_no AND qualifier.disposition='QUALIFIED') THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_STOCK_SOURCE_HOLD' USING ERRCODE='23514';END IF;
          known=official_inventory_cost_known(b.batch_no);currency=CASE WHEN known THEN official_inventory_proven_currency(b.batch_no) ELSE NULL END;
          IF NEW.cost_status IS DISTINCT FROM(CASE WHEN known AND currency IS NOT NULL THEN 'CONFIRMED' ELSE 'UNKNOWN' END)
            OR NEW.currency_code IS DISTINCT FROM currency
            OR known AND(NEW.recorded_unit_cost IS DISTINCT FROM b.unit_cost OR NEW.recorded_amount IS DISTINCT FROM b.unit_cost*NEW.quantity)
            OR NOT known AND(NEW.recorded_unit_cost IS NOT NULL OR NEW.recorded_amount IS NOT NULL)
            OR NEW.unit_cost IS DISTINCT FROM(CASE WHEN currency IS NOT NULL THEN b.unit_cost ELSE NULL END)
            OR NEW.known_amount IS DISTINCT FROM(CASE WHEN currency IS NOT NULL THEN b.unit_cost*NEW.quantity ELSE NULL END) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_INPUT_COST_HOLD' USING ERRCODE='23514';END IF;
          IF b.qty IS DISTINCT FROM(SELECT COALESCE(SUM(qty_change),0) FROM inv_ledger WHERE batch_no=b.batch_no AND change_type NOT IN('RESERVED','RELEASED')) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_ORIGINAL_LEDGER_HOLD' USING ERRCODE='23514';END IF;
          SELECT COALESCE(array_agg(id ORDER BY id),'{}'::bigint[]) INTO NEW.ledger_ids_before FROM inv_ledger
            WHERE batch_no=b.batch_no AND change_type NOT IN('RESERVED','RELEASED');
        END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_input BEFORE INSERT OR UPDATE OR DELETE ON production_conversion_inputs
        FOR EACH ROW EXECUTE FUNCTION guard_conversion_input();
      CREATE FUNCTION capture_conversion_inventory_debit() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE input record;
      BEGIN
        IF(OLD.qty,OLD.qty_available) IS NOT DISTINCT FROM(NEW.qty,NEW.qty_available) THEN RETURN NEW;END IF;
        SELECT i.* INTO input FROM production_conversion_inputs i JOIN production_conversion_documents d ON d.id=i.document_id
          WHERE i.parent_batch_no=OLD.batch_no AND d.state IN('APPROVED','POSTED')
          AND i.posting_transaction_id=pg_current_xact_id() FOR UPDATE OF i;
        IF NOT FOUND THEN RETURN NEW;END IF;
        IF EXISTS(SELECT 1 FROM production_conversion_inventory_debits WHERE input_id=input.id)
          OR NEW.qty IS DISTINCT FROM OLD.qty-input.quantity OR NEW.qty_available IS DISTINCT FROM OLD.qty_available-input.quantity
          OR(to_jsonb(OLD)-ARRAY['qty','qty_available','updated_at']) IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['qty','qty_available','updated_at']) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_PAIRED_DEBIT_HOLD' USING ERRCODE='23514';END IF;
        INSERT INTO production_conversion_inventory_debits(input_id,parent_batch_no,quantity_before,quantity_after,available_before,available_after)
          VALUES(input.id,OLD.batch_no,OLD.qty,NEW.qty,OLD.qty_available,NEW.qty_available);
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_inventory_debit BEFORE UPDATE ON inv_batches FOR EACH ROW EXECUTE FUNCTION capture_conversion_inventory_debit();
      CREATE FUNCTION guard_conversion_fact_immutable() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN RAISE EXCEPTION 'OFFICIAL_CONVERSION_FACT_IMMUTABLE' USING ERRCODE='23514';END $body$;
      CREATE TRIGGER trg_conversion_outputs_immutable BEFORE UPDATE OR DELETE ON production_conversion_outputs
        FOR EACH ROW EXECUTE FUNCTION guard_conversion_fact_immutable();
      CREATE TRIGGER trg_conversion_debits_immutable BEFORE UPDATE OR DELETE ON production_conversion_inventory_debits
        FOR EACH ROW EXECUTE FUNCTION guard_conversion_fact_immutable();`);
  }

  private async installPostingChecks(q:QueryRunner):Promise<void>{
    await q.query(`CREATE FUNCTION guard_conversion_output() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE d record;planned jsonb;b record;qualifier record;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        SELECT * INTO d FROM production_conversion_documents WHERE id=NEW.document_id FOR SHARE;
        planned=d.payload->'outputs'->(NEW.line_no-1);
        IF d.state IS DISTINCT FROM 'APPROVED' OR planned IS NULL OR NEW.source_snapshot IS DISTINCT FROM planned
          OR NEW.quantity IS DISTINCT FROM(planned->>'quantity')::integer OR NEW.output_kind IS DISTINCT FROM planned->>'outputKind'
          OR NEW.grade_code IS DISTINCT FROM planned->>'gradeCode' OR NEW.sku_code IS DISTINCT FROM planned->>'skuCode'
          OR NEW.location_code IS DISTINCT FROM planned->>'locationCode' OR NEW.loss_reason IS DISTINCT FROM planned->>'lossReason'
          OR NEW.evidence_file_id IS DISTINCT FROM planned->>'evidenceFileId' THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_OUTPUT_PLAN_HOLD' USING ERRCODE='23514';END IF;
        IF NEW.output_kind<>'LOSS' THEN
          SELECT * INTO b FROM inv_batches WHERE batch_no=NEW.batch_no FOR SHARE;
          SELECT * INTO qualifier FROM production_batch_qualifications WHERE batch_no=NEW.batch_no;
          IF b.batch_no IS NULL OR b.batch_no<>'CVT-'||replace(d.id::text,'-','')||'-'||NEW.line_no::text
            OR b.company_code<>d.company_code OR b.warehouse_code<>d.warehouse_code OR b.sku_code<>NEW.sku_code
            OR b.location_code<>NEW.location_code OR b.qty<>NEW.quantity OR b.product_code IS DISTINCT FROM d.payload->>'productCode'
            OR b.source_no<>d.document_no OR b.source_type<>'CONVERSION' OR b.unit IS DISTINCT FROM '枚'
            OR b.status IS DISTINCT FROM planned->>'inventoryStatus'
            OR b.egg_date IS DISTINCT FROM(SELECT MIN((source_snapshot->>'productionDate')::date) FROM production_conversion_inputs WHERE document_id=d.id)
            OR b.expire_date IS DISTINCT FROM(SELECT MIN((source_snapshot->>'expireDate')::date) FROM production_conversion_inputs WHERE document_id=d.id)
            OR COALESCE(b.grade_code_std,b.quality_grade) IS DISTINCT FROM NEW.grade_code
            OR NOT EXISTS(SELECT 1 FROM product_skus sku WHERE sku.sku_code=b.sku_code AND sku.product_code=b.product_code AND sku.grade_code=NEW.grade_code)
            OR NOT EXISTS(SELECT 1 FROM wms_locations location WHERE location.location_code=b.location_code AND location.warehouse_code=d.warehouse_code AND location.status IN('ACTIVE','NORMAL'))
            OR qualifier.conversion_document_id IS DISTINCT FROM d.id OR qualifier.conversion_output_no IS DISTINCT FROM NEW.line_no
            OR qualifier.processing_stage IS DISTINCT FROM(CASE WHEN NEW.output_kind='WIP' THEN 'WIP' ELSE 'FINISHED' END)
            OR qualifier.cost_status IS DISTINCT FROM 'UNKNOWN' THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_OUTPUT_IDENTITY_HOLD' USING ERRCODE='23514';END IF;
        ELSIF NOT EXISTS(SELECT 1 FROM sys_dict WHERE dict_type='PRODUCTION_CONVERSION_LOSS_REASON' AND dict_code=NEW.loss_reason AND status='ACTIVE') THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_LOSS_REASON_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_output BEFORE INSERT ON production_conversion_outputs FOR EACH ROW EXECUTE FUNCTION guard_conversion_output();
      CREATE FUNCTION guard_conversion_debit_capture() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_ACTUAL_DEBIT_REQUIRED' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_conversion_debit_capture BEFORE INSERT ON production_conversion_inventory_debits FOR EACH ROW EXECUTE FUNCTION guard_conversion_debit_capture();
      CREATE FUNCTION guard_conversion_ledger() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE d record;i record;qualifier record;planned jsonb;
      BEGIN
        IF NEW.change_type='CONVERSION_OUT' THEN
          SELECT input.* INTO i FROM production_conversion_inputs input JOIN production_conversion_documents doc ON doc.id=input.document_id
            WHERE doc.document_no=NEW.ref_no AND doc.state='APPROVED' AND input.parent_batch_no=NEW.batch_no
              AND input.inventory_ledger_id IS NULL FOR SHARE OF input;
          IF i.id IS NULL OR NEW.qty_change IS DISTINCT FROM -i.quantity OR NEW.cost_change IS DISTINCT FROM -i.recorded_amount
            OR NOT EXISTS(SELECT 1 FROM production_conversion_inventory_debits WHERE input_id=i.id) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_DEBIT_LEDGER_HOLD' USING ERRCODE='23514';END IF;
        END IF;
        SELECT * INTO qualifier FROM production_batch_qualifications WHERE batch_no=NEW.batch_no;
        IF NEW.qty_change<0 AND left(NEW.change_type,7)='DEFECT_' AND NEW.change_type<>'DEFECT_TRANSFER_OUT'
          AND(official_inventory_conversion_related(NEW.batch_no) OR qualifier.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=NEW.batch_no)) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_DISPOSITION_CUSTODY_REQUIRED' USING ERRCODE='23514';END IF;
        IF qualifier.processing_stage='WIP' AND NEW.change_type IN('FIFO_OUT','SALE_OUTBOUND') THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_WIP_SALE_HOLD' USING ERRCODE='23514';END IF;
        IF qualifier.conversion_document_id IS NOT NULL AND NEW.qty_change>0 AND NEW.change_type<>'RELEASED' THEN
          SELECT * INTO d FROM production_conversion_documents WHERE id=qualifier.conversion_document_id;
          planned=d.payload->'outputs'->(qualifier.conversion_output_no-1);
          IF NEW.change_type<>'CONVERSION_IN' OR d.state IS DISTINCT FROM 'APPROVED' OR NEW.ref_no IS DISTINCT FROM d.document_no
            OR NEW.qty_change IS DISTINCT FROM(planned->>'quantity')::integer OR NEW.cost_change IS NOT NULL
            OR EXISTS(SELECT 1 FROM inv_ledger WHERE batch_no=NEW.batch_no AND qty_change>0 AND change_type NOT IN('RESERVED','RELEASED')) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_CREDIT_LEDGER_HOLD' USING ERRCODE='23514';END IF;
        ELSIF NEW.qty_change>0 AND NEW.change_type<>'RELEASED' AND(official_inventory_conversion_related(NEW.batch_no)
          OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=NEW.batch_no)) THEN
          IF NEW.ref_no IS DISTINCT FROM qualifier.source_no OR NEW.change_type NOT IN('TRANSFER_IN','TRANSFER_DAMAGE_INBOUND','SALE_RETURN','DEFECT_TRANSFER_IN')
            OR EXISTS(SELECT 1 FROM inv_ledger WHERE batch_no=NEW.batch_no AND qty_change>0 AND change_type NOT IN('RESERVED','RELEASED')) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_DERIVED_CREDIT_HOLD' USING ERRCODE='23514';END IF;
        ELSIF NEW.change_type='CONVERSION_IN' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_CREDIT_SOURCE_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE UNIQUE INDEX uq_conversion_out_ledger ON inv_ledger(ref_no,batch_no) WHERE change_type='CONVERSION_OUT';
      CREATE UNIQUE INDEX uq_conversion_in_ledger ON inv_ledger(ref_no,batch_no) WHERE change_type='CONVERSION_IN';
      CREATE TRIGGER trg_conversion_ledger BEFORE INSERT ON inv_ledger FOR EACH ROW EXECUTE FUNCTION guard_conversion_ledger();
      CREATE FUNCTION check_conversion_physical_balance() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE batch record;
      BEGIN
        IF NOT official_inventory_conversion_related(NEW.batch_no) AND NOT EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=NEW.batch_no) THEN RETURN NEW;END IF;
        SELECT * INTO batch FROM inv_batches WHERE batch_no=NEW.batch_no;
        IF batch.qty IS NULL OR batch.qty<0 OR batch.qty_available IS NULL OR batch.qty_available<0 OR batch.qty_available>batch.qty
          OR batch.qty IS DISTINCT FROM(SELECT COALESCE(SUM(qty_change),0) FROM inv_ledger WHERE batch_no=NEW.batch_no AND change_type NOT IN('RESERVED','RELEASED')) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_PHYSICAL_BALANCE_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE CONSTRAINT TRIGGER trg_conversion_batch_balance AFTER INSERT OR UPDATE ON inv_batches
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_physical_balance();
      CREATE CONSTRAINT TRIGGER trg_conversion_ledger_balance AFTER INSERT ON inv_ledger
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_physical_balance();
      CREATE FUNCTION assert_official_conversion_posted(p_document uuid) RETURNS void LANGUAGE plpgsql AS $body$
      DECLARE d record;i record;o record;total_input bigint;total_output bigint;grade text;expected_raw uuid[];actual_raw uuid[];expected_inventory text[];actual_inventory text[];
      BEGIN
        SELECT * INTO d FROM production_conversion_documents WHERE id=p_document;
        PERFORM lock_official_conversion_period(d.id);
        IF d.state IS DISTINCT FROM 'POSTED' OR d.posting_date IS DISTINCT FROM d.expected_posting_date
          OR d.posting_date IS DISTINCT FROM(clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date
          OR NOT EXISTS(SELECT 1 FROM sys_user WHERE user_id::text=d.approved_by AND status::text IN('1','ACTIVE'))
          OR NOT EXISTS(SELECT 1 FROM wms_warehouses WHERE warehouse_code=d.warehouse_code AND company_code=d.company_code AND status='ACTIVE')
          OR NOT EXISTS(SELECT 1 FROM production_inventory_domains domain JOIN production_cutover_scopes scope ON scope.id=domain.scope_id
            LEFT JOIN production_inventory_domain_states state ON state.company_code=domain.company_code AND state.warehouse_code=domain.warehouse_code AND state.product_code=domain.product_code
            WHERE domain.company_code=d.company_code AND domain.warehouse_code=d.warehouse_code AND domain.product_code=d.payload->>'productCode'
              AND(scope.state='ACTIVE' AND state.id IS NULL OR state.state='ACTIVE')) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_POSTED_PARENT_HOLD' USING ERRCODE='23514';END IF;
        SELECT COALESCE(SUM(quantity),0) INTO total_input FROM production_conversion_inputs WHERE document_id=d.id;
        SELECT COALESCE(SUM(quantity),0) INTO total_output FROM production_conversion_outputs WHERE document_id=d.id;
        IF total_input<=0 OR total_input<>total_output
          OR(SELECT COUNT(*) FROM production_conversion_inputs WHERE document_id=d.id)<>jsonb_array_length(d.payload->'inputs')
          OR(SELECT COUNT(*) FROM production_conversion_outputs WHERE document_id=d.id)<>jsonb_array_length(d.payload->'outputs')
          OR d.receipt->>'documentId' IS DISTINCT FROM d.id::text OR d.receipt->>'documentNo' IS DISTINCT FROM d.document_no
          OR(d.receipt->>'inputQuantity')::bigint IS DISTINCT FROM total_input
          OR(d.receipt->>'outputQuantity')::bigint IS DISTINCT FROM(SELECT COALESCE(SUM(quantity),0) FROM production_conversion_outputs WHERE document_id=d.id AND output_kind<>'LOSS')
          OR(d.receipt->>'lossQuantity')::bigint IS DISTINCT FROM(SELECT COALESCE(SUM(quantity),0) FROM production_conversion_outputs WHERE document_id=d.id AND output_kind='LOSS')
          OR d.receipt->>'postingDate' IS DISTINCT FROM d.posting_date::text OR d.receipt->>'costStatus' IS DISTINCT FROM 'PENDING_ALLOCATION'
          OR d.receipt->'batches' IS DISTINCT FROM(SELECT COALESCE(jsonb_agg(jsonb_build_object('batchNo',batch_no,'outputKind',output_kind,
            'skuCode',sku_code,'gradeCode',grade_code,'quantity',quantity,'warehouseCode',d.warehouse_code,'locationCode',location_code) ORDER BY line_no),'[]'::jsonb)
            FROM production_conversion_outputs WHERE document_id=d.id AND output_kind<>'LOSS') THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_CONSERVATION_HOLD' USING ERRCODE='23514';END IF;
        FOREACH grade IN ARRAY ARRAY['DIRTY','BROKEN'] LOOP
          IF(SELECT COALESCE(SUM(quantity),0) FROM production_conversion_inputs WHERE document_id=d.id AND grade_code=grade)
            IS DISTINCT FROM(SELECT COALESCE(SUM(quantity),0) FROM production_conversion_outputs WHERE document_id=d.id AND grade_code=grade) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_DEFECT_CONSERVATION_HOLD' USING ERRCODE='23514';END IF;
        END LOOP;
        FOR i IN SELECT * FROM production_conversion_inputs WHERE document_id=d.id LOOP
          IF i.raw_segment_id IS NOT NULL THEN
            IF(SELECT SUM(input.quantity) FROM production_conversion_inputs input JOIN production_conversion_documents doc ON doc.id=input.document_id
              WHERE input.raw_segment_id=i.raw_segment_id AND doc.state='POSTED')>(SELECT quantity FROM production_raw_receipt_segments WHERE id=i.raw_segment_id) THEN
              RAISE EXCEPTION 'OFFICIAL_CONVERSION_RAW_CAPACITY_HOLD' USING ERRCODE='23514';END IF;
          ELSE
            IF NOT EXISTS(SELECT 1 FROM inv_ledger ledger JOIN production_conversion_inventory_debits debit ON debit.input_id=i.id
              JOIN inv_batches batch ON batch.batch_no=i.parent_batch_no WHERE ledger.id=i.inventory_ledger_id AND ledger.batch_no=i.parent_batch_no
                AND ledger.change_type='CONVERSION_OUT' AND ledger.ref_no=d.document_no AND ledger.company_code=d.company_code
                AND ledger.warehouse_code=d.warehouse_code AND ledger.qty_change=-i.quantity AND ledger.cost_change IS NOT DISTINCT FROM -i.recorded_amount
                AND debit.quantity_after=debit.quantity_before-i.quantity AND debit.available_after=debit.available_before-i.quantity
                AND batch.qty=debit.quantity_after AND batch.qty_available=debit.available_after)
              OR(SELECT COALESCE(array_agg(ledger.id ORDER BY ledger.id),'{}'::bigint[]) FROM inv_ledger ledger WHERE ledger.batch_no=i.parent_batch_no
                AND ledger.change_type NOT IN('RESERVED','RELEASED') AND NOT ledger.id=ANY(i.ledger_ids_before)) IS DISTINCT FROM ARRAY[i.inventory_ledger_id]
              OR(SELECT COUNT(*) FROM inv_ledger WHERE batch_no=i.parent_batch_no AND ref_no=d.document_no AND change_type='CONVERSION_OUT')<>1 THEN
              RAISE EXCEPTION 'OFFICIAL_CONVERSION_PAIRED_DEBIT_HOLD' USING ERRCODE='23514';END IF;
          END IF;
        END LOOP;
        SELECT array_agg(root ORDER BY root) INTO expected_raw FROM(
          SELECT raw_segment_id AS root FROM production_conversion_inputs WHERE document_id=d.id AND raw_segment_id IS NOT NULL
          UNION SELECT root.raw_segment_id FROM production_batch_raw_roots root JOIN production_conversion_inputs input ON input.parent_batch_no=root.batch_no WHERE input.document_id=d.id
        ) roots;
        SELECT array_agg(root ORDER BY root) INTO expected_inventory FROM(
          SELECT q.batch_no AS root FROM production_conversion_inputs input JOIN production_batch_qualifications q ON q.batch_no=input.parent_batch_no
            WHERE input.document_id=d.id AND q.origin_kind<>'DERIVED'
          UNION SELECT root.root_batch_no FROM production_batch_roots root JOIN production_conversion_inputs input ON input.parent_batch_no=root.batch_no WHERE input.document_id=d.id
        ) roots;
        FOR o IN SELECT * FROM production_conversion_outputs WHERE document_id=d.id LOOP
          IF NOT EXISTS(SELECT 1 FROM file_metadata file WHERE file.file_id=o.evidence_file_id AND file.status='ACTIVE' AND file.deleted_at IS NULL
            AND file.visibility IN('PROTECTED','PRIVATE') AND file.module_code='PRODUCTION_CONVERSION' AND file.owner_type='WAREHOUSE'
            AND file.owner_id=d.warehouse_code AND file.company_code=d.company_code AND file.checksum=o.source_snapshot->>'evidenceChecksum') THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_OUTPUT_EVIDENCE_HOLD' USING ERRCODE='23514';END IF;
          IF o.output_kind='LOSS' THEN CONTINUE;END IF;
          IF NOT EXISTS(SELECT 1 FROM inv_ledger ledger JOIN inv_batches batch ON batch.batch_no=o.batch_no
            WHERE ledger.id=o.inventory_ledger_id AND ledger.batch_no=o.batch_no AND ledger.change_type='CONVERSION_IN'
              AND ledger.ref_no=d.document_no AND ledger.company_code=d.company_code AND ledger.warehouse_code=d.warehouse_code
              AND ledger.location_code=o.location_code AND ledger.sku_code=o.sku_code AND ledger.qty_change=o.quantity AND ledger.cost_change IS NULL
              AND batch.status IS NOT DISTINCT FROM(o.source_snapshot->>'inventoryStatus')
              AND batch.qty=o.quantity AND batch.unit_cost=0 AND batch.inventory_class=CASE WHEN o.output_kind='WIP' THEN 'WIP'
                WHEN o.grade_code IN('DIRTY','BROKEN') THEN 'DEFECT_SALE' ELSE 'STANDARD' END
              AND batch.qty_available=CASE WHEN batch.status='AVAILABLE' THEN o.quantity ELSE 0 END) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_PAIRED_CREDIT_HOLD' USING ERRCODE='23514';END IF;
          SELECT array_agg(raw_segment_id ORDER BY raw_segment_id) INTO actual_raw FROM production_batch_raw_roots WHERE batch_no=o.batch_no;
          SELECT array_agg(root_batch_no ORDER BY root_batch_no) INTO actual_inventory FROM production_batch_roots WHERE batch_no=o.batch_no;
          IF actual_raw IS DISTINCT FROM expected_raw OR actual_inventory IS DISTINCT FROM expected_inventory
            OR expected_raw IS NULL AND expected_inventory IS NULL THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_COMPLETE_ROOTS_HOLD' USING ERRCODE='23514';END IF;
        END LOOP;
      END $body$;
      CREATE FUNCTION check_conversion_posted_projection() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF TG_TABLE_NAME='production_conversion_documents' THEN
          IF NEW.state<>'POSTED' THEN RETURN NEW;END IF;PERFORM assert_official_conversion_posted(NEW.id);
        ELSE IF NOT EXISTS(SELECT 1 FROM production_conversion_documents WHERE id=NEW.document_id AND state='POSTED') THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_POSTED_PARENT_HOLD' USING ERRCODE='23514';END IF;END IF;
        RETURN NEW;
      END $body$;
      CREATE FUNCTION assert_official_conversion_derivation(p_batch text) RETURNS void LANGUAGE plpgsql AS $body$
      DECLARE qualifier record;target record;parent record;expected_raw uuid[];actual_raw uuid[];has_parents boolean:=false;
        actual_parents text[];candidate_parents text[];bound_parents text[];expected_inventory text[];actual_inventory text[];restricted boolean;
      BEGIN
        SELECT * INTO qualifier FROM production_batch_qualifications WHERE batch_no=p_batch;
        IF qualifier.conversion_document_id IS NOT NULL THEN
          IF NOT EXISTS(SELECT 1 FROM production_conversion_outputs o WHERE o.document_id=qualifier.conversion_document_id
            AND o.line_no=qualifier.conversion_output_no AND o.batch_no=qualifier.batch_no
            AND EXISTS(SELECT 1 FROM production_conversion_documents WHERE id=o.document_id AND state='POSTED')) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_OUTPUT_ADMISSION_HOLD' USING ERRCODE='23514';END IF;
          RETURN;
        END IF;
        -- The real business relation determines parents; target flags and supplied root rows cannot opt out.
        IF to_regclass('wms_transfer_items') IS NOT NULL THEN
          SELECT array_agg(DISTINCT source_batch_no ORDER BY source_batch_no) INTO actual_parents FROM wms_transfer_items
            WHERE target_batch_no=p_batch OR damaged_batch_no=p_batch;
        END IF;
        IF to_regclass('wms_defect_dispositions') IS NOT NULL THEN
          SELECT array_agg(DISTINCT batch_no ORDER BY batch_no) INTO candidate_parents FROM wms_defect_dispositions
            WHERE target_batch_no=p_batch AND action='TRANSFER';
          actual_parents=actual_parents||candidate_parents;
        END IF;
        IF to_regclass('sal_return_items') IS NOT NULL AND p_batch LIKE 'RET-%' THEN
          EXECUTE 'SELECT array_agg(DISTINCT allocation.batch_no ORDER BY allocation.batch_no) FROM sal_return_orders header
            JOIN sal_return_items item ON item.return_order_id=header.id
            JOIN sal_order_item_batch_allocations allocation ON allocation.sales_order_item_id=item.sales_order_item_id AND allocation.outbound_qty>0
            WHERE $1=''RET-''||header.return_no||''-''||item.id::text' INTO candidate_parents USING p_batch;
          actual_parents=actual_parents||candidate_parents;
        END IF;
        IF to_regclass('store_sale_allocations') IS NOT NULL AND p_batch LIKE 'RET-%' THEN
          EXECUTE 'SELECT array_agg(DISTINCT allocation.batch_no ORDER BY allocation.batch_no) FROM store_sale_allocations allocation
            JOIN sal_store_sales sale ON sale.id=allocation.sale_id WHERE $1=''RET-''||sale.sale_no||''-''||allocation.id::text'
            INTO candidate_parents USING p_batch;
          actual_parents=actual_parents||candidate_parents;
        END IF;
        SELECT array_agg(DISTINCT value ORDER BY value) INTO actual_parents FROM unnest(actual_parents) value;
        restricted=official_inventory_conversion_related(p_batch) OR COALESCE(qualifier.processing_stage='WIP',false) OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=p_batch)
          OR EXISTS(SELECT 1 FROM production_batch_qualifications source WHERE source.batch_no=ANY(actual_parents)
            AND(official_inventory_conversion_related(source.batch_no) OR source.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=source.batch_no)));
        IF NOT restricted THEN RETURN;END IF;
        IF qualifier.disposition IS DISTINCT FROM 'QUALIFIED' OR qualifier.origin_kind IS DISTINCT FROM 'DERIVED' OR qualifier.conversion_document_id IS NOT NULL THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_DERIVATION_PROOF_HOLD' USING ERRCODE='23514';END IF;
        SELECT array_agg(parent_batch_no ORDER BY parent_batch_no) INTO bound_parents FROM production_batch_derivation_parents WHERE batch_no=qualifier.batch_no;
        IF actual_parents IS NULL OR actual_parents IS DISTINCT FROM bound_parents THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_DERIVATION_PROOF_HOLD' USING ERRCODE='23514';END IF;
        SELECT * INTO target FROM inv_batches WHERE batch_no=qualifier.batch_no;
        IF target.batch_no IS NULL OR qualifier.origin_kind<>'DERIVED' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_DERIVATION_PROOF_HOLD' USING ERRCODE='23514';END IF;
        FOR parent IN SELECT p.parent_batch_no,b.* FROM production_batch_derivation_parents p JOIN inv_batches b ON b.batch_no=p.parent_batch_no
          WHERE p.batch_no=qualifier.batch_no ORDER BY p.parent_batch_no LOOP
          has_parents=true;
          IF parent.company_code<>target.company_code OR parent.product_code<>target.product_code
            OR parent.qty IS DISTINCT FROM(SELECT COALESCE(SUM(qty_change),0) FROM inv_ledger WHERE batch_no=parent.parent_batch_no AND change_type NOT IN('RESERVED','RELEASED')) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_DERIVATION_BALANCE_HOLD' USING ERRCODE='23514';END IF;
          IF qualifier.source_type IN('TRANSFER','TRANSFER_DAMAGE') AND to_regclass('wms_transfer_items') IS NOT NULL AND to_regclass('wms_transfer') IS NOT NULL THEN
            IF NOT EXISTS(SELECT 1 FROM wms_transfer_items item JOIN wms_transfer transfer ON transfer.transfer_no=item.transfer_no
              WHERE transfer.transfer_no=qualifier.source_no AND transfer.status IN('RECEIVED','COMPLETED') AND transfer.received_at IS NOT NULL AND item.source_batch_no=parent.parent_batch_no
                AND transfer.from_warehouse=parent.warehouse_code AND transfer.to_warehouse=target.warehouse_code
                AND(qualifier.source_type='TRANSFER' AND item.target_batch_no=target.batch_no AND item.received_qty>0
                  AND target.qty=item.received_qty AND EXISTS(SELECT 1 FROM inv_ledger l WHERE l.batch_no=target.batch_no AND l.ref_no=transfer.transfer_no
                    AND l.change_type='TRANSFER_IN' AND l.qty_change=item.received_qty)
                  OR qualifier.source_type='TRANSFER_DAMAGE' AND item.damaged_batch_no=target.batch_no AND item.damaged_qty>0 AND target.qty=item.damaged_qty
                    AND EXISTS(SELECT 1 FROM inv_ledger l WHERE l.batch_no=target.batch_no AND l.ref_no=transfer.transfer_no AND l.change_type='TRANSFER_DAMAGE_INBOUND' AND l.qty_change=item.damaged_qty))
                AND(SELECT SUM(l.qty_change) FROM inv_ledger l WHERE l.batch_no=parent.parent_batch_no AND l.ref_no=transfer.transfer_no AND l.change_type='TRANSFER_OUT')
                  =-(SELECT SUM(original.expected_qty) FROM wms_transfer_items original WHERE original.transfer_no=transfer.transfer_no AND original.source_batch_no=parent.parent_batch_no)) THEN
              RAISE EXCEPTION 'OFFICIAL_CONVERSION_TRANSFER_PROOF_HOLD' USING ERRCODE='23514';END IF;
          ELSIF qualifier.source_type='DEFECT_TRANSFER' AND to_regclass('wms_defect_dispositions') IS NOT NULL THEN
            IF NOT EXISTS(SELECT 1 FROM wms_defect_dispositions disposition WHERE disposition.disposition_no=qualifier.source_no
              AND disposition.status='DONE' AND disposition.action='TRANSFER' AND disposition.batch_no=parent.parent_batch_no AND disposition.target_batch_no=target.batch_no
              AND disposition.warehouse_code=parent.warehouse_code AND disposition.target_warehouse_code=target.warehouse_code AND disposition.company_code=target.company_code
              AND target.qty=disposition.qty AND(SELECT SUM(qty_change) FROM inv_ledger WHERE batch_no=parent.parent_batch_no AND ref_no=disposition.disposition_no AND change_type='DEFECT_TRANSFER_OUT')=-disposition.qty
              AND(SELECT SUM(qty_change) FROM inv_ledger WHERE batch_no=target.batch_no AND ref_no=disposition.disposition_no AND change_type='DEFECT_TRANSFER_IN')=disposition.qty) THEN
              RAISE EXCEPTION 'OFFICIAL_CONVERSION_DEFECT_TRANSFER_PROOF_HOLD' USING ERRCODE='23514';END IF;
          ELSE
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_DERIVATION_PROOF_HOLD' USING ERRCODE='23514';
          END IF;
        END LOOP;
        IF NOT has_parents THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_DERIVATION_PROOF_HOLD' USING ERRCODE='23514';END IF;
        SELECT array_agg(root ORDER BY root) INTO expected_raw FROM(SELECT DISTINCT r.raw_segment_id AS root FROM production_batch_raw_roots r
          JOIN production_batch_derivation_parents p ON p.parent_batch_no=r.batch_no WHERE p.batch_no=qualifier.batch_no) roots;
        SELECT array_agg(raw_segment_id ORDER BY raw_segment_id) INTO actual_raw FROM production_batch_raw_roots WHERE batch_no=qualifier.batch_no;
        SELECT array_agg(root ORDER BY root) INTO expected_inventory FROM(SELECT source.batch_no AS root FROM production_batch_derivation_parents p
          JOIN production_batch_qualifications source ON source.batch_no=p.parent_batch_no WHERE p.batch_no=qualifier.batch_no AND source.origin_kind<>'DERIVED'
          UNION SELECT root.root_batch_no FROM production_batch_roots root JOIN production_batch_derivation_parents p ON p.parent_batch_no=root.batch_no
            WHERE p.batch_no=qualifier.batch_no) roots;
        SELECT array_agg(root_batch_no ORDER BY root_batch_no) INTO actual_inventory FROM production_batch_roots WHERE batch_no=qualifier.batch_no;
        IF actual_raw IS DISTINCT FROM expected_raw OR actual_inventory IS DISTINCT FROM expected_inventory OR qualifier.processing_stage IS DISTINCT FROM(CASE WHEN EXISTS(
          SELECT 1 FROM production_batch_derivation_parents p JOIN production_batch_qualifications source ON source.batch_no=p.parent_batch_no
          WHERE p.batch_no=qualifier.batch_no AND source.processing_stage='WIP') THEN 'WIP' ELSE 'FINISHED' END) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_DERIVATION_ROOTS_HOLD' USING ERRCODE='23514';END IF;
        RETURN;
      END $body$;
      CREATE FUNCTION check_conversion_source_admission() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN PERFORM assert_official_conversion_derivation(NEW.batch_no);RETURN NEW;END $body$;
      CREATE CONSTRAINT TRIGGER trg_conversion_qualification_admission AFTER INSERT ON production_batch_qualifications
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_source_admission();
      CREATE CONSTRAINT TRIGGER trg_conversion_raw_admission AFTER INSERT ON production_batch_raw_roots
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_source_admission();
      CREATE CONSTRAINT TRIGGER trg_conversion_parent_admission AFTER INSERT ON production_batch_derivation_parents
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_source_admission();
      CREATE CONSTRAINT TRIGGER trg_conversion_inventory_root_admission AFTER INSERT ON production_batch_roots
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_source_admission();
      CREATE TRIGGER trg_conversion_parents_immutable BEFORE UPDATE OR DELETE ON production_batch_derivation_parents
        FOR EACH ROW EXECUTE FUNCTION guard_conversion_fact_immutable();
      CREATE CONSTRAINT TRIGGER trg_conversion_posted AFTER UPDATE ON production_conversion_documents
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_posted_projection();
      CREATE CONSTRAINT TRIGGER trg_conversion_input_posted AFTER INSERT OR UPDATE ON production_conversion_inputs
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_posted_projection();
      CREATE CONSTRAINT TRIGGER trg_conversion_output_posted AFTER INSERT ON production_conversion_outputs
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_posted_projection();`);
    await q.query(`CREATE FUNCTION guard_conversion_business_binding() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE row_data jsonb;old_data jsonb;target text;parent text;finalized boolean:=false;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_OP<>'DELETE' THEN
          FOR target IN SELECT value FROM jsonb_each_text(to_jsonb(NEW)) WHERE key IN('target_batch_no','damaged_batch_no') AND value IS NOT NULL LOOP
            IF target ~* '^CVT-[a-f0-9]{32}-[0-9]+$' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_BUSINESS_TARGET_HOLD' USING ERRCODE='23514';END IF;
          END LOOP;
        END IF;
        IF TG_OP='INSERT' THEN RETURN NEW;END IF;
        old_data=to_jsonb(OLD);parent=COALESCE(old_data->>'source_batch_no',old_data->>'batch_no');
        IF TG_TABLE_NAME='wms_transfer_items' THEN
          SELECT status IN('RECEIVED','COMPLETED') INTO finalized FROM wms_transfer WHERE transfer_no=OLD.transfer_no;
        ELSE finalized=old_data->>'status'='DONE';END IF;
        IF finalized AND EXISTS(SELECT 1 FROM production_batch_qualifications source WHERE source.batch_no=parent
          AND source.disposition='QUALIFIED' AND official_inventory_qualification_controlled(source.batch_no)) THEN
          IF TG_OP='DELETE' OR TG_TABLE_NAME='wms_defect_dispositions' AND old_data IS DISTINCT FROM to_jsonb(NEW)
            OR(old_data-ARRAY['updated_at']) IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['updated_at']) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_BUSINESS_BINDING_IMMUTABLE' USING ERRCODE='23514';END IF;
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END $body$;
      CREATE FUNCTION guard_conversion_transfer_header() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF OLD.status IN('RECEIVED','COMPLETED') AND EXISTS(SELECT 1 FROM wms_transfer_items item
          JOIN production_batch_qualifications source ON source.batch_no=item.source_batch_no WHERE item.transfer_no=OLD.transfer_no
            AND source.disposition='QUALIFIED' AND official_inventory_qualification_controlled(source.batch_no)) THEN
          IF TG_OP='DELETE' OR(to_jsonb(OLD)-ARRAY['updated_at','completed_at','status']) IS DISTINCT FROM(to_jsonb(NEW)-ARRAY['updated_at','completed_at','status'])
            OR(NEW.status=OLD.status AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at OR OLD.status='RECEIVED' AND NEW.status='COMPLETED') IS NOT TRUE THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_TRANSFER_HEADER_IMMUTABLE' USING ERRCODE='23514';END IF;
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END $body$;
      CREATE FUNCTION assert_conversion_business_target(p_batch text,p_type text,p_no text) RETURNS void LANGUAGE plpgsql AS $body$
      DECLARE qualifier record;owners bigint:=0;additional bigint;
      BEGIN
        SELECT * INTO qualifier FROM production_batch_qualifications WHERE batch_no=p_batch;
        IF qualifier.disposition IS DISTINCT FROM 'QUALIFIED' OR qualifier.origin_kind IS DISTINCT FROM 'DERIVED' OR qualifier.conversion_document_id IS NOT NULL
          OR qualifier.source_type IS DISTINCT FROM p_type OR qualifier.source_no IS DISTINCT FROM p_no THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_BUSINESS_TARGET_HOLD' USING ERRCODE='23514';END IF;
        IF to_regclass('wms_transfer_items') IS NOT NULL THEN
          SELECT COUNT(*) INTO owners FROM(SELECT 1 FROM wms_transfer_items WHERE target_batch_no=p_batch
            UNION ALL SELECT 1 FROM wms_transfer_items WHERE damaged_batch_no=p_batch) matches;
        END IF;
        IF to_regclass('wms_defect_dispositions') IS NOT NULL THEN
          SELECT COUNT(*) INTO additional FROM wms_defect_dispositions WHERE target_batch_no=p_batch;owners=owners+additional;
        END IF;
        IF owners<>1 THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_BUSINESS_TARGET_REUSED' USING ERRCODE='23514';END IF;
        PERFORM assert_official_conversion_derivation(p_batch);
      END $body$;
      CREATE FUNCTION assert_conversion_transfer_item(p_id bigint) RETURNS void LANGUAGE plpgsql AS $body$
      DECLARE item record;header record;source record;target text;restricted boolean;target_restricted boolean;
      BEGIN
        SELECT * INTO item FROM wms_transfer_items WHERE id=p_id;
        IF item.id IS NULL THEN RETURN;END IF;
        SELECT * INTO header FROM wms_transfer WHERE transfer_no=item.transfer_no FOR SHARE;
        IF header.status IS DISTINCT FROM 'RECEIVED' AND header.status IS DISTINCT FROM 'COMPLETED' THEN RETURN;END IF;
        SELECT * INTO source FROM inv_batches WHERE batch_no=item.source_batch_no;
        restricted=EXISTS(SELECT 1 FROM production_batch_qualifications q WHERE q.batch_no=item.source_batch_no
          AND(official_inventory_conversion_related(q.batch_no) OR q.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no)));
        target_restricted=EXISTS(SELECT 1 FROM production_batch_qualifications q WHERE q.batch_no IN(item.target_batch_no,item.damaged_batch_no)
          AND(official_inventory_conversion_related(q.batch_no) OR q.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no)));
        IF NOT restricted AND NOT target_restricted THEN RETURN;END IF;
        IF header.received_at IS NULL OR header.from_warehouse IS DISTINCT FROM source.warehouse_code
          OR source.company_code IS DISTINCT FROM(SELECT company_code FROM wms_warehouses WHERE warehouse_code=header.to_warehouse)
          OR item.difference_qty IS DISTINCT FROM item.expected_qty-item.received_qty
          OR header.in_transit_qty IS DISTINCT FROM(SELECT SUM(expected_qty) FROM wms_transfer_items WHERE transfer_no=header.transfer_no)
          OR header.received_qty IS DISTINCT FROM(SELECT SUM(received_qty) FROM wms_transfer_items WHERE transfer_no=header.transfer_no)
          OR header.difference_qty IS DISTINCT FROM(SELECT SUM(difference_qty) FROM wms_transfer_items WHERE transfer_no=header.transfer_no)
          OR source.qty IS DISTINCT FROM(SELECT COALESCE(SUM(qty_change),0) FROM inv_ledger WHERE batch_no=source.batch_no AND change_type NOT IN('RESERVED','RELEASED'))
          OR(SELECT SUM(qty_change) FROM inv_ledger WHERE batch_no=source.batch_no AND ref_no=header.transfer_no AND change_type='TRANSFER_OUT') IS DISTINCT FROM -item.expected_qty
          OR(item.received_qty>0) IS DISTINCT FROM(item.target_batch_no IS NOT NULL)
          OR(item.damaged_qty>0) IS DISTINCT FROM(item.damaged_batch_no IS NOT NULL) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_TRANSFER_ROW_HOLD' USING ERRCODE='23514';END IF;
        IF item.target_batch_no IS NOT NULL THEN PERFORM assert_conversion_business_target(item.target_batch_no,'TRANSFER',header.transfer_no);END IF;
        IF item.damaged_batch_no IS NOT NULL THEN PERFORM assert_conversion_business_target(item.damaged_batch_no,'TRANSFER_DAMAGE',header.transfer_no);END IF;
      END $body$;
      CREATE FUNCTION check_conversion_transfer_projection() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE item record;
      BEGIN
        IF TG_OP='UPDATE' AND OLD.status IN('RECEIVED','COMPLETED') THEN RETURN NEW;END IF;
        FOR item IN SELECT id FROM wms_transfer_items WHERE transfer_no=NEW.transfer_no LOOP PERFORM assert_conversion_transfer_item(item.id);END LOOP;
        RETURN NEW;
      END $body$;
      CREATE FUNCTION check_conversion_business_binding() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE target text;disposition record;restricted boolean;
      BEGIN
        IF TG_OP='UPDATE' AND(to_jsonb(OLD)-'updated_at') IS NOT DISTINCT FROM(to_jsonb(NEW)-'updated_at') THEN RETURN NEW;END IF;
        IF TG_TABLE_NAME='wms_transfer_items' THEN PERFORM assert_conversion_transfer_item(NEW.id);RETURN NEW;END IF;
        SELECT * INTO disposition FROM wms_defect_dispositions WHERE id=NEW.id;
        IF disposition.status IS DISTINCT FROM 'DONE' OR disposition.action<>'TRANSFER' THEN RETURN NEW;END IF;
        restricted=EXISTS(SELECT 1 FROM production_batch_qualifications q WHERE q.batch_no IN(disposition.batch_no,disposition.target_batch_no)
          AND(official_inventory_conversion_related(q.batch_no) OR q.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no)));
        IF restricted THEN
          IF disposition.qty<=0 OR disposition.target_batch_no IS NULL THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_BUSINESS_TARGET_HOLD' USING ERRCODE='23514';END IF;
          PERFORM assert_conversion_business_target(disposition.target_batch_no,'DEFECT_TRANSFER',disposition.disposition_no);
        END IF;
        RETURN NEW;
      END $body$;`);
    for(const table of ['wms_transfer_items','wms_defect_dispositions'])if(await q.hasTable(table)){
      await q.query(`CREATE TRIGGER trg_conversion_business_binding BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION guard_conversion_business_binding();
        CREATE CONSTRAINT TRIGGER trg_conversion_business_projection AFTER INSERT OR UPDATE ON ${table}
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_business_binding()`);
    }
    if(await q.hasTable('wms_transfer'))await q.query(`CREATE TRIGGER trg_conversion_transfer_header BEFORE UPDATE OR DELETE ON wms_transfer FOR EACH ROW EXECUTE FUNCTION guard_conversion_transfer_header();
      CREATE CONSTRAINT TRIGGER trg_conversion_transfer_projection AFTER INSERT OR UPDATE ON wms_transfer DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_transfer_projection()`);
    await this.installReturnHolds(q);
  }

  /** Until actual return custody is implemented, later business relations must not borrow an ordinary qualification. */
  private async installReturnHolds(q:QueryRunner):Promise<void>{
    await q.query(`CREATE FUNCTION assert_conversion_customer_return(p_item bigint) RETURNS void LANGUAGE plpgsql AS $body$
      DECLARE item record;header record;target text;restricted boolean;
      BEGIN
        SELECT * INTO item FROM sal_return_items WHERE id=p_item;IF item.id IS NULL THEN RETURN;END IF;
        SELECT * INTO header FROM sal_return_orders WHERE id=item.return_order_id;
        target='RET-'||header.return_no||'-'||item.id::text;
        restricted=EXISTS(SELECT 1 FROM sal_order_item_batch_allocations allocation JOIN production_batch_qualifications q ON q.batch_no=allocation.batch_no
          WHERE allocation.sales_order_item_id=item.sales_order_item_id AND allocation.outbound_qty>0
          AND(official_inventory_conversion_related(q.batch_no) OR q.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no)))
          OR EXISTS(SELECT 1 FROM production_batch_qualifications q WHERE q.batch_no=target
            AND(official_inventory_conversion_related(q.batch_no) OR q.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no)));
        IF restricted AND(EXISTS(SELECT 1 FROM inv_batches WHERE batch_no=target) OR item.restock_status='RESTOCKED'
          OR header.status='COMPLETED' AND COALESCE(item.accepted_qty,0)+COALESCE(item.damaged_qty,0)>0) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED' USING ERRCODE='23514';END IF;
      END $body$;
      CREATE FUNCTION assert_conversion_pos_return(p_allocation bigint) RETURNS void LANGUAGE plpgsql AS $body$
      DECLARE allocation record;sale record;target text;restricted boolean;
      BEGIN
        SELECT * INTO allocation FROM store_sale_allocations WHERE id=p_allocation;IF allocation.id IS NULL THEN RETURN;END IF;
        SELECT * INTO sale FROM sal_store_sales WHERE id=allocation.sale_id;
        target='RET-'||sale.sale_no||'-'||allocation.id::text;
        restricted=EXISTS(SELECT 1 FROM production_batch_qualifications q WHERE q.batch_no IN(allocation.batch_no,target)
          AND(official_inventory_conversion_related(q.batch_no) OR q.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no)));
        IF restricted AND(COALESCE(allocation.returned_qty,0)>0 OR sale.status='RETURNED' OR EXISTS(SELECT 1 FROM inv_batches WHERE batch_no=target)) THEN
          RAISE EXCEPTION 'OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED' USING ERRCODE='23514';END IF;
      END $body$;
      CREATE FUNCTION lock_conversion_return_relation() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE row_data jsonb;old_data jsonb;keys text[];lock_key text;item record;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'OFFICIAL_CONVERSION_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_OP='DELETE' THEN row_data=to_jsonb(OLD);ELSE row_data=to_jsonb(NEW);END IF;
        IF TG_OP='UPDATE' THEN old_data=to_jsonb(OLD);END IF;
        IF TG_TABLE_NAME='sal_return_items' THEN
          keys=ARRAY['return-order:'||(row_data->>'return_order_id'),'return-order:'||(old_data->>'return_order_id'),
            'sale-item:'||(row_data->>'sales_order_item_id'),'sale-item:'||(old_data->>'sales_order_item_id')];
        ELSIF TG_TABLE_NAME='sal_order_item_batch_allocations' THEN
          keys=ARRAY['sale-item:'||(row_data->>'sales_order_item_id'),'sale-item:'||(old_data->>'sales_order_item_id')];
        ELSIF TG_TABLE_NAME='sal_return_orders' THEN
          keys=ARRAY['return-order:'||(row_data->>'id'),'return-order:'||(old_data->>'id')];
          -- Stabilize membership before a fresh READ COMMITTED query discovers its source keys.
          FOR lock_key IN SELECT DISTINCT value FROM unnest(keys) value WHERE value IS NOT NULL ORDER BY value LOOP
            IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:conversion-return-custody'),hashtext(lock_key)) THEN
              RAISE EXCEPTION 'OFFICIAL_CONVERSION_RETURN_BUSY' USING ERRCODE='23514';END IF;
          END LOOP;
          keys='{}'::text[];
          FOR item IN SELECT sales_order_item_id FROM sal_return_items WHERE return_order_id IN((row_data->>'id')::bigint,(old_data->>'id')::bigint)
            LOOP keys=array_append(keys,'sale-item:'||item.sales_order_item_id::text);END LOOP;
        ELSIF TG_TABLE_NAME='store_sale_allocations' THEN keys=ARRAY['pos-sale:'||(row_data->>'sale_id'),'pos-sale:'||(old_data->>'sale_id')];
        ELSE keys=ARRAY['pos-sale:'||(row_data->>'id'),'pos-sale:'||(old_data->>'id')];END IF;
        FOR lock_key IN SELECT DISTINCT value FROM unnest(keys) value WHERE value IS NOT NULL ORDER BY value LOOP
          IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:conversion-return-custody'),hashtext(lock_key)) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_RETURN_BUSY' USING ERRCODE='23514';END IF;
        END LOOP;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END $body$;
      CREATE FUNCTION check_conversion_return_relation() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE item record;row_data jsonb;old_data jsonb;
      BEGIN
        IF TG_OP='DELETE' THEN row_data=to_jsonb(OLD);ELSE row_data=to_jsonb(NEW);END IF;
        IF TG_OP='UPDATE' THEN old_data=to_jsonb(OLD);END IF;
        IF TG_TABLE_NAME='sal_return_items' THEN
          IF TG_OP='DELETE' THEN
            IF EXISTS(SELECT 1 FROM sal_order_item_batch_allocations allocation JOIN production_batch_qualifications q ON q.batch_no=allocation.batch_no
              WHERE allocation.sales_order_item_id=(row_data->>'sales_order_item_id')::bigint AND allocation.outbound_qty>0
                AND(official_inventory_conversion_related(q.batch_no) OR q.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no))) THEN
              RAISE EXCEPTION 'OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED' USING ERRCODE='23514';END IF;
          ELSE PERFORM assert_conversion_customer_return((row_data->>'id')::bigint);END IF;
        ELSIF TG_TABLE_NAME='sal_order_item_batch_allocations' THEN
          FOR item IN SELECT id FROM sal_return_items WHERE sales_order_item_id IN((row_data->>'sales_order_item_id')::bigint,(old_data->>'sales_order_item_id')::bigint)
            LOOP PERFORM assert_conversion_customer_return(item.id);END LOOP;
        ELSIF TG_TABLE_NAME='sal_return_orders' THEN
          FOR item IN SELECT id FROM sal_return_items WHERE return_order_id=(row_data->>'id')::bigint LOOP PERFORM assert_conversion_customer_return(item.id);END LOOP;
        ELSIF TG_TABLE_NAME='store_sale_allocations' THEN
          IF TG_OP='DELETE' AND COALESCE((row_data->>'returned_qty')::numeric,0)>0 AND EXISTS(SELECT 1 FROM production_batch_qualifications q
            WHERE q.batch_no=row_data->>'batch_no' AND(official_inventory_conversion_related(q.batch_no) OR q.processing_stage='WIP' OR EXISTS(SELECT 1 FROM production_batch_raw_roots WHERE batch_no=q.batch_no))) THEN
            RAISE EXCEPTION 'OFFICIAL_CONVERSION_RETURN_CUSTODY_REQUIRED' USING ERRCODE='23514';END IF;
          IF TG_OP<>'DELETE' THEN PERFORM assert_conversion_pos_return((row_data->>'id')::bigint);END IF;
        ELSIF TG_TABLE_NAME='sal_store_sales' THEN
          FOR item IN SELECT id FROM store_sale_allocations WHERE sale_id=(row_data->>'id')::bigint LOOP PERFORM assert_conversion_pos_return(item.id);END LOOP;
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END $body$;`);
    for(const table of ['sal_return_items','sal_order_item_batch_allocations','sal_return_orders','store_sale_allocations','sal_store_sales'])if(await q.hasTable(table))
      await q.query(`CREATE TRIGGER trg_conversion_return_lock BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION lock_conversion_return_relation();
        CREATE CONSTRAINT TRIGGER trg_conversion_return_relation AFTER INSERT OR UPDATE OR DELETE ON ${table}
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_conversion_return_relation()`);
  }

  async down(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query(`LOCK TABLE production_conversion_documents,production_conversion_inputs,production_conversion_inventory_debits,production_conversion_outputs,
        production_batch_raw_roots,production_batch_derivation_parents,production_batch_qualifications,inv_batches,inv_ledger IN ACCESS EXCLUSIVE MODE NOWAIT`);
      if((await q.query(`SELECT 1 FROM production_conversion_documents UNION ALL SELECT 1 FROM production_batch_raw_roots
        UNION ALL SELECT 1 FROM production_batch_derivation_parents UNION ALL SELECT 1 FROM production_batch_qualifications WHERE processing_stage='WIP' OR conversion_document_id IS NOT NULL
        UNION ALL SELECT 1 FROM inv_batches WHERE inventory_class='WIP' LIMIT 1`)).length)
        throw new Error('OFFICIAL_CONVERSION_DOWN_HOLD: conversion or work-in-progress facts exist');
      for(const [table,column] of [['wms_transfer_items','damaged_batch_no']]){
        if(await q.hasTable(table)){
          await q.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE NOWAIT`);
          if((await q.query(`SELECT 1 FROM ${table} WHERE ${column} IS NOT NULL LIMIT 1`)).length)throw new Error('OFFICIAL_CONVERSION_DOWN_HOLD: actual derivation proofs exist');
        }
      }
      for(const table of ['wms_transfer_items','wms_defect_dispositions'])if(await q.hasTable(table))
        await q.query(`DROP TRIGGER trg_conversion_business_binding ON ${table};DROP TRIGGER trg_conversion_business_projection ON ${table}`);
      if(await q.hasTable('wms_transfer_items'))await q.query('DROP INDEX ix_conversion_transfer_target;DROP INDEX ix_conversion_transfer_damage_target');
      if(await q.hasTable('wms_defect_dispositions'))await q.query('DROP INDEX ix_conversion_defect_target');
      if(await q.hasTable('wms_transfer'))await q.query('DROP TRIGGER trg_conversion_transfer_header ON wms_transfer;DROP TRIGGER trg_conversion_transfer_projection ON wms_transfer');
      await q.query(`DROP FUNCTION check_conversion_business_binding();DROP FUNCTION guard_conversion_business_binding();DROP FUNCTION guard_conversion_transfer_header();
        DROP FUNCTION check_conversion_transfer_projection();DROP FUNCTION assert_conversion_transfer_item(bigint);DROP FUNCTION assert_conversion_business_target(text,text,text)`);
      for(const table of ['sal_return_items','sal_order_item_batch_allocations','sal_return_orders','store_sale_allocations','sal_store_sales'])if(await q.hasTable(table))
        await q.query(`DROP TRIGGER trg_conversion_return_relation ON ${table};DROP TRIGGER trg_conversion_return_lock ON ${table}`);
      await q.query('DROP FUNCTION check_conversion_return_relation();DROP FUNCTION lock_conversion_return_relation();DROP FUNCTION assert_conversion_pos_return(bigint);DROP FUNCTION assert_conversion_customer_return(bigint)');
      for(const signature of ['official_inventory_qualification_controlled(text)','official_inventory_allows(text,text,text,text,text,text)',
        'official_inventory_writable(text,text,text,text,text,text)','official_inventory_lock_operation(text,text,text,text,text,text,jsonb)','official_inventory_cost_known(text)']){
        const [saved]=await q.query(`SELECT "value" AS definition FROM typeorm_metadata WHERE "type"='OFFICIAL_CONVERSION_FUNCTION' AND "name"=$1`,[signature]);
        if(!saved?.definition)throw new Error('OFFICIAL_CONVERSION_RESTORE_HOLD');await q.query(saved.definition);
      }
      await q.query(`DELETE FROM typeorm_metadata WHERE "type"='OFFICIAL_CONVERSION_FUNCTION'`);
      await q.query(`DROP TRIGGER trg_conversion_qualification_admission ON production_batch_qualifications;
        DROP TRIGGER trg_conversion_raw_admission ON production_batch_raw_roots;DROP TRIGGER trg_conversion_parent_admission ON production_batch_derivation_parents;
        DROP TRIGGER trg_conversion_inventory_root_admission ON production_batch_roots;DROP TRIGGER trg_conversion_lineage_extension ON production_batch_roots;
        DROP FUNCTION guard_conversion_lineage_extension();DROP TRIGGER trg_conversion_parent_plan ON production_batch_derivation_parents;DROP FUNCTION guard_conversion_parent_binding();
        DROP FUNCTION check_conversion_source_admission();DROP FUNCTION assert_official_conversion_derivation(text);DROP TRIGGER trg_conversion_processing_class ON inv_batches;DROP FUNCTION project_conversion_processing_class();
        DROP TRIGGER trg_conversion_qualification_plan ON production_batch_qualifications;DROP FUNCTION guard_conversion_qualification();
        DROP FUNCTION official_inventory_proven_currency(text);DROP FUNCTION official_conversion_parent_available_on(text);DROP FUNCTION official_inventory_conversion_related(text);DROP FUNCTION official_inventory_raw_roots_allowed(text,boolean);DROP TRIGGER trg_conversion_raw_root ON production_batch_raw_roots;DROP FUNCTION guard_conversion_raw_root();
        DROP TRIGGER trg_conversion_inventory_debit ON inv_batches;DROP TRIGGER trg_conversion_ledger ON inv_ledger;DROP FUNCTION guard_conversion_ledger();
        DROP TRIGGER trg_conversion_batch_balance ON inv_batches;DROP TRIGGER trg_conversion_ledger_balance ON inv_ledger;DROP FUNCTION check_conversion_physical_balance();
        DROP INDEX uq_conversion_out_ledger;DROP INDEX uq_conversion_in_ledger;
        DROP TABLE production_conversion_outputs;DROP TABLE production_conversion_inventory_debits;DROP TABLE production_conversion_inputs;
        DROP TABLE production_batch_derivation_parents;
        DROP FUNCTION guard_conversion_fact_immutable();DROP FUNCTION capture_conversion_inventory_debit();
        DROP FUNCTION guard_conversion_input();DROP TRIGGER trg_conversion_document ON production_conversion_documents;
        DROP TRIGGER trg_conversion_posted ON production_conversion_documents;DROP FUNCTION guard_conversion_document();
        DROP FUNCTION guard_conversion_output();DROP FUNCTION guard_conversion_debit_capture();DROP FUNCTION check_conversion_posted_projection();DROP FUNCTION assert_official_conversion_posted(uuid);DROP FUNCTION lock_official_conversion_period(uuid);DROP TABLE production_batch_raw_roots;
        ALTER TABLE production_batch_qualifications DROP CONSTRAINT ck_conversion_qualification_pair,
          DROP COLUMN conversion_output_no,DROP COLUMN conversion_document_id,DROP COLUMN processing_stage;
        DROP TABLE production_conversion_documents;
        ALTER TABLE inv_batches DROP CONSTRAINT inv_batches_inventory_class_check;
        ALTER TABLE inv_batches ADD CONSTRAINT inv_batches_inventory_class_check CHECK(inventory_class IN('STANDARD','DEFECT_SALE'))`);
      for(const [table,column] of [['wms_transfer_items','damaged_batch_no']]){
        if(await q.hasTable(table))await q.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
      }
      for(const [type,code,zh,en,lo] of this.dictionaries){
        if(!(await q.query(`SELECT 1 FROM typeorm_metadata WHERE "type"='OFFICIAL_CONVERSION_DICT' AND "name"=$1 AND "value"=$2`,[type,code])).length)continue;
        await q.query(`DELETE FROM sys_dict WHERE dict_type=$1 AND dict_code=$2 AND dict_value=$2 AND dict_label_zh=$3 AND dict_label_en=$4 AND dict_label_lo=$5`,[type,code,zh,en,lo]);
        await q.query(`DELETE FROM typeorm_metadata WHERE "type"='OFFICIAL_CONVERSION_DICT' AND "name"=$1 AND "value"=$2`,[type,code]);
      }
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
}
