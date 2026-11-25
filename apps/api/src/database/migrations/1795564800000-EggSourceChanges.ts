/** @allow-data-dml: UP defines immutable triggers and a date exclusion constraint. It writes no business data. */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class EggSourceChanges1795564800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await q.query(`
      ALTER TABLE md_egg_source_profiles
        ADD CONSTRAINT ex_egg_source_active_period EXCLUDE USING gist (
          company_code WITH =, house_code WITH =,
          daterange(effective_date, expire_date, '[]') WITH &&
        ) WHERE (status = 'ACTIVE');
      ALTER TABLE md_egg_source_profiles DROP CONSTRAINT uq_egg_source_house_date;

      CREATE TABLE md_egg_source_changes (
        id uuid PRIMARY KEY,
        request_key uuid NOT NULL,
        company_code varchar(64) NOT NULL,
        farm_code varchar(64) NOT NULL,
        site_code varchar(64) NOT NULL,
        house_code varchar(64) NOT NULL,
        effective_date date NOT NULL,
        target_class varchar(16) NOT NULL CHECK (target_class IN ('STANDARD','RED','PINK')),
        state varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (state IN
          ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED','REVOKE_REQUESTED','REVOKED')),
        version integer NOT NULL DEFAULT 1,
        created_by varchar(128) NOT NULL,
        last_editor varchar(128) NOT NULL,
        approved_by varchar(128) CHECK (approved_by IS NULL OR approved_by <> created_by),
        previous_profile_code varchar(64) REFERENCES md_egg_source_profiles(profile_code),
        new_profile_code varchar(64) UNIQUE REFERENCES md_egg_source_profiles(profile_code),
        payload jsonb NOT NULL,
        approval jsonb,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE (company_code, request_key)
      );
      CREATE INDEX ix_egg_source_change_house ON md_egg_source_changes (company_code, house_code, effective_date DESC);
      CREATE TABLE md_egg_source_change_events (
        change_id uuid NOT NULL REFERENCES md_egg_source_changes(id),
        action_key uuid NOT NULL,
        actor_id varchar(128) NOT NULL,
        action varchar(24) NOT NULL,
        input_sha256 varchar(64) NOT NULL,
        receipt jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY (change_id, action_key)
      );
      CREATE TRIGGER egg_source_events_immutable BEFORE UPDATE OR DELETE ON md_egg_source_change_events
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();

      CREATE TABLE md_egg_history_reviews (
        id uuid PRIMARY KEY,
        request_key uuid NOT NULL,
        company_code varchar(64) NOT NULL,
        farm_code varchar(64) NOT NULL,
        site_code varchar(64) NOT NULL,
        house_code varchar(64) NOT NULL,
        production_date date NOT NULL,
        batch_no varchar(128) NOT NULL,
        source_line varchar(160) NOT NULL,
        quantity integer CHECK (quantity > 0),
        target_class varchar(16) NOT NULL CHECK (target_class IN ('STANDARD','RED','PINK')),
        state varchar(16) NOT NULL DEFAULT 'SUBMITTED' CHECK (state IN ('SUBMITTED','APPROVED','REJECTED')),
        created_by varchar(128) NOT NULL,
        reviewed_by varchar(128) CHECK (reviewed_by IS NULL OR reviewed_by <> created_by),
        payload jsonb NOT NULL,
        review jsonb,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        reviewed_at timestamptz,
        UNIQUE (company_code, request_key)
      );
      CREATE INDEX ix_egg_history_review_house ON md_egg_history_reviews (company_code, house_code, production_date DESC);
      CREATE TABLE md_egg_history_dispositions (
        review_id uuid NOT NULL REFERENCES md_egg_history_reviews(id),
        inventory_ledger_id bigint NOT NULL REFERENCES inv_ledger(id),
        recorded_by varchar(128) NOT NULL,
        receipt jsonb NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        PRIMARY KEY (review_id, inventory_ledger_id)
      );
      CREATE TRIGGER egg_history_disposition_immutable BEFORE UPDATE OR DELETE ON md_egg_history_dispositions
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
      CREATE FUNCTION preserve_egg_history_review() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'EGG_HISTORY_EVIDENCE_IMMUTABLE'; END IF;
        IF OLD.state <> 'SUBMITTED' OR NEW.state NOT IN ('APPROVED','REJECTED')
          OR NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR NEW.review IS NULL
          OR (to_jsonb(OLD) - ARRAY['state','reviewed_by','reviewed_at','review'])
             IS DISTINCT FROM (to_jsonb(NEW) - ARRAY['state','reviewed_by','reviewed_at','review']) THEN
          RAISE EXCEPTION 'EGG_HISTORY_EVIDENCE_IMMUTABLE';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER egg_history_review_immutable BEFORE UPDATE OR DELETE ON md_egg_history_reviews
        FOR EACH ROW EXECUTE FUNCTION preserve_egg_history_review();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM md_egg_source_changes) OR EXISTS (SELECT 1 FROM md_egg_history_reviews) THEN
          RAISE EXCEPTION 'EGG_SOURCE_DOWN_HOLD: preserve issued approvals, schedules and evidence';
        END IF;
      END $$;
      DROP TABLE md_egg_history_dispositions;
      DROP TABLE md_egg_history_reviews;
      DROP FUNCTION preserve_egg_history_review();
      DROP TABLE md_egg_source_change_events;
      DROP TABLE md_egg_source_changes;
      ALTER TABLE md_egg_source_profiles
        ADD CONSTRAINT uq_egg_source_house_date UNIQUE (company_code, house_code, effective_date);
      ALTER TABLE md_egg_source_profiles DROP CONSTRAINT ex_egg_source_active_period;
    `);
  }
}
