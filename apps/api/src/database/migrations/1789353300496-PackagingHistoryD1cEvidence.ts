import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * D1-C only: five evidence tables; no intent, receipt queue or TEMP allocation.
 * @allow-data-dml: DDL-only CREATE TRIGGER event clauses UPDATE ON / UPDATE OR are regex false positives; up contains no business-data DML.
 */
export class PackagingHistoryD1cEvidence1789353300496 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE OR REPLACE FUNCTION packing_json_canonical(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $fn$
      DECLARE result text;
      BEGIN
        IF jsonb_typeof(v)='object' THEN
          SELECT '{'||COALESCE(string_agg(to_jsonb(key)::text||':'||packing_json_canonical(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);
        ELSIF jsonb_typeof(v)='array' THEN
          SELECT '['||COALESCE(string_agg(packing_json_canonical(value),',' ORDER BY ordinal),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY x(value,ordinal);
        ELSE result:=v::text; END IF;
        RETURN result;
      END $fn$`);
    await q.query(`CREATE OR REPLACE FUNCTION packing_posting_state(rec jsonb,batches jsonb,ledger jsonb,handovers jsonb,receipt jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
      DECLARE fallback text; groups jsonb; inbound jsonb; outputs jsonb; expected jsonb;
      BEGIN
        fallback:=CASE WHEN jsonb_array_length(handovers)>0 THEN 'HANDOVER_ONLY' WHEN jsonb_array_length(batches)>0 OR jsonb_array_length(ledger)>0 OR receipt IS NOT NULL THEN 'INVENTORY_ONLY' ELSE 'PENDING' END;
        IF jsonb_array_length(handovers)<>1 THEN RETURN fallback; END IF;
        outputs:=rec->'batches_json';
        IF jsonb_typeof(outputs) IS DISTINCT FROM 'array' THEN RETURN fallback; END IF;
        IF jsonb_array_length(outputs)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(outputs) o WHERE
          jsonb_typeof(o->'eggs') IS DISTINCT FROM 'number' OR jsonb_typeof(o->'boxes') IS DISTINCT FROM 'number'
          OR (o->>'eggs')::numeric<=0 OR (o->>'boxes')::numeric<=0 OR trunc((o->>'eggs')::numeric)<>(o->>'eggs')::numeric
          OR trunc((o->>'boxes')::numeric)<>(o->>'boxes')::numeric OR mod((o->>'eggs')::numeric,NULLIF((o->>'boxes')::numeric,0))<>0)
          OR (SELECT sum((o->>'eggs')::numeric) FROM jsonb_array_elements(outputs) o) IS DISTINCT FROM (rec->>'total_eggs')::numeric
          OR (SELECT sum((o->>'boxes')::numeric) FROM jsonb_array_elements(outputs) o) IS DISTINCT FROM (rec->>'total_boxes')::numeric THEN RETURN fallback; END IF;
        SELECT COALESCE(jsonb_agg(x),'[]') INTO inbound FROM jsonb_array_elements(ledger) x WHERE x->>'change_type'='PACKAGING_INBOUND';
        IF receipt IS NOT NULL THEN
          groups:=receipt->'groups';
          IF jsonb_typeof(groups) IS DISTINCT FROM 'array' OR jsonb_array_length(groups)=0 THEN RETURN fallback; END IF;
          IF receipt->>'originalHash' IS DISTINCT FROM encode(sha256(convert_to(packing_json_canonical(jsonb_build_object('date',rec->'production_date','outputs',outputs,'totalEggs',rec->'total_eggs','totalBoxes',rec->'total_boxes')),'UTF8')),'hex')
            OR receipt->>'handoverCode' IS DISTINCT FROM handovers->0->>'code'
            OR jsonb_array_length(inbound)<>jsonb_array_length(groups)
            OR (SELECT count(DISTINCT x->>'ledgerId') FROM jsonb_array_elements(groups) x)<>jsonb_array_length(groups)
            OR (SELECT count(DISTINCT x->>'batchNo') FROM jsonb_array_elements(groups) x)<>jsonb_array_length(groups)
            OR (SELECT count(DISTINCT (x->>'skuCode',x->>'specCode')) FROM jsonb_array_elements(groups) x)<>jsonb_array_length(groups)
            OR (SELECT sum((x->>'qty')::numeric) FROM jsonb_array_elements(groups) x) IS DISTINCT FROM (rec->>'total_eggs')::numeric
            OR EXISTS(SELECT 1 FROM jsonb_array_elements(groups) g WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(inbound) l
              WHERE l->>'id'=g->>'ledgerId' AND l->>'batch_no'=g->>'batchNo' AND l->>'ref_no'=rec->>'code'
                AND (l->>'qty_change')::numeric=(g->>'qty')::numeric AND l->>'sku_code'=g->>'skuCode'
                AND l->>'company_code'=g->>'companyCode' AND l->>'warehouse_code'=g->>'warehouseCode' AND l->>'location_code'=g->>'locationCode')) THEN RETURN fallback; END IF;
          RETURN 'COMMITTED';
        END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(outputs) o WHERE o->>'skuCode' IS NULL OR o->>'specId' IS NULL OR o->>'productCode' IS NULL) THEN RETURN fallback; END IF;
        SELECT jsonb_agg(to_jsonb(g)) INTO expected FROM (SELECT o->>'skuCode' sku,o->>'specId' spec,o->>'productCode' product,sum((o->>'eggs')::numeric) qty FROM jsonb_array_elements(outputs) o GROUP BY 1,2,3) g;
        IF expected IS NULL OR jsonb_array_length(batches)<>jsonb_array_length(expected) OR jsonb_array_length(inbound)<>jsonb_array_length(expected)
          OR (SELECT count(DISTINCT x->>'batch_no') FROM jsonb_array_elements(batches) x)<>jsonb_array_length(expected)
          OR (SELECT count(DISTINCT (x->>'sku_code',x->>'spec_code',x->>'product_code')) FROM jsonb_array_elements(batches) x)<>jsonb_array_length(expected)
          OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(inbound) x)<>jsonb_array_length(expected)
          OR handovers->0->>'production_date' IS DISTINCT FROM rec->>'production_date'
          OR (handovers->0->>'box_count')::numeric IS DISTINCT FROM (rec->>'total_boxes')::numeric
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(expected) g WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(batches) b
            JOIN jsonb_array_elements(inbound) l ON l->>'batch_no'=b->>'batch_no'
            WHERE b->>'sku_code'=g->>'sku' AND b->>'spec_code'=g->>'spec' AND b->>'product_code'=g->>'product'
              AND (b->>'qty')::numeric=(g->>'qty')::numeric AND (l->>'qty_change')::numeric=(g->>'qty')::numeric
              AND b->>'source_type'='PACKAGING' AND b->>'packaging_batch_ref'=rec->>'code' AND l->>'ref_no'=rec->>'code'
              AND b->>'egg_date'=rec->>'production_date' AND b->>'location_code'=handovers->0->>'location'
              AND l->>'sku_code'=b->>'sku_code' AND l->>'company_code'=b->>'company_code' AND l->>'warehouse_code'=b->>'warehouse_code' AND l->>'location_code'=b->>'location_code')) THEN RETURN fallback; END IF;
        RETURN 'COMMITTED';
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN fallback;
      END $fn$`);

    // Existing legacy table was previously bootstrap-only; match it without rewriting any rows.
    await q.query(`CREATE TABLE IF NOT EXISTS pkg_handover_records (
      id SERIAL PRIMARY KEY,code varchar(80) UNIQUE NOT NULL,shift_id integer,packing_code varchar(80),
      boxes_json jsonb DEFAULT '[]',box_count integer DEFAULT 0,pallet_code varchar(64),location varchar(128),
      receiver varchar(128),production_date date,created_at timestamp DEFAULT now())`);
    await q.query(`ALTER TABLE pkg_packing_records ADD COLUMN IF NOT EXISTS workflow_contract_version integer,
      ADD COLUMN IF NOT EXISTS label_encoding_version text, ADD COLUMN IF NOT EXISTS business_revision bigint NOT NULL DEFAULT 0`);
    await q.query(`CREATE TABLE IF NOT EXISTS pkg_packing_boxes (
      id uuid PRIMARY KEY,packing_id integer NOT NULL REFERENCES pkg_packing_records(id),
      output_ordinal integer NOT NULL CHECK(output_ordinal>=0),box_ordinal integer NOT NULL CHECK(box_ordinal>0),
      original_qty integer NOT NULL CHECK(original_qty>0),UNIQUE(packing_id,output_ordinal,box_ordinal))`);
    await q.query(`CREATE TABLE IF NOT EXISTS pkg_packing_code_registry (
      normalized_code text PRIMARY KEY CHECK(length(normalized_code) BETWEEN 1 AND 100),
      state text NOT NULL CHECK(state IN ('BOUND','AMBIGUOUS','RETIRED')),
      owner_box_id uuid REFERENCES pkg_packing_boxes(id),
      CHECK((state='BOUND' AND owner_box_id IS NOT NULL) OR (state<>'BOUND' AND owner_box_id IS NULL)))`);
    await q.query(`CREATE TABLE IF NOT EXISTS pkg_packing_operations (
      id uuid PRIMARY KEY,actor_id bigint NOT NULL REFERENCES sys_user(user_id),action text NOT NULL,
      idempotency_key uuid NOT NULL,packing_id integer NOT NULL REFERENCES pkg_packing_records(id),payload_hash text NOT NULL,
      state text NOT NULL CHECK(state IN ('PENDING','COMMITTED')),result_event_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),committed_at timestamptz,
      UNIQUE(actor_id,action,idempotency_key),CHECK(state<>'COMMITTED' OR (result_event_id IS NOT NULL AND committed_at IS NOT NULL)))`);
    await q.query(`CREATE TABLE IF NOT EXISTS pkg_packing_events (
      id uuid PRIMARY KEY,packing_id integer NOT NULL REFERENCES pkg_packing_records(id),
      event_type text NOT NULL CHECK(event_type IN ('REGISTRATION','PRINT_REQUEST','PRINT_RESULT','VERIFICATION_SESSION','BOX_VERIFIED','LABEL_VOID','COMMIT_RECEIPT')),
      actor_id bigint NOT NULL REFERENCES sys_user(user_id),server_at timestamptz NOT NULL DEFAULT now(),
      event_key text UNIQUE NOT NULL,operation_id uuid NOT NULL REFERENCES pkg_packing_operations(id),
      box_id uuid REFERENCES pkg_packing_boxes(id),session_id uuid REFERENCES pkg_packing_events(id),
      schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),payload_hash text NOT NULL,
      CHECK(event_type NOT IN ('PRINT_REQUEST','BOX_VERIFIED','LABEL_VOID') OR box_id IS NOT NULL),
      CHECK(event_type<>'BOX_VERIFIED' OR (session_id IS NOT NULL AND payload ?& ARRAY['purpose','method','labelCode','targetRevision'])),
      CHECK(event_type<>'VERIFICATION_SESSION' OR payload ?& ARRAY['purpose','expiresAt','targetRevision']),
      CHECK(event_type<>'PRINT_REQUEST' OR payload ?& ARRAY['labelCode','templateVersion','copies','renderHash']),
      CHECK(event_type<>'PRINT_RESULT' OR (payload ? 'requestId' AND payload->>'type' IN ('DISPATCHED','FAILED','UNKNOWN'))),
      CHECK(event_type<>'COMMIT_RECEIPT' OR payload ?& ARRAY['groups','originalHash','receiverUserId','receiverNameSnapshot','recordedBy','handoverCode']))`);
    await q.query(`DO $do$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ck_packing_event_typed' AND conrelid='pkg_packing_events'::regclass) THEN
      ALTER TABLE pkg_packing_events ADD CONSTRAINT ck_packing_event_typed CHECK((CASE event_type
        WHEN 'VERIFICATION_SESSION' THEN payload->>'purpose' IN ('LABEL_CHECK','HANDOVER') AND jsonb_typeof(payload->'purpose')='string'
          AND length(payload->>'targetRevision')=64 AND jsonb_typeof(payload->'expiresAt')='string'
        WHEN 'BOX_VERIFIED' THEN payload->>'purpose' IN ('LABEL_CHECK','HANDOVER') AND payload->>'method' IN ('SCANNER','MANUAL')
          AND jsonb_typeof(payload->'labelCode')='string' AND length(payload->>'labelCode')>0 AND length(payload->>'targetRevision')=64
        WHEN 'PRINT_REQUEST' THEN jsonb_typeof(payload->'labelCode')='string' AND length(payload->>'labelCode')>0
          AND jsonb_typeof(payload->'templateVersion')='string' AND length(payload->>'templateVersion')>0
          AND payload->'copies'='1'::jsonb AND length(payload->>'renderHash')=64
        WHEN 'PRINT_RESULT' THEN payload->>'type' IN ('DISPATCHED','FAILED','UNKNOWN') AND jsonb_typeof(payload->'requestId')='string' AND length(payload->>'requestId')=36
        WHEN 'COMMIT_RECEIPT' THEN jsonb_typeof(payload->'groups')='array' AND jsonb_array_length(payload->'groups')>0
          AND length(payload->>'originalHash')=64 AND jsonb_typeof(payload->'receiverUserId')='string'
          AND (payload->>'receiverUserId') ~ '^[1-9][0-9]*$' AND jsonb_typeof(payload->'receiverNameSnapshot')='string'
          AND length(payload->>'handoverCode')>0 AND jsonb_typeof(payload->'recordedBy')='string'
        WHEN 'REGISTRATION' THEN jsonb_typeof(payload->'boxes')='array' AND jsonb_array_length(payload->'boxes')>0 AND length(payload->>'reason')>0
        WHEN 'LABEL_VOID' THEN length(payload->>'reason')>0 AND length(payload->>'dispositionDeclaration')>0
        ELSE false END) IS TRUE); END IF; END $do$`);
    await q.query(`CREATE TABLE IF NOT EXISTS pkg_packing_code_claims (
      id uuid PRIMARY KEY,normalized_code text NOT NULL REFERENCES pkg_packing_code_registry(normalized_code),
      box_id uuid NOT NULL REFERENCES pkg_packing_boxes(id),kind text NOT NULL CHECK(kind IN ('CANONICAL','ALIAS')),
      raw_code text NOT NULL,status text NOT NULL CHECK(status IN ('ACTIVE','VOID')),
      evidence_event_id uuid NOT NULL REFERENCES pkg_packing_events(id),UNIQUE(normalized_code,box_id,kind))`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_packing_active_canonical ON pkg_packing_code_claims(box_id) WHERE kind='CANONICAL' AND status='ACTIVE'`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_packing_commit_receipt ON pkg_packing_events(packing_id) WHERE event_type='COMMIT_RECEIPT'`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_packing_session_box ON pkg_packing_events(session_id,box_id,(payload->>'purpose')) WHERE event_type='BOX_VERIFIED'`);
    await q.query(`CREATE INDEX IF NOT EXISTS ix_packing_event_record ON pkg_packing_events(packing_id,server_at,id)`);
    await q.query(`CREATE OR REPLACE FUNCTION check_packing_namespace() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF EXISTS(SELECT 1 FROM pkg_packing_code_registry r WHERE r.normalized_code=NEW.normalized_code AND r.state='BOUND' AND
          (NOT EXISTS(SELECT 1 FROM pkg_packing_code_claims c WHERE c.normalized_code=r.normalized_code AND c.status='ACTIVE' AND c.box_id=r.owner_box_id)
          OR EXISTS(SELECT 1 FROM pkg_packing_code_claims c WHERE c.normalized_code=r.normalized_code AND c.status='ACTIVE' AND c.box_id<>r.owner_box_id))) THEN
          RAISE EXCEPTION 'PACKING_NAMESPACE_CONFLICT' USING ERRCODE='23514';
        END IF;
        RETURN NULL;
      END $fn$`);
    for(const table of ['pkg_packing_code_registry','pkg_packing_code_claims']) {
      await q.query(`DO $do$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='ck_namespace_${table}') THEN
        CREATE CONSTRAINT TRIGGER ck_namespace_${table} AFTER INSERT OR UPDATE ON ${table}
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_packing_namespace(); END IF; END $do$`);
    }
    await q.query(`CREATE OR REPLACE FUNCTION check_packing_event_references() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF NOT EXISTS(SELECT 1 FROM pkg_packing_operations o WHERE o.id=NEW.operation_id AND o.packing_id=NEW.packing_id AND o.actor_id=NEW.actor_id)
          OR (NEW.box_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pkg_packing_boxes b WHERE b.id=NEW.box_id AND b.packing_id=NEW.packing_id))
          OR (NEW.session_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pkg_packing_events s WHERE s.id=NEW.session_id AND s.packing_id=NEW.packing_id
            AND s.actor_id=NEW.actor_id AND s.event_type='VERIFICATION_SESSION' AND s.payload->>'purpose'=NEW.payload->>'purpose')) THEN
          RAISE EXCEPTION 'PACKING_EVENT_REFERENCE_CONFLICT' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $fn$`);
    await q.query(`DO $do$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='packing_event_references') THEN
      CREATE TRIGGER packing_event_references BEFORE INSERT ON pkg_packing_events FOR EACH ROW EXECUTE FUNCTION check_packing_event_references(); END IF; END $do$`);
    await q.query(`CREATE OR REPLACE FUNCTION reject_packing_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN RAISE EXCEPTION 'PACKING_EVENTS_APPEND_ONLY' USING ERRCODE='23514'; END $fn$`);
    await q.query(`DO $do$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='packing_event_immutable') THEN
      CREATE TRIGGER packing_event_immutable BEFORE UPDATE OR DELETE ON pkg_packing_events
      FOR EACH ROW EXECUTE FUNCTION reject_packing_event_mutation(); END IF; END $do$`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Only for an empty isolated evidence model; never drop recorded business evidence.
    await q.query(`DO $do$ BEGIN IF EXISTS(SELECT 1 FROM pkg_packing_events) OR EXISTS(SELECT 1 FROM pkg_packing_boxes) OR EXISTS(SELECT 1 FROM pkg_packing_operations) OR EXISTS(SELECT 1 FROM pkg_packing_code_registry) OR EXISTS(SELECT 1 FROM pkg_packing_code_claims) THEN RAISE EXCEPTION 'EVIDENCE_EXISTS'; END IF; END $do$`);
    await q.query('DROP TABLE IF EXISTS pkg_packing_code_claims');
    await q.query('DROP TABLE IF EXISTS pkg_packing_events');
    await q.query('DROP TABLE IF EXISTS pkg_packing_operations');
    await q.query('DROP TABLE IF EXISTS pkg_packing_code_registry');
    await q.query('DROP TABLE IF EXISTS pkg_packing_boxes');
    await q.query('DROP FUNCTION IF EXISTS packing_posting_state(jsonb,jsonb,jsonb,jsonb,jsonb)');
    await q.query('DROP FUNCTION IF EXISTS packing_json_canonical(jsonb)');
    await q.query('DROP FUNCTION IF EXISTS check_packing_namespace()');
    await q.query('DROP FUNCTION IF EXISTS reject_packing_event_mutation()');
    await q.query('DROP FUNCTION IF EXISTS check_packing_event_references()');
    await q.query(`ALTER TABLE pkg_packing_records DROP COLUMN IF EXISTS workflow_contract_version,
      DROP COLUMN IF EXISTS label_encoding_version,DROP COLUMN IF EXISTS business_revision`);
    // Legacy handover table is retained, regardless of where it was originally created.
  }
}
