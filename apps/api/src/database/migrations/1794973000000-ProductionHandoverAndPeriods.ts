import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: DDL-only UPDATE OR DELETE trigger events; no business DML is executed. */
export class ProductionHandoverAndPeriods1794973000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS production_physical_handovers(
      id uuid PRIMARY KEY,company_code text NOT NULL,house_code text NOT NULL,production_date date NOT NULL,
      scope_id uuid NOT NULL REFERENCES production_cutover_scopes(id),handover_ref text NOT NULL,
      content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),payload jsonb NOT NULL,
      creation_hash text NOT NULL CHECK(creation_hash ~ '^[a-f0-9]{64}$'),
      -- Original handovers have no predecessor; exactly one explicit successor per cancelled record.
      replaces_id uuid REFERENCES production_physical_handovers(id) UNIQUE,
      state text NOT NULL DEFAULT 'DRAFT' CHECK(state IN ('DRAFT','CONFIRMED','CANCELLED')),
      version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL,confirmed_by text,
      created_at timestamptz NOT NULL DEFAULT now(),confirmed_at timestamptz,
      CHECK(state<>'CONFIRMED' OR (confirmed_by IS NOT NULL AND confirmed_by<>created_by AND confirmed_at IS NOT NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_production_handover_live ON production_physical_handovers(company_code,handover_ref) WHERE state<>'CANCELLED';
    CREATE INDEX IF NOT EXISTS ix_production_handover_day ON production_physical_handovers(company_code,house_code,production_date,state);
    CREATE TABLE IF NOT EXISTS production_handover_cancellations(
      id uuid PRIMARY KEY,handover_id uuid NOT NULL UNIQUE REFERENCES production_physical_handovers(id),
      original_hash text NOT NULL,reason text NOT NULL,evidence jsonb NOT NULL,actor text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION guard_production_handover() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF TG_OP='DELETE' OR OLD.state='CANCELLED' OR NEW.version<>OLD.version+1 OR NEW.state NOT IN ('CONFIRMED','CANCELLED')
        OR (to_jsonb(OLD)-'state'-'version'-'confirmed_by'-'confirmed_at') IS DISTINCT FROM
          (to_jsonb(NEW)-'state'-'version'-'confirmed_by'-'confirmed_at') THEN
        RAISE EXCEPTION 'PRODUCTION_HANDOVER_IMMUTABLE' USING ERRCODE='23514';
      END IF;
      IF OLD.state='CONFIRMED' AND (NEW.state<>'CANCELLED' OR OLD.confirmed_by IS DISTINCT FROM NEW.confirmed_by
        OR OLD.confirmed_at IS DISTINCT FROM NEW.confirmed_at) THEN RAISE EXCEPTION 'PRODUCTION_HANDOVER_SIGNATURE_IMMUTABLE' USING ERRCODE='23514'; END IF;
      IF NEW.state='CANCELLED' AND (NOT EXISTS(SELECT 1 FROM production_handover_cancellations c WHERE c.handover_id=OLD.id AND c.original_hash=OLD.content_hash)
        OR EXISTS(SELECT 1 FROM production_inbound_documents d WHERE d.company_code=OLD.company_code AND d.handover_ref=OLD.handover_ref
          AND d.kind='INBOUND' AND d.state<>'CANCELLED')) THEN RAISE EXCEPTION 'PRODUCTION_HANDOVER_CANCELLATION_HOLD' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $body$;
    DROP TRIGGER IF EXISTS trg_production_handover ON production_physical_handovers;
    CREATE TRIGGER trg_production_handover BEFORE UPDATE OR DELETE ON production_physical_handovers
      FOR EACH ROW EXECUTE FUNCTION guard_production_handover();
    CREATE TABLE IF NOT EXISTS production_posting_periods(
      company_code text NOT NULL,period_month text NOT NULL CHECK(period_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
      state text NOT NULL CHECK(state IN ('OPEN','CLOSED')),version integer NOT NULL CHECK(version>0),
      signed_by text NOT NULL,owner_house_code text NOT NULL,evidence_file_id text NOT NULL,evidence_checksum text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(company_code,period_month)
    );
    CREATE TABLE IF NOT EXISTS production_posting_period_events(
      id uuid PRIMARY KEY,company_code text NOT NULL,period_month text NOT NULL,state text NOT NULL,
      version integer NOT NULL,signed_by text NOT NULL,evidence_file_id text NOT NULL,evidence_checksum text NOT NULL,
      reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_code,period_month,version)
    );
    ALTER TABLE production_financial_clearances ADD COLUMN IF NOT EXISTS period_versions jsonb NOT NULL;
    CREATE OR REPLACE FUNCTION guard_production_period() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF TG_OP='DELETE' OR OLD.company_code<>NEW.company_code OR OLD.period_month<>NEW.period_month OR NEW.version<>OLD.version+1 THEN
        RAISE EXCEPTION 'PRODUCTION_PERIOD_VERSION_REQUIRED' USING ERRCODE='23514';
      END IF; RETURN NEW;
    END $body$;
    DROP TRIGGER IF EXISTS trg_production_period ON production_posting_periods;
    CREATE TRIGGER trg_production_period BEFORE UPDATE OR DELETE ON production_posting_periods
      FOR EACH ROW EXECUTE FUNCTION guard_production_period();
    DROP TRIGGER IF EXISTS trg_production_period_event ON production_posting_period_events;
    CREATE TRIGGER trg_production_period_event BEFORE UPDATE OR DELETE ON production_posting_period_events
      FOR EACH ROW EXECUTE FUNCTION production_inbound_fact_immutable();
    DROP TRIGGER IF EXISTS trg_production_handover_cancellation ON production_handover_cancellations;
    CREATE TRIGGER trg_production_handover_cancellation BEFORE UPDATE OR DELETE ON production_handover_cancellations
      FOR EACH ROW EXECUTE FUNCTION production_inbound_fact_immutable()`);
  }
  async down(q: QueryRunner): Promise<void> {
    const own=!q.isTransactionActive; if (own) await q.startTransaction();
    try {
      await q.query('LOCK TABLE production_physical_handovers,production_handover_cancellations,production_posting_periods,production_posting_period_events,production_financial_clearances IN ACCESS EXCLUSIVE MODE');
      for(const table of ['production_physical_handovers','production_handover_cancellations','production_posting_periods','production_posting_period_events','production_financial_clearances']) {
        if((await q.query(`SELECT 1 FROM ${table} LIMIT 1`)).length)throw new Error('PRODUCTION_HANDOVER_PERIOD_DOWN_HOLD: signed facts exist');
      }
      await q.query(`ALTER TABLE production_financial_clearances DROP COLUMN IF EXISTS period_versions;
        DROP TABLE IF EXISTS production_posting_period_events;DROP TABLE IF EXISTS production_posting_periods;
        DROP TABLE IF EXISTS production_handover_cancellations;
        DROP TABLE IF EXISTS production_physical_handovers;DROP FUNCTION IF EXISTS guard_production_handover();
        DROP FUNCTION IF EXISTS guard_production_period()`);
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
}
