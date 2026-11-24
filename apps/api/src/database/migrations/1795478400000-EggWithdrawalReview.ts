import { MigrationInterface, QueryRunner } from 'typeorm';

const ordinaryGuard = `NEW.qty<OLD.qty OR (NEW.qty_available IS DISTINCT FROM OLD.qty_available AND NEW.status IN ('AVAILABLE','RESERVED'))
  OR NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('RESERVED','AVAILABLE')`;
const availabilityCredit = `OLD.status='AVAILABLE' AND NEW.status='AVAILABLE' AND NEW.qty=OLD.qty AND NEW.qty_available>OLD.qty_available`;

/** @allow-data-dml: trigger declarations cover updates and deletes; this migration only installs DDL. */
export class EggWithdrawalReview1795478400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE brd_egg_vet_reviews (
        id uuid PRIMARY KEY, sequence_no bigint GENERATED ALWAYS AS IDENTITY, medication_id integer NOT NULL REFERENCES brd_medication_records(id),
        flock_no text NOT NULL, production_date date NOT NULL, daily_log_id bigint NOT NULL, source_facts jsonb NOT NULL,
        house_code text NOT NULL, company_code text NOT NULL, farm_code text NOT NULL, site_code text,
        vet_id text NOT NULL, vet_name text NOT NULL, vet_reason text NOT NULL,
        requested_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX ix_egg_vet_course_day ON brd_egg_vet_reviews(medication_id, production_date);
      CREATE TABLE brd_egg_qc_decisions (
        review_id uuid PRIMARY KEY REFERENCES brd_egg_vet_reviews(id),
        outcome text NOT NULL CHECK(outcome IN ('RETAIN','RELEASE','DISPOSE')),
        qa_id text NOT NULL, qa_name text NOT NULL, evidence_ref text NOT NULL UNIQUE, evidence_checksum text NOT NULL,
        decided_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE brd_egg_disposition_receipts (
        ledger_id bigint PRIMARY KEY, batch_no text NOT NULL, qty numeric NOT NULL CHECK(qty>0),
        reference text NOT NULL, kind text NOT NULL CHECK(kind IN ('SCRAP','FORMAL_PRODUCTION_REVERSAL')),
        recorded_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TRIGGER egg_disposition_immutable BEFORE UPDATE OR DELETE ON brd_egg_disposition_receipts
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
      CREATE TRIGGER egg_vet_review_immutable BEFORE UPDATE OR DELETE ON brd_egg_vet_reviews
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
      CREATE TRIGGER egg_qc_decision_immutable BEFORE UPDATE OR DELETE ON brd_egg_qc_decisions
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();

      -- Cancellation ends future exposure. Eggs already laid retain their own disposition.
      ALTER TABLE brd_medication_records ADD COLUMN cancelled_on date;
      CREATE VIEW brd_egg_course_intervals AS
        SELECT id,flock_no,house_code,medication_code,start_date,status,
          CASE WHEN upper(status)='CANCELLED' THEN LEAST(withdraw_until,
            COALESCE(cancelled_on,updated_at::date)) ELSE withdraw_until END AS last_day
        FROM brd_medication_records WHERE flock_no IS NOT NULL AND start_date IS NOT NULL;
      CREATE FUNCTION vet_egg_source_facts(d brd_daily_logs) RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT jsonb_build_object('report',d.id,'flock',d.flock_no,'occupancy',d.occupancy_id,'house',d.house_code,
          'day',d.log_date,'shift',d.shift,'grades',d.eggs_by_grade,'eggs',d.eggs_produced,
          'dirty',d.dirty_eggs,'broken',d.broken_eggs)
      $$;
      CREATE INDEX ix_vet_review_source ON brd_egg_vet_reviews(medication_id,daily_log_id);
      CREATE FUNCTION vet_egg_all_signed(course integer,flock text,day date,decision text) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT COALESCE(bool_and(EXISTS(SELECT 1 FROM brd_egg_vet_reviews v JOIN brd_egg_qc_decisions q ON q.review_id=v.id
          WHERE v.medication_id=course AND v.daily_log_id=d.id AND v.source_facts=vet_egg_source_facts(d) AND q.outcome=decision)),false)
        FROM brd_daily_logs d WHERE d.flock_no=flock AND d.log_date=day
      $$;
      CREATE FUNCTION vet_egg_day_held(flock text,day date) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS(SELECT 1 FROM brd_egg_course_intervals m WHERE m.flock_no=flock AND m.start_date<=day
          AND (m.last_day IS NULL OR m.last_day>=day) AND (upper(m.status) IS DISTINCT FROM 'CANCELLED'
            OR NOT vet_egg_all_signed(m.id,flock,day,'RELEASE')))
      $$;
      CREATE FUNCTION vet_egg_assert_day(flock text, day date) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('transaction_isolation')<>'read committed' THEN
          RAISE EXCEPTION '产蛋来源操作须使用实时事务快照' USING ERRCODE='40001';
        END IF;
        PERFORM pg_advisory_xact_lock_shared(hashtext('vet:egg-flock'),hashtext(flock));
        IF vet_egg_day_held(flock,day) THEN
          RAISE EXCEPTION '产蛋日处于用药/休药隔离期，须经兽医和质检复核' USING ERRCODE='23514';
        END IF;
      END $$;
      CREATE FUNCTION vet_egg_lock_course() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT pg_try_advisory_xact_lock(hashtext('vet:egg-flock'),hashtext(NEW.flock_no)) THEN
          RAISE EXCEPTION '隔离来源正在处理，请重试' USING ERRCODE='40001';
        END IF;
        IF upper(NEW.status)='CANCELLED' AND (TG_OP='INSERT' OR upper(OLD.status) IS DISTINCT FROM 'CANCELLED') THEN
          NEW.cancelled_on := (now() AT TIME ZONE 'Asia/Singapore')::date;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER vet_lock_course BEFORE INSERT OR UPDATE OF status,flock_no,start_date,end_date,withdraw_until
        ON brd_medication_records FOR EACH ROW EXECUTE FUNCTION vet_egg_lock_course();

      CREATE FUNCTION vet_egg_lock_report() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE flock text;
      BEGIN
        IF TG_OP='DELETE' OR TG_OP='UPDATE' AND (OLD.flock_no,OLD.house_code,OLD.log_date,OLD.shift,OLD.occupancy_id)
          IS DISTINCT FROM (NEW.flock_no,NEW.house_code,NEW.log_date,NEW.shift,NEW.occupancy_id) THEN
          IF EXISTS(SELECT 1 FROM brd_egg_vet_reviews v WHERE v.daily_log_id=OLD.id)
            OR EXISTS(SELECT 1 FROM inv_flock_source_links l WHERE l.daily_log_id=OLD.id) THEN
            RAISE EXCEPTION '已有隔离核查或库存来源，日报身份不可移动或删除' USING ERRCODE='23514';
          END IF;
        END IF;
        FOR flock IN SELECT DISTINCT f FROM unnest(ARRAY[
          CASE WHEN TG_OP<>'INSERT' THEN OLD.flock_no END,CASE WHEN TG_OP<>'DELETE' THEN NEW.flock_no END]) AS f
          WHERE f IS NOT NULL ORDER BY f
        LOOP
          IF NOT pg_try_advisory_xact_lock(hashtext('vet:egg-flock'),hashtext(flock)) THEN
            RAISE EXCEPTION '该产蛋来源正在处理，请重试' USING ERRCODE='40001';
          END IF;
        END LOOP;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER vet_lock_report BEFORE INSERT OR UPDATE OR DELETE ON brd_daily_logs FOR EACH ROW EXECUTE FUNCTION vet_egg_lock_report();

      CREATE FUNCTION vet_egg_check_link() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.precision='INHERITED' AND EXISTS(SELECT 1 FROM inv_batches b WHERE b.batch_no=NEW.batch_no
          AND b.source_type='RETURN' AND b.status IN ('QUARANTINE','DAMAGED') AND b.qty_available=0) THEN
          RETURN NEW;
        END IF;
        PERFORM vet_egg_assert_day(NEW.flock_no,NEW.production_date);
        RETURN NEW;
      END $$;
      CREATE TRIGGER vet_check_link BEFORE INSERT ON inv_flock_source_links
        FOR EACH ROW EXECUTE FUNCTION vet_egg_check_link();
      CREATE INDEX ix_egg_source_flock_day ON inv_flock_source_links(flock_no,production_date,batch_no);

      -- Preserve legacy packaging identities through later splits and returns, including mixed lots.
      CREATE TABLE brd_egg_inherited_packs (
        batch_no text NOT NULL REFERENCES inv_batches(batch_no), packing_code text NOT NULL,
        PRIMARY KEY(batch_no,packing_code));
      CREATE TRIGGER egg_inherited_pack_immutable BEFORE UPDATE OR DELETE ON brd_egg_inherited_packs
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
      CREATE FUNCTION vet_egg_pack_refs(batch text) RETURNS TABLE(packing_code text) LANGUAGE sql STABLE AS $$
        SELECT b.packaging_batch_ref::text FROM inv_batches b WHERE b.batch_no=batch AND NULLIF(b.packaging_batch_ref,'') IS NOT NULL
        UNION SELECT p.packing_code FROM brd_egg_inherited_packs p WHERE p.batch_no=batch
      $$;
      CREATE FUNCTION vet_egg_linked_sources(batch text) RETURNS TABLE(flock_no text,production_date date) LANGUAGE sql STABLE AS $$
        SELECT l.flock_no::text,l.production_date FROM inv_flock_source_links l WHERE l.batch_no=batch
        UNION
        SELECT f.flock_no,COALESCE(s.lay_date,s.production_date) FROM vet_egg_pack_refs(batch) ref
          LEFT JOIN pkg_packing_records pk ON pk.code=ref.packing_code AND NOT pk.is_test
          LEFT JOIN LATERAL jsonb_array_elements_text(COALESCE(NULLIF(pk.grading_codes_json,'[]'::jsonb),
            jsonb_build_array(pk.grading_code))) code ON true
          LEFT JOIN pkg_grading_records g ON g.code=code.value AND NOT g.is_test
          LEFT JOIN pkg_grading_source_links gl ON gl.grading_id=g.id
          LEFT JOIN pkg_source_batches s ON s.id=gl.source_batch_id AND NOT s.is_test
          LEFT JOIN LATERAL (
            -- A manually entered flock code cannot override that house's actual laying-day identity.
            SELECT CASE WHEN count(*)=1 AND (NULLIF(s.flock_code,'') IS NULL OR min(h.flock_no)=s.flock_code)
              THEN min(h.flock_no) END AS flock_no FROM (
              SELECT o.flock_no FROM brd_flock_occupancies o WHERE o.house_code=s.house_code
                AND o.began_on<=COALESCE(s.lay_date,s.production_date) AND (o.ended_on IS NULL OR o.ended_on>COALESCE(s.lay_date,s.production_date))
              UNION SELECT d.flock_no FROM brd_daily_logs d WHERE d.house_code=s.house_code
                AND d.log_date=COALESCE(s.lay_date,s.production_date) AND d.flock_no IS NOT NULL
            ) h
          ) f ON true
      $$;
      CREATE TABLE brd_egg_temp_origins(batch_no text PRIMARY KEY REFERENCES inv_batches(batch_no),
        company_code text NOT NULL,house_code text NOT NULL,production_date date NOT NULL,flock_no text NOT NULL);
      CREATE TABLE brd_egg_derived_origins(batch_no text NOT NULL REFERENCES inv_batches(batch_no),
        parent_batch_no text NOT NULL REFERENCES inv_batches(batch_no),PRIMARY KEY(batch_no,parent_batch_no),CHECK(batch_no<>parent_batch_no));
      CREATE TABLE brd_egg_reservation_releases(ledger_id bigint PRIMARY KEY REFERENCES inv_ledger(id),
        allocation_id bigint NOT NULL UNIQUE,order_id bigint NOT NULL,batch_no text NOT NULL,qty numeric NOT NULL CHECK(qty>0),prior_released numeric NOT NULL);
      CREATE TRIGGER egg_temp_origin_immutable BEFORE UPDATE OR DELETE ON brd_egg_temp_origins FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
      CREATE TRIGGER egg_derived_origin_immutable BEFORE UPDATE OR DELETE ON brd_egg_derived_origins FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
      CREATE TRIGGER egg_reservation_release_immutable BEFORE UPDATE OR DELETE ON brd_egg_reservation_releases FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();

      CREATE FUNCTION vet_egg_house_flock(company text,house text,day date) RETURNS text LANGUAGE sql STABLE AS $$
        SELECT CASE WHEN count(*)=1 THEN min(flock_no) END FROM (
          SELECT o.flock_no FROM brd_flock_occupancies o WHERE o.house_code=house AND o.company_code=company
            AND o.began_on<=day AND (o.ended_on IS NULL OR o.ended_on>day)
          UNION SELECT d.flock_no FROM brd_daily_logs d WHERE d.house_code=house AND d.company_code=company
            AND d.log_date=day AND d.flock_no IS NOT NULL
        ) identities
      $$;
      CREATE FUNCTION vet_egg_old_temp_flock(b inv_batches) RETURNS text LANGUAGE sql STABLE AS $$
        WITH hints AS (SELECT CASE WHEN b.collection_batch_ref LIKE 'HOUSE-%' THEN NULLIF(substr(b.collection_batch_ref,7),'') END AS house,
          CASE WHEN jsonb_typeof(b.source_profile_snapshot)='array' THEN
            CASE WHEN jsonb_array_length(b.source_profile_snapshot)=1 THEN b.source_profile_snapshot->0->>'houseCode' END END AS profile_house)
        SELECT vet_egg_house_flock(b.company_code,COALESCE(house,profile_house),b.egg_date) FROM hints
          WHERE (b.collection_batch_ref IS NULL OR house IS NOT NULL) AND (house IS NULL OR profile_house IS NULL OR house=profile_house)
            AND (b.source_profile_snapshot IS NULL OR profile_house IS NOT NULL)
            AND EXISTS (SELECT 1 FROM inv_ledger l WHERE l.batch_no=b.batch_no AND l.company_code=b.company_code
              AND l.ref_no=b.source_no AND l.change_type='TEMP_PRODUCTION_INBOUND' AND l.qty_change>0)
      $$;
      CREATE FUNCTION vet_egg_parent_batches(child text) RETURNS TABLE(parent text) LANGUAGE sql STABLE ROWS 2 SET jit=off AS $$
        SELECT p.parent_batch_no::text FROM brd_egg_derived_origins p WHERE p.batch_no=child
        UNION SELECT p.parent_batch_no FROM production_batch_derivation_parents p WHERE p.batch_no=child
        UNION SELECT r.source_batch_no FROM production_conversion_return_receipts r WHERE r.batch_no=child
        UNION SELECT i.source_batch_no FROM inv_batches b JOIN wms_transfer_items i ON i.transfer_no=b.source_no
          AND ((b.source_type='TRANSFER' AND i.target_batch_no=child) OR (b.source_type='TRANSFER_DAMAGE' AND i.damaged_batch_no=child))
          JOIN wms_transfer t ON t.transfer_no=i.transfer_no AND t.status IN ('RECEIVED','COMPLETED')
          WHERE b.batch_no=child
        UNION SELECT d.batch_no FROM wms_defect_dispositions d WHERE d.target_batch_no=child AND d.status='DONE'
        UNION SELECT CASE WHEN count(DISTINCT a.batch_no)=1 THEN min(a.batch_no) END FROM inv_batches b JOIN sal_return_orders r ON r.return_no=b.source_no AND r.company_code=b.company_code
          JOIN sal_return_items i ON i.return_order_id=r.id AND b.batch_no='RET-'||r.return_no||'-'||i.id
          JOIN sal_order_item_batch_allocations a ON a.sales_order_item_id=i.sales_order_item_id AND a.outbound_qty>0
          WHERE b.batch_no=child AND b.source_type='RETURN'
            AND EXISTS(SELECT 1 FROM inv_ledger l WHERE l.batch_no=child AND l.ref_no=r.return_no AND l.company_code=r.company_code AND l.change_type IN ('SALE_RETURN','DAMAGE_WRITEOFF') AND l.qty_change>0)
            AND NOT EXISTS(SELECT 1 FROM production_conversion_return_receipts r WHERE r.batch_no=child)
          GROUP BY i.id
        UNION SELECT a.batch_no FROM inv_batches b JOIN sal_store_sales s ON s.sale_no=b.source_no AND s.company_code=b.company_code
          JOIN store_sale_allocations a ON a.sale_id=s.id AND b.batch_no='RET-'||s.sale_no||'-'||a.id
          WHERE b.batch_no=child AND b.source_type='STORE_RETURN' AND a.returned_qty>0
            AND EXISTS(SELECT 1 FROM inv_ledger l WHERE l.batch_no=child AND l.ref_no=s.sale_no AND l.company_code=s.company_code AND l.change_type='SALE_RETURN' AND l.qty_change=a.returned_qty)
      $$;
      CREATE FUNCTION vet_egg_batch_sources(batch text) RETURNS TABLE(flock_no text,production_date date) LANGUAGE sql STABLE ROWS 4 SET jit=off AS $$
        WITH RECURSIVE ancestors(id) AS (
          SELECT batch UNION SELECT p.parent FROM ancestors a CROSS JOIN LATERAL vet_egg_parent_batches(a.id) p
        ), nodes AS MATERIALIZED (SELECT b.* FROM ancestors a JOIN inv_batches b ON b.batch_no=a.id),
        linked AS MATERIALIZED (SELECT n.batch_no,s.* FROM nodes n CROSS JOIN LATERAL vet_egg_linked_sources(n.batch_no) s),
        temp AS (SELECT n.batch_no,CASE WHEN t.batch_no IS NOT NULL THEN t.flock_no ELSE vet_egg_old_temp_flock(n) END AS flock_no,
          COALESCE(t.production_date,n.egg_date) AS production_date FROM inv_batches n JOIN ancestors a ON a.id=n.batch_no
          LEFT JOIN brd_egg_temp_origins t ON t.batch_no=n.batch_no WHERE n.source_type='TEMP_PRODUCTION'
          AND NOT EXISTS(SELECT 1 FROM linked l WHERE l.batch_no=n.batch_no))
        SELECT l.flock_no,l.production_date FROM linked l UNION SELECT t.flock_no,t.production_date FROM temp t
        UNION SELECT NULL::text,NULL::date FROM nodes n WHERE n.material_code IS NULL
          AND n.source_type IN ('RETURN','STORE_RETURN','TRANSFER','TRANSFER_DAMAGE','DEFECT_TRANSFER')
          AND NOT EXISTS(SELECT 1 FROM linked l WHERE l.batch_no=n.batch_no)
          AND (NOT EXISTS(SELECT 1 FROM vet_egg_parent_batches(n.batch_no)) OR EXISTS(SELECT 1 FROM vet_egg_parent_batches(n.batch_no) p WHERE p.parent IS NULL))
        UNION SELECT NULL::text,NULL::date FROM nodes n WHERE n.batch_no<>batch AND n.source_type IS NULL AND n.material_code IS NULL
          AND NOT EXISTS(SELECT 1 FROM linked l WHERE l.batch_no=n.batch_no) AND NOT EXISTS(SELECT 1 FROM vet_egg_parent_batches(n.batch_no))
      $$;

      CREATE FUNCTION vet_egg_batch_held(batch text) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS(SELECT 1 FROM vet_egg_batch_sources(batch) s
          WHERE s.flock_no IS NULL OR s.production_date IS NULL OR vet_egg_day_held(s.flock_no,s.production_date))
      $$;
      CREATE FUNCTION vet_egg_check_stock() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE source record; disposition text := current_setting('phoenix.egg_disposition',true);
      BEGIN
        FOR source IN SELECT flock_no,production_date FROM vet_egg_batch_sources(OLD.batch_no)
          ORDER BY 1,2
        LOOP
          IF current_setting('transaction_isolation')<>'read committed' THEN
            RAISE EXCEPTION '库存来源操作须使用实时事务快照' USING ERRCODE='40001';
          END IF;
          PERFORM pg_advisory_xact_lock_shared(hashtext('vet:egg-flock'),hashtext(source.flock_no));
          IF (source.flock_no IS NULL OR source.production_date IS NULL) AND disposition IS DISTINCT FROM 'REVERSAL' THEN
            RAISE EXCEPTION '包装库存缺可核验产蛋来源，须留置核对' USING ERRCODE='23514';
          END IF;
          IF source.flock_no IS NULL OR source.production_date IS NULL OR vet_egg_day_held(source.flock_no,source.production_date) THEN
            IF disposition IN ('SCRAP','REVERSAL')
              AND NEW.qty<OLD.qty AND NEW.qty>=0 AND (to_jsonb(OLD)-ARRAY['qty','qty_available','updated_at'])=
                (to_jsonb(NEW)-ARRAY['qty','qty_available','updated_at'])
              AND NEW.qty_available IS NOT DISTINCT FROM (CASE WHEN OLD.qty_available IS NULL THEN NULL
                WHEN disposition='REVERSAL' AND OLD.status<>'AVAILABLE' THEN OLD.qty_available
                ELSE GREATEST(0,OLD.qty_available+NEW.qty-OLD.qty) END) THEN
              IF disposition='SCRAP' AND EXISTS (
                SELECT 1 FROM brd_egg_course_intervals m WHERE m.flock_no=source.flock_no AND m.start_date<=source.production_date
                  AND (m.last_day IS NULL OR m.last_day>=source.production_date)
                  AND NOT (upper(m.status)='CANCELLED' AND vet_egg_all_signed(m.id,source.flock_no,source.production_date,'RELEASE'))
                  AND NOT vet_egg_all_signed(m.id,source.flock_no,source.production_date,'DISPOSE')) THEN
                RAISE EXCEPTION '隔离来源尚未获得独立质检报损签认' USING ERRCODE='23514';
              END IF;
            ELSE
              RAISE EXCEPTION '产蛋日处于用药/休药隔离期' USING ERRCODE='23514';
            END IF;
          END IF;
        END LOOP;
        RETURN NEW;
      END $$;
      -- Tie exceptional debits to their own completed loss/reversal and the exact ledger entry at commit.
      -- A visible uncommitted tuple is ours; a released savepoint may give it a subtransaction xmin.
      CREATE FUNCTION vet_egg_own_write(row_xid xid) RETURNS boolean LANGUAGE sql VOLATILE AS $$
        SELECT CASE WHEN age(row_xid)>0 THEN false ELSE
          pg_xact_status((pg_current_xact_id()::text::numeric-age(row_xid))::text::xid8)='in progress' END
      $$;
      CREATE FUNCTION vet_egg_check_reservation_release() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE src record; protected boolean:=false; receipt record;
      BEGIN
        FOR src IN SELECT * FROM vet_egg_batch_sources(OLD.batch_no) ORDER BY 1,2 LOOP
          IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION '库存来源须使用实时快照' USING ERRCODE='40001'; END IF;
          PERFORM pg_advisory_xact_lock_shared(hashtext('vet:egg-flock'),hashtext(src.flock_no));
          protected:=protected OR src.flock_no IS NULL OR src.production_date IS NULL OR vet_egg_day_held(src.flock_no,src.production_date);
        END LOOP;
        IF NOT protected THEN RETURN NEW; END IF;
        IF NEW.qty_available>NEW.qty OR (to_jsonb(OLD)-ARRAY['qty_available','updated_at'])<>(to_jsonb(NEW)-ARRAY['qty_available','updated_at']) THEN
          RAISE EXCEPTION '撤单只能解除原预占' USING ERRCODE='23514';
        END IF;
        SELECT a.id AS allocation_id,so.id AS order_id,l.id AS ledger_id,act.qty,a.released_qty AS prior_released INTO receipt
          FROM sal_order_item_batch_allocation_actions act JOIN sal_order_item_batch_allocations a ON a.id=act.allocation_id
          JOIN sal_order_items oi ON oi.id=a.sales_order_item_id JOIN sal_sales_orders so ON so.id=oi.sales_order_id
          JOIN inv_ledger l ON l.id=act.ledger_id JOIN inv_ledger orig ON orig.id=a.reservation_ledger_id
          WHERE a.batch_no=OLD.batch_no AND so.company_code=OLD.company_code AND act.sales_order_id=so.id
            AND act.action_type='RELEASED' AND act.action_key='order-cancel:'||so.id AND act.qty=NEW.qty_available-OLD.qty_available
            AND a.reserved_qty-a.outbound_qty-a.released_qty=act.qty
            AND orig.change_type='RESERVED' AND orig.qty_change=-a.reserved_qty AND orig.batch_no=a.batch_no AND orig.ref_no=so.order_no
            AND l.change_type='RELEASED' AND l.qty_change=act.qty AND l.ref_no=so.order_no AND l.batch_no=a.batch_no
            AND l.company_code=so.company_code AND l.warehouse_code=OLD.warehouse_code AND l.operator=act.created_by
            AND vet_egg_own_write(l.xmin) AND vet_egg_own_write(act.xmin)
            AND NOT EXISTS(SELECT 1 FROM brd_egg_reservation_releases r WHERE r.allocation_id=a.id);
        IF NOT FOUND THEN RAISE EXCEPTION '休药隔离期可用量增加须有同事务原订单释放流水' USING ERRCODE='23514'; END IF;
        INSERT INTO brd_egg_reservation_releases(ledger_id,allocation_id,order_id,batch_no,qty,prior_released)
          VALUES(receipt.ledger_id,receipt.allocation_id,receipt.order_id,OLD.batch_no,receipt.qty,receipt.prior_released);
        RETURN NEW;
      END $$;
      CREATE TRIGGER vet_check_stock BEFORE UPDATE ON inv_batches FOR EACH ROW WHEN ((${ordinaryGuard}) AND (${availabilityCredit}) IS NOT TRUE)
        EXECUTE FUNCTION vet_egg_check_stock();
      CREATE TRIGGER vet_check_reservation_credit BEFORE UPDATE ON inv_batches FOR EACH ROW WHEN (${availabilityCredit})
        EXECUTE FUNCTION vet_egg_check_reservation_release();
      CREATE FUNCTION vet_egg_verify_cancelled_order() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM sal_sales_orders so JOIN sal_order_item_batch_allocations a ON a.id=NEW.allocation_id
          WHERE so.id=NEW.order_id AND so.status='CANCELLED' AND vet_egg_own_write(so.xmin) AND vet_egg_own_write(a.xmin)
            AND a.released_qty=NEW.prior_released+NEW.qty AND a.released_qty+a.outbound_qty=a.reserved_qty) THEN
          RAISE EXCEPTION '隔离预占释放须与原订单撤销一起提交' USING ERRCODE='23514';
        END IF;
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER vet_verify_cancelled_order AFTER INSERT ON brd_egg_reservation_releases DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION vet_egg_verify_cancelled_order();

      CREATE FUNCTION vet_egg_verify_disposition() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE ledger record;
      BEGIN
        IF NOT vet_egg_batch_held(NEW.batch_no) THEN RETURN NULL; END IF;
        SELECT l.* INTO STRICT ledger FROM inv_ledger l WHERE l.batch_no=NEW.batch_no
          AND vet_egg_own_write(l.xmin) AND l.qty_change=NEW.qty-OLD.qty
          AND (l.change_type,l.business_type) IN (('LOSS','SCRAP'),('PRODUCTION_INBOUND_REVERSAL','FORMAL_PRODUCTION_REVERSAL'))
          AND NOT EXISTS(SELECT 1 FROM brd_egg_disposition_receipts r WHERE r.ledger_id=l.id);
        IF ledger.qty_change IS DISTINCT FROM NEW.qty-OLD.qty OR (
          ledger.change_type='LOSS' AND ledger.business_type='SCRAP' AND EXISTS(SELECT 1 FROM wms_stocktake w
            WHERE w.stocktake_no=ledger.ref_no AND w.status='APPROVED' AND w.auditor=ledger.operator
              AND w.warehouse_code=NEW.warehouse_code AND vet_egg_own_write(w.xmin))
          OR ledger.change_type='PRODUCTION_INBOUND_REVERSAL' AND ledger.business_type='FORMAL_PRODUCTION_REVERSAL' AND EXISTS (
            SELECT 1 FROM production_inbound_documents r JOIN production_inbound_lines l ON l.document_id=r.id
              WHERE r.kind='REVERSAL' AND r.state='POSTED' AND r.document_no=ledger.ref_no AND l.inventory_ledger_id=ledger.id
                AND r.approved_by<>r.created_by AND r.approved_hash=r.content_hash AND l.batch_no=NEW.batch_no
                AND l.quantity=-ledger.qty_change AND vet_egg_own_write(r.xmin))) IS DISTINCT FROM true THEN
          RAISE EXCEPTION '隔离扣减必须有同事务逐批报损或冲销回执' USING ERRCODE='23514';
        END IF;
        INSERT INTO brd_egg_disposition_receipts(ledger_id,batch_no,qty,reference,kind)
          VALUES(ledger.id,NEW.batch_no,OLD.qty-NEW.qty,ledger.ref_no,ledger.business_type);
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER vet_verify_disposition AFTER UPDATE ON inv_batches DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW WHEN (NEW.qty<OLD.qty) EXECUTE FUNCTION vet_egg_verify_disposition();

      CREATE FUNCTION vet_egg_assert_package_source(source_id bigint) RETURNS void LANGUAGE plpgsql AS $$
      DECLARE src record; flock text;
      BEGIN
        SELECT s.house_code,s.flock_code,COALESCE(s.lay_date,s.production_date) AS day,s.batch_status,s.is_test
          INTO STRICT src FROM pkg_source_batches s WHERE s.id=source_id;
        IF src.is_test THEN RETURN; END IF;
        IF src.batch_status IN ('QC_ON_HOLD','VOID','CANCELLED','SCRAPPED') THEN
          RAISE EXCEPTION '包装来源已隔离或已失效' USING ERRCODE='23514';
        END IF;
        FOR flock IN SELECT NULLIF(src.flock_code,'') WHERE NULLIF(src.flock_code,'') IS NOT NULL
          UNION SELECT o.flock_no FROM brd_flock_occupancies o WHERE o.house_code=src.house_code
            AND o.began_on<=src.day AND (o.ended_on IS NULL OR o.ended_on>src.day)
          UNION SELECT d.flock_no FROM brd_daily_logs d WHERE d.house_code=src.house_code AND d.log_date=src.day
          ORDER BY 1
        LOOP
          PERFORM vet_egg_assert_day(flock,src.day);
        END LOOP;
      END $$;
      CREATE FUNCTION vet_egg_check_grading() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM vet_egg_assert_package_source(NEW.source_batch_id);
        RETURN NEW;
      END $$;
      CREATE TRIGGER vet_check_grading BEFORE INSERT ON pkg_grading_source_links
        FOR EACH ROW EXECUTE FUNCTION vet_egg_check_grading();
      CREATE FUNCTION vet_egg_check_packing() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE codes jsonb; source_id bigint;
      BEGIN
        IF TG_TABLE_NAME='pkg_handover_records' THEN
          SELECT COALESCE(NULLIF(p.grading_codes_json,'[]'::jsonb),jsonb_build_array(p.grading_code))
            INTO codes FROM pkg_packing_records p WHERE p.code=NEW.packing_code;
        ELSE
          codes := COALESCE(NULLIF(NEW.grading_codes_json,'[]'::jsonb),jsonb_build_array(NEW.grading_code));
        END IF;
        FOR source_id IN SELECT DISTINCT l.source_batch_id FROM pkg_grading_source_links l
          JOIN pkg_grading_records g ON g.id=l.grading_id WHERE g.code IN (SELECT jsonb_array_elements_text(codes))
          ORDER BY l.source_batch_id
        LOOP
          PERFORM vet_egg_assert_package_source(source_id);
        END LOOP;
        RETURN NEW;
      END $$;
      CREATE TRIGGER vet_check_packing BEFORE INSERT ON pkg_packing_records FOR EACH ROW EXECUTE FUNCTION vet_egg_check_packing();
      CREATE TRIGGER vet_check_pack_handover BEFORE INSERT ON pkg_handover_records FOR EACH ROW EXECUTE FUNCTION vet_egg_check_packing();

      CREATE FUNCTION vet_egg_check_raw() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE flock text; day date;
      BEGIN
        IF TG_TABLE_NAME='production_raw_receipt_segments' THEN
          flock := NEW.flock_no;
          SELECT production_date INTO STRICT day FROM production_raw_receipts WHERE id=NEW.receipt_id;
        ELSE
          SELECT s.flock_no,r.production_date INTO STRICT flock,day FROM production_raw_receipt_segments s
            JOIN production_raw_receipts r ON r.id=s.receipt_id WHERE s.id=NEW.raw_segment_id;
        END IF;
        PERFORM vet_egg_assert_day(flock,day);
        RETURN NEW;
      END $$;
      CREATE TRIGGER vet_check_raw_receipt BEFORE INSERT ON production_raw_receipt_segments
        FOR EACH ROW EXECUTE FUNCTION vet_egg_check_raw();
      CREATE TRIGGER vet_check_raw_usage BEFORE INSERT ON production_conversion_inputs
        FOR EACH ROW WHEN (NEW.raw_segment_id IS NOT NULL) EXECUTE FUNCTION vet_egg_check_raw();
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`LOCK TABLE brd_egg_vet_reviews,brd_egg_disposition_receipts,brd_egg_inherited_packs,brd_egg_temp_origins,brd_egg_derived_origins,brd_egg_reservation_releases IN ACCESS EXCLUSIVE MODE`);
    if ((await q.query('SELECT 1 FROM brd_egg_vet_reviews UNION ALL SELECT 1 FROM brd_egg_disposition_receipts UNION ALL SELECT 1 FROM brd_egg_inherited_packs UNION ALL SELECT 1 FROM brd_egg_temp_origins UNION ALL SELECT 1 FROM brd_egg_derived_origins UNION ALL SELECT 1 FROM brd_egg_reservation_releases LIMIT 1')).length) {
      throw new Error('隔离签认已有业务记录，须先执行受控恢复');
    }
    await q.query(`
      DROP TRIGGER vet_check_raw_usage ON production_conversion_inputs;
      DROP TRIGGER vet_check_raw_receipt ON production_raw_receipt_segments;
      DROP FUNCTION vet_egg_check_raw();
      DROP TRIGGER vet_check_pack_handover ON pkg_handover_records;
      DROP TRIGGER vet_check_packing ON pkg_packing_records;
      DROP FUNCTION vet_egg_check_packing();
      DROP TRIGGER vet_check_grading ON pkg_grading_source_links;
      DROP FUNCTION vet_egg_check_grading();
      DROP FUNCTION vet_egg_assert_package_source(bigint);
      DROP TRIGGER vet_check_reservation_credit ON inv_batches;
      DROP TABLE brd_egg_reservation_releases;
      DROP FUNCTION vet_egg_verify_cancelled_order();
      DROP FUNCTION vet_egg_check_reservation_release();
      DROP TRIGGER vet_verify_disposition ON inv_batches;
      DROP FUNCTION vet_egg_verify_disposition();
      DROP FUNCTION vet_egg_own_write(xid);
      DROP FUNCTION vet_egg_batch_held(text);
      DROP TRIGGER vet_check_stock ON inv_batches;
      DROP FUNCTION vet_egg_check_stock();
      DROP FUNCTION vet_egg_batch_sources(text);
      DROP FUNCTION vet_egg_linked_sources(text);
      DROP FUNCTION vet_egg_parent_batches(text);
      DROP FUNCTION vet_egg_old_temp_flock(inv_batches);
      DROP FUNCTION vet_egg_house_flock(text,text,date);
      DROP TABLE brd_egg_derived_origins,brd_egg_temp_origins;
      DROP FUNCTION vet_egg_pack_refs(text);
      DROP TABLE brd_egg_inherited_packs;
      DROP INDEX ix_egg_source_flock_day;
      DROP TRIGGER vet_check_link ON inv_flock_source_links;
      DROP FUNCTION vet_egg_check_link();
      DROP TRIGGER vet_lock_report ON brd_daily_logs;
      DROP FUNCTION vet_egg_lock_report();
      DROP TRIGGER vet_lock_course ON brd_medication_records;
      DROP FUNCTION vet_egg_lock_course();
      DROP FUNCTION vet_egg_assert_day(text,date);
      DROP FUNCTION vet_egg_day_held(text,date);
      DROP FUNCTION vet_egg_all_signed(integer,text,date,text);
      DROP FUNCTION vet_egg_source_facts(brd_daily_logs);
      DROP VIEW brd_egg_course_intervals;
      ALTER TABLE brd_medication_records DROP COLUMN cancelled_on;
      DROP TABLE brd_egg_disposition_receipts,brd_egg_qc_decisions,brd_egg_vet_reviews;
    `);
  }
}
