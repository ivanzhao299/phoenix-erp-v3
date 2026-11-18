import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: Immutable trigger DDL and sys_dict vocabulary only; no business facts, sources or activation are seeded. */
export class OfficialRawCollectionReceipts1795005390930 implements MigrationInterface {
  private readonly states=[
    ['DRAFT','草稿','Draft','ສະບັບຮ່າງ'],['READY','待独立审核','Awaiting independent approval','ລໍຖ້າຜູ້ກວດອິດສະຫຼະ'],
    ['APPROVED','已审核待确认','Approved, awaiting receipt','ອະນຸມັດແລ້ວ ລໍຖ້າຢືນຢັນ'],
    ['POSTED','已确认收蛋','Collection confirmed','ຢືນຢັນຮັບໄຂ່ແລ້ວ'],['CANCELLED','已取消','Cancelled','ຍົກເລີກແລ້ວ'],
  ];
  async up(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    await q.query(`
      CREATE TABLE production_raw_receipts(
        id uuid PRIMARY KEY,document_no text NOT NULL UNIQUE,company_code text NOT NULL,house_code text NOT NULL,
        production_date date NOT NULL,warehouse_code text NOT NULL,scope_id uuid NOT NULL REFERENCES production_cutover_scopes(id),
        source_batch_id bigint NOT NULL REFERENCES pkg_source_batches(id),handover_id uuid NOT NULL REFERENCES production_physical_handovers(id),
        intent_key text NOT NULL,creation_hash text NOT NULL CHECK(creation_hash ~ '^[a-f0-9]{64}$'),
        state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','READY','APPROVED','POSTED','CANCELLED')),
        version integer NOT NULL DEFAULT 0 CHECK(version>=0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
        content_hash text,submit_key text,expected_posting_date date,ready_at timestamptz,ready_by text,approved_by text,approved_hash text,approved_at timestamptz,posting_date date,receipt jsonb,
        cancelled_by text,cancelled_at timestamptz,
        created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),posted_at timestamptz,
        UNIQUE(company_code,intent_key),
        CHECK(state IN ('DRAFT','CANCELLED') OR (content_hash IS NOT NULL AND content_hash ~ '^[a-f0-9]{64}$' AND submit_key IS NOT NULL AND expected_posting_date IS NOT NULL AND ready_at IS NOT NULL AND ready_by IS NOT NULL)),
        CHECK(state NOT IN ('APPROVED','POSTED') OR (approved_by IS NOT NULL AND approved_by<>created_by AND approved_by<>ready_by AND approved_hash IS NOT NULL AND approved_hash=content_hash AND approved_at IS NOT NULL)),
        CHECK(state<>'CANCELLED' OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)),
        CHECK(state<>'POSTED' OR (receipt IS NOT NULL AND posting_date IS NOT NULL AND posted_at IS NOT NULL))
      );
      CREATE UNIQUE INDEX uq_production_raw_submit ON production_raw_receipts(company_code,submit_key) WHERE submit_key IS NOT NULL;
      CREATE UNIQUE INDEX uq_production_raw_source_live ON production_raw_receipts(source_batch_id) WHERE state<>'CANCELLED';
      CREATE UNIQUE INDEX uq_production_raw_handover_live ON production_raw_receipts(handover_id) WHERE state<>'CANCELLED';
      CREATE TABLE production_raw_receipt_segments(
        id uuid PRIMARY KEY,receipt_id uuid NOT NULL REFERENCES production_raw_receipts(id),company_code text NOT NULL,
        handover_line_id uuid NOT NULL,daily_log_id bigint NOT NULL REFERENCES brd_daily_logs(id),
        occupancy_id text NOT NULL REFERENCES brd_flock_occupancies(id),flock_no text NOT NULL,
        grade_code text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),
        report_hash text NOT NULL CHECK(report_hash ~ '^[a-f0-9]{64}$'),source_key text NOT NULL,
        evidence_file_id text NOT NULL,evidence_checksum text NOT NULL CHECK(evidence_checksum ~ '^[a-f0-9]{64}$'),
        snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
        UNIQUE(receipt_id,handover_line_id),UNIQUE(company_code,source_key),
        FOREIGN KEY(company_code,source_key) REFERENCES brd_egg_source_receipts(company_code,source_key)
      );
      CREATE INDEX ix_production_raw_report ON production_raw_receipt_segments(daily_log_id,grade_code);
      CREATE FUNCTION official_raw_reference_token(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $body$
        SELECT NULLIF(btrim(value,chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)),'')
      $body$;
      CREATE FUNCTION lock_official_raw_reference_tokens(tokens text[],is_shared boolean DEFAULT false) RETURNS void LANGUAGE plpgsql AS $body$
      DECLARE token text;
      BEGIN
        FOR token IN SELECT DISTINCT official_raw_reference_token(t) FROM unnest(tokens) t WHERE official_raw_reference_token(t) IS NOT NULL ORDER BY 1 LOOP
          IF is_shared THEN
            IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('phoenix:raw-source-reference:'||token,0)) THEN
              RAISE EXCEPTION 'RAW_RECEIPT_SOURCE_REFERENCE_BUSY' USING ERRCODE='23514';END IF;
          ELSIF NOT pg_try_advisory_xact_lock(hashtextextended('phoenix:raw-source-reference:'||token,0)) THEN
            RAISE EXCEPTION 'RAW_RECEIPT_SOURCE_REFERENCE_BUSY' USING ERRCODE='23514';END IF;
        END LOOP;
      END $body$;
      CREATE FUNCTION official_raw_source_admissible(source_id bigint) RETURNS boolean LANGUAGE plpgsql AS $body$
      DECLARE source record;tokens text[];
      BEGIN
        SELECT * INTO source FROM pkg_source_batches WHERE id=source_id FOR SHARE;
        tokens=ARRAY[official_raw_reference_token(source.batch_code),official_raw_reference_token(source.source_inbound_no)];
        PERFORM lock_official_raw_reference_tokens(tokens);
        IF source.id IS NULL OR EXISTS(SELECT 1 FROM inv_batches WHERE official_raw_reference_token(batch_no)=ANY(tokens) OR official_raw_reference_token(source_no)=ANY(tokens))
          OR EXISTS(SELECT 1 FROM brd_egg_source_receipts WHERE source_key='PACKAGING:'||source_id::text)
          OR EXISTS(SELECT 1 FROM pkg_grading_source_links l JOIN pkg_grading_records g ON g.id=l.grading_id
            WHERE l.source_batch_id=source_id AND g.is_test=false AND COALESCE(to_jsonb(g)->>'status','ACTIVE')<>'VOID') THEN RETURN false;END IF;
        IF to_regclass('wms_inbound') IS NOT NULL THEN
          IF EXISTS(SELECT 1 FROM wms_inbound w WHERE official_raw_reference_token(to_jsonb(w)->>'inbound_no')=ANY(tokens)
            OR official_raw_reference_token(to_jsonb(w)->>'task_no')=ANY(tokens)) THEN RETURN false;END IF;
        END IF;
        RETURN true;
      END $body$;
      CREATE FUNCTION guard_official_raw_receipt() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'RAW_RECEIPT_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RAW_RECEIPT_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF TG_OP='INSERT' THEN
          IF NEW.state<>'DRAFT' OR NEW.version<>0 OR NEW.content_hash IS NOT NULL OR NEW.submit_key IS NOT NULL
            OR NEW.approved_by IS NOT NULL OR NEW.approved_hash IS NOT NULL OR NEW.receipt IS NOT NULL
            OR NEW.expected_posting_date IS NOT NULL OR NEW.ready_at IS NOT NULL OR NEW.ready_by IS NOT NULL OR NEW.approved_at IS NOT NULL
            OR NEW.cancelled_by IS NOT NULL OR NEW.cancelled_at IS NOT NULL OR NEW.posting_date IS NOT NULL OR NEW.posted_at IS NOT NULL THEN RAISE EXCEPTION 'RAW_RECEIPT_INITIAL_STATE_HOLD' USING ERRCODE='23514';END IF;
          IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(NEW.house_code)) THEN RAISE EXCEPTION 'RAW_RECEIPT_HOUSE_BUSY' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM production_inbound_documents d JOIN production_physical_handovers h ON h.company_code=d.company_code
            AND h.handover_ref=d.handover_ref WHERE h.id=NEW.handover_id AND d.kind='INBOUND' AND d.state<>'CANCELLED') THEN
            RAISE EXCEPTION 'RAW_RECEIPT_HANDOVER_ALREADY_BOUND' USING ERRCODE='23514';END IF;
          IF NOT official_raw_source_admissible(NEW.source_batch_id) THEN
            RAISE EXCEPTION 'RAW_RECEIPT_LEGACY_SOURCE_ALREADY_BOUND' USING ERRCODE='23514';END IF;
          RETURN NEW;
        END IF;
        IF OLD.state IN ('POSTED','CANCELLED') OR NEW.version<>OLD.version+1
          OR (OLD.id,OLD.document_no,OLD.company_code,OLD.house_code,OLD.production_date,OLD.warehouse_code,OLD.scope_id,
            OLD.source_batch_id,OLD.handover_id,OLD.intent_key,OLD.creation_hash,OLD.created_by,OLD.created_at) IS DISTINCT FROM
            (NEW.id,NEW.document_no,NEW.company_code,NEW.house_code,NEW.production_date,NEW.warehouse_code,NEW.scope_id,
            NEW.source_batch_id,NEW.handover_id,NEW.intent_key,NEW.creation_hash,NEW.created_by,NEW.created_at)
          OR OLD.state<>'DRAFT' AND (OLD.payload,OLD.content_hash,OLD.submit_key,OLD.expected_posting_date,OLD.ready_at,OLD.ready_by) IS DISTINCT FROM (NEW.payload,NEW.content_hash,NEW.submit_key,NEW.expected_posting_date,NEW.ready_at,NEW.ready_by)
          OR OLD.state='DRAFT' AND NEW.state NOT IN ('READY','CANCELLED')
          OR OLD.state='READY' AND NEW.state NOT IN ('APPROVED','CANCELLED')
          OR OLD.state='APPROVED' AND NEW.state NOT IN ('POSTED','CANCELLED') THEN
          RAISE EXCEPTION 'RAW_RECEIPT_IMMUTABLE' USING ERRCODE='23514';END IF;
        IF OLD.state='APPROVED' AND (OLD.approved_by,OLD.approved_hash,OLD.approved_at) IS DISTINCT FROM (NEW.approved_by,NEW.approved_hash,NEW.approved_at) THEN
          RAISE EXCEPTION 'RAW_RECEIPT_SIGNATURE_IMMUTABLE' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_official_raw_receipt BEFORE INSERT OR UPDATE OR DELETE ON production_raw_receipts
        FOR EACH ROW EXECUTE FUNCTION guard_official_raw_receipt();
      CREATE FUNCTION guard_official_raw_segment() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE d record;h record;source jsonb;r record;raw record;accepted record;used_quantity integer;total_used bigint;report_total bigint;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'RAW_RECEIPT_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'RAW_RECEIPT_SEGMENT_IMMUTABLE' USING ERRCODE='23514';END IF;
        SELECT * INTO d FROM production_raw_receipts WHERE id=NEW.receipt_id FOR SHARE;
        IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(d.house_code)) THEN
          RAISE EXCEPTION 'RAW_RECEIPT_HOUSE_BUSY' USING ERRCODE='23514';END IF;
        SELECT * INTO h FROM production_physical_handovers WHERE id=d.handover_id FOR SHARE;
        SELECT value INTO source FROM jsonb_array_elements(h.payload->'sources') WHERE value->>'id'=NEW.handover_line_id::text;
        SELECT * INTO r FROM brd_daily_logs WHERE id=NEW.daily_log_id FOR UPDATE;
        SELECT * INTO raw FROM pkg_source_batches WHERE id=d.source_batch_id FOR SHARE;
        SELECT * INTO accepted FROM brd_egg_source_receipts WHERE company_code=NEW.company_code AND source_key=NEW.source_key;
        IF d.id IS NULL OR d.state<>'APPROVED' OR h.state<>'CONFIRMED' OR source IS NULL OR NEW.company_code<>d.company_code
          OR h.company_code<>d.company_code OR h.house_code<>d.house_code OR h.scope_id<>d.scope_id OR h.production_date<>d.production_date
          OR h.payload->>'warehouseCode' IS DISTINCT FROM d.warehouse_code
          OR (source->>'dailyLogId')::bigint IS DISTINCT FROM NEW.daily_log_id OR source->>'gradeCode' IS DISTINCT FROM NEW.grade_code
          OR (source->>'quantity')::integer IS DISTINCT FROM NEW.quantity OR source->>'occupancyId' IS DISTINCT FROM NEW.occupancy_id
          OR source->>'flockNo' IS DISTINCT FROM NEW.flock_no OR source->>'reportHash' IS DISTINCT FROM NEW.report_hash
          OR source->>'evidenceFileId' IS DISTINCT FROM NEW.evidence_file_id OR source->>'evidenceChecksum' IS DISTINCT FROM NEW.evidence_checksum
          OR NEW.snapshot IS DISTINCT FROM source
          OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d.payload->'sources') x WHERE x=source)
          OR h.payload->'rawCollection'->>'sourceBatchId' IS DISTINCT FROM d.source_batch_id::text
          OR h.payload->'rawCollection'->>'shiftId' IS DISTINCT FROM raw.shift_id::text
          OR h.payload->'rawCollection'->>'batchCode' IS DISTINCT FROM raw.batch_code
          OR h.payload->'rawCollection'->'sourceSnapshot' IS DISTINCT FROM d.payload->'source'
          OR h.content_hash IS DISTINCT FROM d.payload->>'handoverHash'
          OR NEW.source_key IS DISTINCT FROM 'RAW:'||d.id::text||':'||NEW.handover_line_id::text
          OR EXISTS(SELECT 1 FROM brd_egg_source_receipts prior WHERE prior.daily_log_id=NEW.daily_log_id AND prior.source_key LIKE 'PACKAGING:%')
          OR r.house_code IS DISTINCT FROM d.house_code OR r.log_date IS DISTINCT FROM d.production_date
          OR r.occupancy_id IS DISTINCT FROM NEW.occupancy_id OR r.flock_no IS DISTINCT FROM NEW.flock_no
          OR raw.house_code IS DISTINCT FROM d.house_code OR raw.production_date IS DISTINCT FROM d.production_date
          OR raw.batch_status IS DISTINCT FROM 'RECEIVED' OR raw.is_test IS DISTINCT FROM false
          OR accepted.daily_log_id IS DISTINCT FROM NEW.daily_log_id OR accepted.occupancy_id IS DISTINCT FROM NEW.occupancy_id
          OR accepted.house_code IS DISTINCT FROM d.house_code OR accepted.production_date IS DISTINCT FROM d.production_date
          OR accepted.quantity IS DISTINCT FROM NEW.quantity OR accepted.entry_mode IS DISTINCT FROM 'PACKAGING'
          OR NOT EXISTS(SELECT 1 FROM brd_flock_occupancies o WHERE o.id=NEW.occupancy_id AND o.flock_no=NEW.flock_no
            AND o.house_code=d.house_code AND o.company_code=d.company_code AND o.began_on<=d.production_date AND (o.ended_on IS NULL OR o.ended_on>d.production_date))
          OR EXISTS(SELECT 1 FROM product_grades g WHERE g.status='ACTIVE' AND COALESCE((to_jsonb(g)->>'stock_managed')::boolean,true)
            AND NOT r.eggs_by_grade ? g.grade_code)
          OR NOT EXISTS(SELECT 1 FROM brd_egg_day_routes route WHERE route.company_code=d.company_code AND route.house_code=d.house_code
            AND route.production_date=d.production_date AND route.entry_mode='PACKAGING') THEN
          RAISE EXCEPTION 'RAW_RECEIPT_SOURCE_FACTS_HOLD' USING ERRCODE='23514';END IF;
        SELECT COALESCE(SUM(quantity),0) INTO total_used FROM brd_egg_source_receipts WHERE daily_log_id=NEW.daily_log_id;
        SELECT COALESCE(SUM(value::bigint),0) INTO report_total FROM jsonb_each_text(r.eggs_by_grade);
        IF total_used>report_total THEN RAISE EXCEPTION 'RAW_RECEIPT_TOTAL_CAPACITY_HOLD' USING ERRCODE='23514';END IF;
        SELECT COALESCE(SUM(s.quantity),0) INTO used_quantity FROM production_raw_receipt_segments s
          WHERE s.daily_log_id=NEW.daily_log_id AND s.grade_code=NEW.grade_code;
        IF used_quantity+NEW.quantity>COALESCE((r.eggs_by_grade->>NEW.grade_code)::integer,0) THEN
          RAISE EXCEPTION 'RAW_RECEIPT_GRADE_CAPACITY_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_official_raw_segment BEFORE INSERT OR UPDATE OR DELETE ON production_raw_receipt_segments
        FOR EACH ROW EXECUTE FUNCTION guard_official_raw_segment();
      CREATE FUNCTION guard_official_raw_posted() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE raw record;h record;shift record;farm record;total integer;segments integer;expected integer;signed_sources jsonb;actual_sources jsonb;mode text;source_snapshot jsonb;
      BEGIN
        IF NEW.state='POSTED' THEN
          SELECT * INTO raw FROM pkg_source_batches WHERE id=NEW.source_batch_id;
          SELECT * INTO h FROM production_physical_handovers WHERE id=NEW.handover_id;
          SELECT * INTO shift FROM pkg_work_shifts WHERE id=raw.shift_id FOR SHARE;
          SELECT f.* INTO farm FROM brd_houses house JOIN brd_farms f ON f.farm_code=house.farm_code WHERE house.house_code=NEW.house_code FOR SHARE OF house,f;
          LOCK TABLE inv_source_mode IN SHARE MODE;
          SELECT m.mode INTO mode FROM inv_source_mode m WHERE(m.scope_level='SITE' AND m.scope_code=farm.farm_code)
            OR(m.scope_level='COMPANY' AND m.scope_code=NEW.company_code) OR(m.scope_level='GROUP' AND m.scope_code='ALL')
            ORDER BY CASE m.scope_level WHEN 'SITE' THEN 1 WHEN 'COMPANY' THEN 2 ELSE 3 END LIMIT 1 FOR SHARE;
          source_snapshot=jsonb_build_object('id',raw.id::text,'batch_code',raw.batch_code,'source_inbound_no',raw.source_inbound_no,
            'house_code',raw.house_code,'flock_code',raw.flock_code,'shift_id',raw.shift_id::text,'production_date',raw.production_date::text,
            'lay_date',raw.lay_date::text,'received_qty',raw.received_qty::text,'total_qty',raw.total_qty::text,'dirty_qty',raw.dirty_qty::text,
            'cracked_qty',raw.cracked_qty::text,'batch_status',raw.batch_status,'is_test',raw.is_test,
            'original_record',to_jsonb(raw)-ARRAY['created_at','updated_at'],'farm_code',farm.farm_code,'company_code',farm.company_code,
            'shift_date',shift.production_date::text,'shift_is_test',shift.is_test,'shift_site_id',shift.site_id);
          SELECT jsonb_agg(x ORDER BY x->>'id') INTO signed_sources FROM jsonb_array_elements(NEW.payload->'sources') x;
          SELECT jsonb_agg(snapshot ORDER BY snapshot->>'id') INTO actual_sources FROM production_raw_receipt_segments WHERE receipt_id=NEW.id;
          SELECT COALESCE(SUM(quantity),0),COUNT(*) INTO total,segments FROM production_raw_receipt_segments WHERE receipt_id=NEW.id;
          SELECT COUNT(*) INTO expected FROM jsonb_array_elements(h.payload->'sources');
          IF NOT official_raw_source_admissible(NEW.source_batch_id) OR signed_sources IS DISTINCT FROM actual_sources
            OR (SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(h.payload->'sources') x) IS DISTINCT FROM actual_sources
            OR NEW.payload->'source' IS DISTINCT FROM source_snapshot
            OR h.payload->'rawCollection'->'sourceSnapshot' IS DISTINCT FROM source_snapshot
            OR h.payload->'rawCollection'->>'sourceBatchId' IS DISTINCT FROM NEW.source_batch_id::text
            OR h.payload->'rawCollection'->>'shiftId' IS DISTINCT FROM raw.shift_id::text
            OR h.payload->'rawCollection'->>'batchCode' IS DISTINCT FROM raw.batch_code
            OR h.content_hash IS DISTINCT FROM NEW.payload->>'handoverHash'
            OR shift.site_id IS DISTINCT FROM farm.farm_code OR shift.production_date IS DISTINCT FROM NEW.production_date
            OR shift.is_test IS DISTINCT FROM false OR mode IS DISTINCT FROM 'PACKAGING_INBOUND'
            OR raw.is_test IS DISTINCT FROM false OR raw.batch_status IS DISTINCT FROM 'RECEIVED'
            OR raw.total_qty IS DISTINCT FROM raw.received_qty
            OR raw.dirty_qty IS NULL OR raw.cracked_qty IS NULL OR raw.dirty_qty<0 OR raw.cracked_qty<0 OR raw.dirty_qty+raw.cracked_qty>raw.total_qty
            OR raw.dirty_qty IS DISTINCT FROM(SELECT COALESCE(SUM(quantity),0) FROM production_raw_receipt_segments WHERE receipt_id=NEW.id AND grade_code='DIRTY')
            OR raw.cracked_qty IS DISTINCT FROM(SELECT COALESCE(SUM(quantity),0) FROM production_raw_receipt_segments WHERE receipt_id=NEW.id AND grade_code='BROKEN')
            OR total IS DISTINCT FROM raw.received_qty OR total IS DISTINCT FROM (NEW.payload->>'quantity')::integer OR segments<>expected OR segments=0
            OR NOT EXISTS(SELECT 1 FROM production_cutover_scopes s WHERE s.id=NEW.scope_id AND s.state='ACTIVE'
              AND s.company_code=NEW.company_code AND s.house_code=NEW.house_code AND s.first_production_date<=NEW.production_date
              AND EXISTS(SELECT 1 FROM production_inventory_domains domain JOIN wms_warehouses w ON w.warehouse_code=domain.warehouse_code
                WHERE domain.scope_id=s.id AND domain.company_code=NEW.company_code AND domain.warehouse_code=NEW.warehouse_code
                  AND w.company_code=NEW.company_code AND w.status='ACTIVE'))
            OR NOT EXISTS(SELECT 1 FROM md_egg_source_profiles p JOIN brd_houses house ON house.house_code=p.house_code
              JOIN brd_farms profile_farm ON profile_farm.farm_code=house.farm_code WHERE p.profile_code=NEW.payload->'profile'->>'profileCode'
                AND p.company_code=NEW.company_code AND p.house_code=NEW.house_code AND p.farm_code=house.farm_code AND profile_farm.company_code=p.company_code
                AND p.product_mode=NEW.payload->'profile'->>'productMode' AND p.variety_code IS NOT DISTINCT FROM (NEW.payload->'profile'->>'varietyCode')
                AND p.status='ACTIVE' AND p.effective_date<=NEW.production_date AND(p.expire_date IS NULL OR p.expire_date>=NEW.production_date))
            OR NOT EXISTS(SELECT 1 FROM sys_user u WHERE u.user_id::text=NEW.approved_by AND u.status::text IN ('1','ACTIVE'))
            OR h.state IS DISTINCT FROM 'CONFIRMED' OR h.created_by=h.confirmed_by
            OR NEW.receipt->>'documentNo' IS DISTINCT FROM NEW.document_no
            OR NEW.posting_date IS DISTINCT FROM NEW.expected_posting_date
            OR NEW.posting_date IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date
            OR NEW.receipt->>'postingDate' IS DISTINCT FROM NEW.posting_date::text
            OR NEW.receipt->'inventoryCreated' IS DISTINCT FROM 'false'::jsonb
            OR NEW.receipt->>'documentId' IS DISTINCT FROM NEW.id::text
            OR (NEW.receipt->>'quantity')::integer IS DISTINCT FROM total THEN
            RAISE EXCEPTION 'RAW_RECEIPT_POSTED_FACTS_REQUIRED' USING ERRCODE='23514';END IF;
        END IF;
        RETURN NEW;
      END $body$;
      CREATE CONSTRAINT TRIGGER trg_official_raw_posted AFTER UPDATE ON production_raw_receipts
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_official_raw_posted();
      CREATE FUNCTION guard_raw_segment_projection() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM production_raw_receipts r WHERE r.id=NEW.receipt_id AND r.state='POSTED') THEN
          RAISE EXCEPTION 'RAW_RECEIPT_SEGMENT_POSTED_PARENT_REQUIRED' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE CONSTRAINT TRIGGER trg_raw_segment_projection AFTER INSERT ON production_raw_receipt_segments
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_raw_segment_projection();
      CREATE FUNCTION guard_official_raw_origin_facts() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        -- A stale RR snapshot must not miss a receipt committed after its first read.
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'RAW_ORIGIN_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_TABLE_NAME='production_physical_handovers' THEN
          IF EXISTS(SELECT 1 FROM production_raw_receipts d WHERE d.handover_id=OLD.id AND d.state<>'CANCELLED') THEN
            RAISE EXCEPTION 'RAW_RECEIPT_HANDOVER_IN_USE' USING ERRCODE='23514';END IF;
        ELSIF TG_TABLE_NAME='pkg_source_batches' THEN
          IF EXISTS(SELECT 1 FROM production_raw_receipts d WHERE d.source_batch_id=OLD.id AND d.state='POSTED') AND
            (TG_OP='DELETE' OR (to_jsonb(OLD)-'updated_at') IS DISTINCT FROM (to_jsonb(NEW)-'updated_at')) THEN RAISE EXCEPTION 'RAW_RECEIPT_COLLECTION_IMMUTABLE' USING ERRCODE='23514';END IF;
        ELSE
          IF EXISTS(SELECT 1 FROM production_raw_receipt_segments s WHERE s.daily_log_id=OLD.id AND
            (TG_OP='DELETE' OR COALESCE((NEW.eggs_by_grade->>s.grade_code)::integer,0)<(SELECT SUM(x.quantity)
              FROM production_raw_receipt_segments x WHERE x.daily_log_id=s.daily_log_id AND x.grade_code=s.grade_code))) THEN
            RAISE EXCEPTION 'RAW_RECEIPT_REPORT_CAPACITY_HOLD' USING ERRCODE='23514';END IF;
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_raw_handover_in_use BEFORE UPDATE OR DELETE ON production_physical_handovers
        FOR EACH ROW WHEN (OLD.state='CONFIRMED') EXECUTE FUNCTION guard_official_raw_origin_facts();
      CREATE TRIGGER trg_raw_collection_immutable BEFORE UPDATE OR DELETE ON pkg_source_batches
        FOR EACH ROW EXECUTE FUNCTION guard_official_raw_origin_facts();
      CREATE TRIGGER trg_raw_report_floor BEFORE UPDATE OR DELETE ON brd_daily_logs
        FOR EACH ROW EXECUTE FUNCTION guard_official_raw_origin_facts();
      CREATE FUNCTION guard_raw_legacy_source_claim() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE source_id bigint;owner record;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'RAW_ORIGIN_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_TABLE_NAME='brd_egg_source_receipts' THEN
          IF NEW.source_key LIKE 'RAW:%' THEN RETURN NEW;END IF;
          IF NEW.source_key !~ '^PACKAGING:[1-9][0-9]*$' THEN RETURN NEW;END IF;
          source_id=substring(NEW.source_key FROM 11)::bigint;
        ELSE source_id=NEW.source_batch_id;END IF;
        SELECT * INTO owner FROM pkg_source_batches WHERE id=source_id FOR SHARE;
        IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(owner.house_code)) THEN
          RAISE EXCEPTION 'RAW_RECEIPT_HOUSE_BUSY' USING ERRCODE='23514';END IF;
        IF TG_TABLE_NAME='brd_egg_source_receipts' THEN
          PERFORM 1 FROM brd_daily_logs WHERE id=NEW.daily_log_id FOR UPDATE;
          IF EXISTS(SELECT 1 FROM production_raw_receipt_segments s WHERE s.daily_log_id=NEW.daily_log_id) THEN
            RAISE EXCEPTION 'RAW_RECEIPT_LEGACY_REPORT_ALLOCATION_HOLD' USING ERRCODE='23514';END IF;
        END IF;
        IF EXISTS(SELECT 1 FROM production_raw_receipts d WHERE d.source_batch_id=source_id AND d.state<>'CANCELLED') THEN
          RAISE EXCEPTION 'RAW_RECEIPT_LEGACY_CONSUMPTION_HOLD' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_raw_legacy_source_claim BEFORE INSERT ON brd_egg_source_receipts FOR EACH ROW EXECUTE FUNCTION guard_raw_legacy_source_claim();
      CREATE TRIGGER trg_raw_legacy_grading_claim BEFORE INSERT OR UPDATE ON pkg_grading_source_links FOR EACH ROW EXECUTE FUNCTION guard_raw_legacy_source_claim();
      CREATE FUNCTION guard_raw_credit_projection() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.source_key LIKE 'RAW:%' AND NOT EXISTS(SELECT 1 FROM production_raw_receipt_segments s
          JOIN production_raw_receipts d ON d.id=s.receipt_id WHERE s.company_code=NEW.company_code AND s.source_key=NEW.source_key
            AND d.state='POSTED' AND s.daily_log_id=NEW.daily_log_id AND s.quantity=NEW.quantity AND s.occupancy_id=NEW.occupancy_id) THEN
          RAISE EXCEPTION 'RAW_RECEIPT_CREDIT_POSTED_PARENT_REQUIRED' USING ERRCODE='23514';END IF;
        RETURN NEW;
      END $body$;
      CREATE CONSTRAINT TRIGGER trg_raw_credit_projection AFTER INSERT ON brd_egg_source_receipts
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_raw_credit_projection();
      CREATE FUNCTION guard_raw_physical_reference() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.state<>'CANCELLED' AND NEW.payload ? 'rawCollection' THEN
          IF NOT pg_try_advisory_xact_lock(hashtext('production-handover:'||NEW.company_code||':'||NEW.handover_ref)) THEN
            RAISE EXCEPTION 'RAW_RECEIPT_HANDOVER_BUSY' USING ERRCODE='23514';END IF;
          IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'RAW_ORIGIN_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
          IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(NEW.house_code)) THEN
            RAISE EXCEPTION 'RAW_RECEIPT_HOUSE_BUSY' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM production_inbound_documents d WHERE d.company_code=NEW.company_code AND d.handover_ref=NEW.handover_ref
            AND d.kind='INBOUND' AND d.state<>'CANCELLED') THEN RAISE EXCEPTION 'RAW_RECEIPT_HANDOVER_ALREADY_BOUND' USING ERRCODE='23514';END IF;
        END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_raw_physical_reference BEFORE INSERT OR UPDATE ON production_physical_handovers
        FOR EACH ROW EXECUTE FUNCTION guard_raw_physical_reference();
      CREATE FUNCTION guard_raw_inventory_reference() RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE tokens text[];source record;
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'RAW_ORIGIN_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
        IF TG_TABLE_NAME='inv_batches' THEN tokens=ARRAY[NEW.batch_no,NEW.source_no];
        ELSE tokens=ARRAY[to_jsonb(NEW)->>'inbound_no',to_jsonb(NEW)->>'task_no'];END IF;
        SELECT array_agg(official_raw_reference_token(t)) INTO tokens FROM unnest(tokens) t;
        PERFORM lock_official_raw_reference_tokens(tokens,true);
        FOR source IN SELECT id,house_code FROM pkg_source_batches WHERE official_raw_reference_token(batch_code)=ANY(tokens) OR official_raw_reference_token(source_inbound_no)=ANY(tokens) ORDER BY id FOR SHARE LOOP
          IF NOT pg_try_advisory_xact_lock_shared(hashtext('phoenix:daily-house'),hashtext(source.house_code)) THEN
            RAISE EXCEPTION 'RAW_RECEIPT_HOUSE_BUSY' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM production_raw_receipts r WHERE r.source_batch_id=source.id AND r.state<>'CANCELLED') THEN
            RAISE EXCEPTION 'RAW_RECEIPT_INVENTORY_REFERENCE_HOLD' USING ERRCODE='23514';END IF;
        END LOOP;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_raw_inventory_reference BEFORE INSERT OR UPDATE OF batch_no,source_no ON inv_batches
        FOR EACH ROW EXECUTE FUNCTION guard_raw_inventory_reference();
      CREATE FUNCTION guard_raw_handover_alternative() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF NEW.kind='INBOUND' THEN
          IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'RAW_ORIGIN_ISOLATION_HOLD' USING ERRCODE='23514';END IF;
          IF NEW.handover_ref IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtext('production-handover:'||NEW.company_code||':'||NEW.handover_ref)) THEN
            RAISE EXCEPTION 'RAW_RECEIPT_HANDOVER_BUSY' USING ERRCODE='23514';END IF;
          IF NOT pg_try_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(NEW.house_code)) THEN RAISE EXCEPTION 'RAW_RECEIPT_HOUSE_BUSY' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM production_physical_handovers h WHERE h.company_code=NEW.company_code AND h.handover_ref=NEW.handover_ref
            AND h.state<>'CANCELLED' AND h.payload ? 'rawCollection') THEN
            RAISE EXCEPTION 'RAW_RECEIPT_HANDOVER_ALREADY_BOUND' USING ERRCODE='23514';END IF;
          IF EXISTS(SELECT 1 FROM production_raw_receipts r JOIN production_physical_handovers h ON h.id=r.handover_id
            WHERE h.company_code=NEW.company_code AND h.handover_ref=NEW.handover_ref AND r.state<>'CANCELLED') THEN
            RAISE EXCEPTION 'RAW_RECEIPT_HANDOVER_ALREADY_BOUND' USING ERRCODE='23514';END IF;
        END IF;
        RETURN NEW;
      END $body$;
      CREATE TRIGGER trg_raw_handover_alternative BEFORE INSERT ON production_inbound_documents
        FOR EACH ROW EXECUTE FUNCTION guard_raw_handover_alternative();
    `);
    for(const [index,[code,zh,en,lo]] of this.states.entries()){
      const inserted=await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_value,dict_label_zh,dict_label_en,dict_label_lo,sort_no,status)
        VALUES('PRODUCTION_RAW_RECEIPT_STATE',$1,$1,$2,$3,$4,$5,'ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING RETURNING dict_code`,[code,zh,en,lo,240+index]);
      if(!(await q.query("SELECT 1 FROM sys_dict WHERE dict_type='PRODUCTION_RAW_RECEIPT_STATE' AND dict_code=$1 AND dict_value=$1 AND status='ACTIVE'",[code])).length)
        throw new Error('RAW_RECEIPT_DICTIONARY_HOLD');
      if(inserted.length)await q.query(`INSERT INTO typeorm_metadata("type","table","name","value") VALUES('RAW_COLLECTION_DICT','sys_dict','PRODUCTION_RAW_RECEIPT_STATE',$1)`,[code]);
    }
    if(await q.hasTable('wms_inbound'))await q.query(`CREATE TRIGGER trg_raw_wms_reference BEFORE INSERT OR UPDATE ON wms_inbound
      FOR EACH ROW EXECUTE FUNCTION guard_raw_inventory_reference()`);
  }
  async down(q:QueryRunner):Promise<void>{
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD');
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try{
      await q.query('LOCK TABLE production_inbound_documents,production_physical_handovers,pkg_source_batches,brd_daily_logs,brd_egg_source_receipts,pkg_grading_source_links,inv_batches,production_raw_receipts,production_raw_receipt_segments IN ACCESS EXCLUSIVE MODE NOWAIT');
      if((await q.query("SELECT 1 FROM production_raw_receipts UNION ALL SELECT 1 FROM production_physical_handovers WHERE state<>'CANCELLED' AND payload ? 'rawCollection' LIMIT 1")).length)throw new Error('RAW_RECEIPT_DOWN_HOLD: source facts exist');
      if(await q.hasTable('wms_inbound'))await q.query('LOCK TABLE wms_inbound IN ACCESS EXCLUSIVE MODE NOWAIT;DROP TRIGGER IF EXISTS trg_raw_wms_reference ON wms_inbound');
      await q.query(`DROP TRIGGER trg_raw_inventory_reference ON inv_batches;DROP FUNCTION guard_raw_inventory_reference();
        DROP TRIGGER trg_raw_physical_reference ON production_physical_handovers;DROP FUNCTION guard_raw_physical_reference();
        DROP TRIGGER trg_raw_credit_projection ON brd_egg_source_receipts;DROP FUNCTION guard_raw_credit_projection();
        DROP TRIGGER trg_raw_legacy_source_claim ON brd_egg_source_receipts;DROP TRIGGER trg_raw_legacy_grading_claim ON pkg_grading_source_links;DROP FUNCTION guard_raw_legacy_source_claim();
        DROP TRIGGER trg_raw_handover_in_use ON production_physical_handovers;DROP TRIGGER trg_raw_collection_immutable ON pkg_source_batches;
        DROP TRIGGER trg_raw_handover_alternative ON production_inbound_documents;DROP FUNCTION guard_raw_handover_alternative();
        DROP TRIGGER trg_raw_report_floor ON brd_daily_logs;DROP TABLE production_raw_receipt_segments;DROP TABLE production_raw_receipts;
        DROP FUNCTION guard_raw_segment_projection();DROP FUNCTION guard_official_raw_origin_facts();DROP FUNCTION guard_official_raw_posted();DROP FUNCTION guard_official_raw_segment();DROP FUNCTION guard_official_raw_receipt();DROP FUNCTION official_raw_source_admissible(bigint);DROP FUNCTION lock_official_raw_reference_tokens(text[],boolean);DROP FUNCTION official_raw_reference_token(text)`);
      for(const [code,zh,en,lo] of this.states){
        if(!(await q.query(`SELECT 1 FROM typeorm_metadata WHERE "type"='RAW_COLLECTION_DICT' AND "value"=$1`,[code])).length)continue;
        await q.query(`DELETE FROM sys_dict WHERE dict_type='PRODUCTION_RAW_RECEIPT_STATE' AND dict_code=$1 AND dict_value=$1
          AND dict_label_zh=$2 AND dict_label_en=$3 AND dict_label_lo=$4`,[code,zh,en,lo]);
        await q.query(`DELETE FROM typeorm_metadata WHERE "type"='RAW_COLLECTION_DICT' AND "value"=$1`,[code]);
      }
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
}
