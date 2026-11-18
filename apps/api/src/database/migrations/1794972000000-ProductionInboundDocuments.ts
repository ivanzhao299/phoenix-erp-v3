import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: DDL-only immutable trigger event UPDATE OR DELETE; up contains no business DML. */
export class ProductionInboundDocuments1794972000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD: READ COMMITTED required');
    await q.query(`
      CREATE TABLE IF NOT EXISTS production_inbound_days (
        company_code text NOT NULL,house_code text NOT NULL,production_date date NOT NULL,
        scope_id uuid NOT NULL REFERENCES production_cutover_scopes(id),
        PRIMARY KEY(company_code,house_code,production_date)
      );
      CREATE TABLE IF NOT EXISTS production_inbound_documents (
        id uuid PRIMARY KEY,document_no text NOT NULL UNIQUE,
        company_code text NOT NULL,house_code text NOT NULL,production_date date NOT NULL,
        scope_id uuid NOT NULL REFERENCES production_cutover_scopes(id),
        kind text NOT NULL CHECK(kind IN ('INBOUND','REVERSAL')),
        original_document_id uuid REFERENCES production_inbound_documents(id),
        intent_key text NOT NULL CHECK(length(intent_key) BETWEEN 1 AND 100),
        creation_hash text NOT NULL CHECK(creation_hash ~ '^[a-f0-9]{64}$'),
        handover_ref text CHECK(handover_ref IS NULL OR length(btrim(handover_ref)) BETWEEN 1 AND 100),
        state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','READY','APPROVED','POSTED','CANCELLED')),
        version integer NOT NULL DEFAULT 1 CHECK(version>0),
        payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
        content_hash text CHECK(content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
        submit_key text CHECK(submit_key IS NULL OR length(submit_key) BETWEEN 1 AND 100),
        expected_posting_date date,created_by text NOT NULL,approved_by text,
        approved_hash text,approval_evidence jsonb,receipt jsonb,created_at timestamptz NOT NULL DEFAULT now(),
        ready_at timestamptz,posted_at timestamptz,
        UNIQUE(company_code,intent_key),
        CHECK((kind='REVERSAL')=(original_document_id IS NOT NULL)),
        CHECK(state NOT IN ('APPROVED','POSTED') OR kind='INBOUND' OR
          (approved_by IS NOT NULL AND approved_by<>created_by AND approved_hash IS NOT NULL
            AND content_hash IS NOT NULL AND approved_hash=content_hash AND approval_evidence IS NOT NULL)),
        CHECK(state<>'POSTED' OR (receipt IS NOT NULL AND posted_at IS NOT NULL)),
        CHECK(state IN ('DRAFT','CANCELLED') OR
          (submit_key IS NOT NULL AND content_hash IS NOT NULL AND expected_posting_date IS NOT NULL))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_inbound_handover
        ON production_inbound_documents(company_code,handover_ref)
          WHERE handover_ref IS NOT NULL AND kind='INBOUND' AND state<>'CANCELLED';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_production_inbound_submit
        ON production_inbound_documents(company_code,submit_key) WHERE submit_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_production_inbound_day
        ON production_inbound_documents(company_code,house_code,production_date);
      CREATE TABLE IF NOT EXISTS production_inbound_lines (
        document_id uuid NOT NULL REFERENCES production_inbound_documents(id),line_no integer NOT NULL CHECK(line_no>0),
        grade_code text NOT NULL,sku_code text NOT NULL,product_code text NOT NULL,spec_code text NOT NULL,
        quantity integer NOT NULL CHECK(quantity>0),warehouse_code text NOT NULL,location_code text NOT NULL,
        batch_no text NOT NULL,inventory_ledger_id bigint NOT NULL,
        PRIMARY KEY(document_id,line_no),UNIQUE(inventory_ledger_id)
      );
      CREATE TABLE IF NOT EXISTS production_inbound_allocations (
        id uuid PRIMARY KEY,document_id uuid NOT NULL,line_no integer NOT NULL,
        original_allocation_id uuid REFERENCES production_inbound_allocations(id),
        daily_log_id bigint NOT NULL,report_hash text NOT NULL CHECK(report_hash ~ '^[a-f0-9]{64}$'),
        quantity integer NOT NULL CHECK(quantity>0),direction integer NOT NULL CHECK(direction IN (1,-1)),
        source_key text NOT NULL UNIQUE,source_link_id text NOT NULL,
        source_snapshot jsonb NOT NULL,FOREIGN KEY(document_id,line_no) REFERENCES production_inbound_lines(document_id,line_no),
        CHECK((direction=-1)=(original_allocation_id IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS ix_production_inbound_line_batch ON production_inbound_lines(batch_no);
      CREATE INDEX IF NOT EXISTS ix_production_allocation_report ON production_inbound_allocations(daily_log_id);
      CREATE INDEX IF NOT EXISTS ix_production_allocation_original ON production_inbound_allocations(original_allocation_id);
      CREATE TABLE IF NOT EXISTS production_opening_receipts (
        id uuid PRIMARY KEY,handover_ref text NOT NULL UNIQUE,
        company_code text NOT NULL,warehouse_code text NOT NULL,scope_id uuid NOT NULL REFERENCES production_cutover_scopes(id),
        evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
        manifest jsonb NOT NULL,created_by text NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS production_financial_clearances (
        id uuid PRIMARY KEY,document_id uuid NOT NULL REFERENCES production_inbound_documents(id),
        company_code text NOT NULL,house_code text NOT NULL,content_hash text NOT NULL,
        original_content_hash text NOT NULL,posting_date date NOT NULL,
        period_status text NOT NULL CHECK(period_status='OPEN'),
        costs jsonb NOT NULL CHECK(jsonb_typeof(costs)='array'),
        evidence_file_id text NOT NULL,evidence_checksum text NOT NULL CHECK(evidence_checksum ~ '^[a-f0-9]{64}$'),
        signed_by text NOT NULL,signed_at timestamptz NOT NULL DEFAULT now(),
        clearance_hash text NOT NULL CHECK(clearance_hash ~ '^[a-f0-9]{64}$'),UNIQUE(document_id,signed_by,clearance_hash)
      );
      CREATE OR REPLACE FUNCTION guard_production_inbound_document() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN
        IF TG_OP='DELETE' OR OLD.state IN ('POSTED','CANCELLED') THEN
          RAISE EXCEPTION 'PRODUCTION_INBOUND_DOCUMENT_IMMUTABLE' USING ERRCODE='23514';
        END IF;
        IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'PRODUCTION_INBOUND_VERSION_REQUIRED' USING ERRCODE='23514'; END IF;
        IF OLD.state='APPROVED' AND (OLD.approved_by IS DISTINCT FROM NEW.approved_by
          OR OLD.approved_hash IS DISTINCT FROM NEW.approved_hash OR OLD.approval_evidence IS DISTINCT FROM NEW.approval_evidence) THEN
          RAISE EXCEPTION 'PRODUCTION_INBOUND_APPROVAL_IMMUTABLE' USING ERRCODE='23514';
        END IF;
        IF NOT ((OLD.state='DRAFT' AND NEW.state IN ('DRAFT','READY','CANCELLED'))
          OR (OLD.state='READY' AND NEW.state IN ('APPROVED','POSTED','CANCELLED'))
          OR (OLD.state='APPROVED' AND NEW.state IN ('POSTED','CANCELLED'))) THEN
          RAISE EXCEPTION 'PRODUCTION_INBOUND_INVALID_TRANSITION' USING ERRCODE='23514';
        END IF;
        IF (to_jsonb(OLD)-'payload'-'state'-'version'-'content_hash'-'submit_key'-'expected_posting_date'-'approved_by'
            -'approved_hash'-'approval_evidence'-'receipt'-'ready_at'-'posted_at') IS DISTINCT FROM
           (to_jsonb(NEW)-'payload'-'state'-'version'-'content_hash'-'submit_key'-'expected_posting_date'-'approved_by'
            -'approved_hash'-'approval_evidence'-'receipt'-'ready_at'-'posted_at') THEN
          RAISE EXCEPTION 'PRODUCTION_INBOUND_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
        END IF;
        IF OLD.state<>'DRAFT' AND
          (OLD.payload IS DISTINCT FROM NEW.payload OR OLD.content_hash IS DISTINCT FROM NEW.content_hash
            OR OLD.submit_key IS DISTINCT FROM NEW.submit_key OR OLD.expected_posting_date IS DISTINCT FROM NEW.expected_posting_date) THEN
          RAISE EXCEPTION 'PRODUCTION_INBOUND_FROZEN_CONTENT' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $body$;
      DROP TRIGGER IF EXISTS trg_production_inbound_document ON production_inbound_documents;
      CREATE TRIGGER trg_production_inbound_document BEFORE UPDATE OR DELETE ON production_inbound_documents
        FOR EACH ROW EXECUTE FUNCTION guard_production_inbound_document();
      CREATE OR REPLACE FUNCTION production_inbound_fact_immutable() RETURNS trigger LANGUAGE plpgsql AS $body$
      BEGIN RAISE EXCEPTION 'PRODUCTION_INBOUND_FACT_IMMUTABLE' USING ERRCODE='23514'; END $body$;
    `);
    for (const table of ['production_inbound_lines','production_inbound_allocations','production_opening_receipts','production_inbound_days','production_financial_clearances']) {
      await q.query(`DROP TRIGGER IF EXISTS trg_production_fact_immutable ON ${table};
        CREATE TRIGGER trg_production_fact_immutable BEFORE UPDATE OR DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION production_inbound_fact_immutable()`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if((await q.query('SHOW transaction_isolation'))[0].transaction_isolation!=='read committed')throw new Error('OFFICIAL_MIGRATION_ISOLATION_HOLD: READ COMMITTED required');
    const ownTransaction = !q.isTransactionActive;
    if (ownTransaction) await q.startTransaction();
    try {
      await q.query('LOCK TABLE production_inbound_documents,production_inbound_lines,production_inbound_allocations,production_opening_receipts,production_inbound_days,production_financial_clearances IN ACCESS EXCLUSIVE MODE');
      for (const table of ['production_inbound_documents','production_opening_receipts','production_inbound_days']) {
        if ((await q.query(`SELECT 1 FROM ${table} LIMIT 1`)).length) throw new Error('PRODUCTION_INBOUND_DOWN_BLOCKED: business facts exist');
      }
      await q.query(`DROP TABLE IF EXISTS production_inbound_allocations;
        DROP TABLE IF EXISTS production_financial_clearances;
        DROP TABLE IF EXISTS production_inbound_lines;
        DROP TABLE IF EXISTS production_inbound_documents;
        DROP TABLE IF EXISTS production_opening_receipts;
        DROP TABLE IF EXISTS production_inbound_days;
        DROP FUNCTION IF EXISTS guard_production_inbound_document();
        DROP FUNCTION IF EXISTS production_inbound_fact_immutable()`);
      if (ownTransaction) await q.commitTransaction();
    } catch (error) {
      if (ownTransaction) await q.rollbackTransaction();
      throw error;
    }
  }
}
