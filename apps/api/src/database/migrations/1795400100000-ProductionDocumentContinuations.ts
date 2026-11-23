import { MigrationInterface, QueryRunner } from 'typeorm';

const qualityTables = ['qa_inspections', 'qa_product_inspections', 'qa_non_conformance'] as const;

/** @allow-data-dml: Schema-only migration. INSERT/UPDATE below are trigger events, not business data changes. */
export class ProductionDocumentContinuations1795400100000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS production_inbound_reissues (
        predecessor_id uuid PRIMARY KEY REFERENCES production_inbound_documents(id),
        successor_id uuid NOT NULL UNIQUE REFERENCES production_inbound_documents(id),
        company_code text NOT NULL,
        intent_key text NOT NULL,
        predecessor_version integer NOT NULL CHECK (predecessor_version > 0),
        requested_by text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CHECK (predecessor_id <> successor_id),
        UNIQUE (company_code, intent_key)
      );
      CREATE OR REPLACE TRIGGER trg_reissue_immutable BEFORE UPDATE OR DELETE ON production_inbound_reissues
        FOR EACH ROW EXECUTE FUNCTION production_inbound_fact_immutable();

      CREATE OR REPLACE FUNCTION protect_production_reissue_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS(SELECT 1 FROM production_inbound_reissues) THEN
          RAISE EXCEPTION 'PRODUCTION_REISSUE_IMMUTABLE' USING ERRCODE='23514';
        END IF;
        RETURN NULL;
      END $$;
      CREATE OR REPLACE TRIGGER trg_reissue_truncate BEFORE TRUNCATE ON production_inbound_reissues
        FOR EACH STATEMENT EXECUTE FUNCTION protect_production_reissue_history();

      CREATE OR REPLACE FUNCTION check_production_inbound_posting_day() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.expected_posting_date IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date
          OR NEW.receipt->>'postingDate' IS DISTINCT FROM NEW.expected_posting_date::text THEN
          RAISE EXCEPTION 'PRODUCTION_POSTING_DAY_CHANGED' USING ERRCODE='23514';
        END IF;
        RETURN NULL;
      END $$;
      DROP TRIGGER IF EXISTS trg_production_inbound_posting_day ON production_inbound_documents;
      CREATE CONSTRAINT TRIGGER trg_production_inbound_posting_day AFTER INSERT OR UPDATE ON production_inbound_documents
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.state='POSTED')
        EXECUTE FUNCTION check_production_inbound_posting_day();

      -- Formal production creates EGG date/sequence batches and PIN UUID source documents.
      -- Extract whole identifiers from both structured fields, including old serialized/escaped JSON.
      CREATE OR REPLACE FUNCTION production_inspection_refs(items text, failures text) RETURNS text[]
        LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
      DECLARE raw text; parsed jsonb; decoded text := '';
      BEGIN
        FOREACH raw IN ARRAY ARRAY[items,failures] LOOP
          IF raw IS NULL THEN CONTINUE; END IF;
          IF pg_input_is_valid(raw, 'jsonb') THEN
            parsed := raw::jsonb;
            IF jsonb_typeof(parsed)='string' AND pg_input_is_valid(parsed #>> '{}','jsonb') THEN
              parsed := (parsed #>> '{}')::jsonb;
            END IF;
            raw := parsed #>> '{}';
          END IF;
          decoded := concat_ws(' ', decoded, raw);
        END LOOP;
        RETURN ARRAY(SELECT DISTINCT m[1] FROM regexp_matches(decoded,
          '(EGG-[0-9]{8}-[0-9]{5,}|PIN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})','g') AS m);
      END $$;

      CREATE OR REPLACE FUNCTION production_quality_fact_refs(fact jsonb) RETURNS text[]
        LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
        SELECT array_remove(array_append(production_inspection_refs(fact->>'items_json',fact->>'fail_items_json'),
          NULLIF(btrim(fact->>'batch_no'),'')),NULL)
      $$;

      -- A reference can be recorded before the original batch even becomes visible.
      -- Acquire the same identity locks at registration and reversal commit, regardless of batch existence.
      CREATE OR REPLACE FUNCTION lock_production_quality_refs(refs text[], registration boolean)
        RETURNS void LANGUAGE plpgsql AS $$
      DECLARE token text; acquired boolean;
      BEGIN
        FOR token IN SELECT DISTINCT ref FROM unnest(refs) ref ORDER BY ref LOOP
          IF registration THEN
            acquired := pg_try_advisory_xact_lock_shared(hashtext('phoenix:quality-ref'),hashtext(token));
          ELSE
            acquired := pg_try_advisory_xact_lock(hashtext('phoenix:quality-ref'),hashtext(token));
          END IF;
          IF NOT acquired THEN RAISE EXCEPTION 'PRODUCTION_QUALITY_BATCH_BUSY' USING ERRCODE='23514'; END IF;
        END LOOP;
      END $$;
      CREATE OR REPLACE FUNCTION guard_quality_production_references() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE fact jsonb := to_jsonb(NEW); refs text[]; batches text[];
      BEGIN
        IF upper(btrim(COALESCE(fact->>'status',''))) IN ('CANCELLED','CANCELED','VOID') THEN RETURN NEW; END IF;
        refs := production_quality_fact_refs(fact);
        IF cardinality(refs)=0 THEN RETURN NEW; END IF;
        IF current_setting('transaction_isolation') NOT IN ('read committed','read uncommitted')
          AND EXISTS(SELECT 1 FROM unnest(refs) token WHERE token ~ '^(EGG-[0-9]{8}-[0-9]{5,}|PIN-[0-9a-f-]{36})$') THEN
          RAISE EXCEPTION 'PRODUCTION_QUALITY_BATCH_BUSY' USING ERRCODE='23514';
        END IF;
        PERFORM lock_production_quality_refs(refs,true);
        SELECT ARRAY(SELECT l.batch_no FROM production_inbound_lines l
          JOIN production_inbound_documents d ON d.id=l.document_id AND d.kind='INBOUND' AND d.state='POSTED'
          WHERE l.batch_no=ANY(refs)
          UNION SELECT l.batch_no FROM production_inbound_documents d
          JOIN production_inbound_lines l ON l.document_id=d.id
          WHERE d.document_no=ANY(refs) AND d.kind='INBOUND' AND d.state='POSTED') INTO batches;
        IF cardinality(batches)=0 THEN RETURN NEW; END IF;
        -- Serialize all quality writers (including generic CRUD) with validateReversal's ordered batch locks.
        -- UPDATE already owns its QA tuple. Old API versions may hold a batch and wait for that tuple.
        -- Never wait here (even for multi-row writes). The caller can retry after the competing transaction.
        BEGIN
          PERFORM b.batch_no FROM inv_batches b WHERE b.batch_no=ANY(batches) ORDER BY b.batch_no FOR SHARE NOWAIT;
        EXCEPTION WHEN lock_not_available THEN
          RAISE EXCEPTION 'PRODUCTION_QUALITY_BATCH_BUSY' USING ERRCODE='23514';
        END;
        IF EXISTS(SELECT 1 FROM production_inbound_lines l JOIN production_inbound_documents d ON d.id=l.document_id
          WHERE l.batch_no=ANY(batches) AND d.state='POSTED' GROUP BY l.batch_no
          HAVING SUM(CASE WHEN d.kind='INBOUND' THEN l.quantity ELSE -l.quantity END)<=0) THEN
          RAISE EXCEPTION 'PRODUCTION_QUALITY_BATCH_REVERSED' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;

      CREATE OR REPLACE FUNCTION check_production_reversal_quality() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE refs text[]; original_no text; name text; relation regclass; held boolean;
      BEGIN
        SELECT document_no INTO STRICT original_no FROM production_inbound_documents WHERE id=NEW.original_document_id;
        SELECT array_append(array_agg(batch_no ORDER BY batch_no),original_no) INTO refs
          FROM production_inbound_lines WHERE document_id=NEW.id;
        PERFORM lock_production_quality_refs(refs,false);
        -- READ COMMITTED is required to observe a registration that committed after this transaction began.
        IF current_setting('transaction_isolation') NOT IN ('read committed','read uncommitted') THEN
          RAISE EXCEPTION 'PRODUCTION_QUALITY_BATCH_BUSY' USING ERRCODE='23514';
        END IF;
        FOREACH name IN ARRAY ARRAY['qa_inspections','qa_product_inspections','qa_non_conformance'] LOOP
          relation := to_regclass(name);
          IF relation IS NULL THEN CONTINUE; END IF;
          IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=relation AND tgname='trg_quality_production_refs'
            AND tgenabled IN ('A','O')) THEN
            RAISE EXCEPTION 'PRODUCTION_QUALITY_LOCK_UNAVAILABLE' USING ERRCODE='23514';
          END IF;
          EXECUTE format($query$SELECT EXISTS(SELECT 1 FROM %s q WHERE
            upper(btrim(COALESCE(to_jsonb(q)->>'status',''))) NOT IN ('CANCELLED','CANCELED','VOID')
            AND production_quality_fact_refs(to_jsonb(q)) && $1)$query$, relation) INTO held USING refs;
          IF held THEN RAISE EXCEPTION 'PRODUCTION_REVERSAL_DOWNSTREAM_HOLD' USING ERRCODE='23514'; END IF;
        END LOOP;
        RETURN NULL;
      END $$;
      DROP TRIGGER IF EXISTS trg_production_reversal_quality ON production_inbound_documents;
      CREATE CONSTRAINT TRIGGER trg_production_reversal_quality AFTER INSERT OR UPDATE ON production_inbound_documents
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.kind='REVERSAL' AND NEW.state='POSTED')
        EXECUTE FUNCTION check_production_reversal_quality();
    `);
    for (const table of qualityTables) {
      const [schema] = await q.query('SELECT to_regclass($1) AS relation', [table]);
      if (schema.relation) {
        await q.query(`CREATE OR REPLACE TRIGGER trg_quality_production_refs BEFORE INSERT OR UPDATE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION guard_quality_production_references()`);
      }
    }
  }

  async down(q: QueryRunner): Promise<void> {
    const ownsTransaction = !q.isTransactionActive;
    if (ownsTransaction) await q.startTransaction();
    try {
      await q.query('LOCK TABLE production_inbound_documents,production_inbound_reissues IN ACCESS EXCLUSIVE MODE');
      const [facts] = await q.query(`SELECT EXISTS(SELECT 1 FROM production_inbound_reissues)
        OR EXISTS(SELECT 1 FROM production_inbound_documents WHERE state='POSTED') AS present`);
      if (facts.present) throw new Error('PRODUCTION_CONTINUATION_DOWN_BLOCKED: posting or reissue history exists');
      for (const table of qualityTables) {
        const [schema] = await q.query('SELECT to_regclass($1) AS relation', [table]);
        if (schema.relation) await q.query(`DROP TRIGGER IF EXISTS trg_quality_production_refs ON ${table}`);
      }
      await q.query(`DROP FUNCTION guard_quality_production_references();
        DROP TRIGGER trg_production_reversal_quality ON production_inbound_documents;
        DROP FUNCTION check_production_reversal_quality();
        DROP FUNCTION lock_production_quality_refs(text[],boolean);
        DROP FUNCTION production_quality_fact_refs(jsonb);
        DROP FUNCTION production_inspection_refs(text,text);
        DROP TRIGGER trg_production_inbound_posting_day ON production_inbound_documents;
        DROP FUNCTION check_production_inbound_posting_day();
        DROP TABLE production_inbound_reissues;
        DROP FUNCTION protect_production_reissue_history()`);
      if (ownsTransaction) await q.commitTransaction();
    } catch (error) {
      if (ownsTransaction) await q.rollbackTransaction();
      throw error;
    }
  }
}
