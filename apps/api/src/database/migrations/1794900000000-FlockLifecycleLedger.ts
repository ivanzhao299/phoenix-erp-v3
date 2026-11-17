/** @allow-data-dml: DDL-only immutable/overlap trigger event UPDATE OR DELETE is a scanner false positive; up has no business data DML. */
import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive structure only. Existing flocks require an approved physical-count baseline. */
export class FlockLifecycleLedger1794900000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS brd_flock_documents (
        id text PRIMARY KEY, source_key text NOT NULL, content_hash text NOT NULL,
        kind text NOT NULL CHECK (kind IN ('BASELINE','ADMIT','MORTALITY','CULL','SELL_HELD','TRANSFER','ADJUST','REVERSE','CLOSE','CLEAN_START','CLEAN_ACCEPT','HISTORY_AUTH')),
        company_code text NOT NULL, farm_code text NOT NULL, site_code text NOT NULL DEFAULT '',
        house_code text NOT NULL, flock_no text NOT NULL DEFAULT '', business_date date NOT NULL,
        payload jsonb NOT NULL, status text NOT NULL DEFAULT 'DRAFT'
          CHECK(status IN ('DRAFT','SUBMITTED','APPROVED','POSTED','CANCELLED')),
        version integer NOT NULL DEFAULT 0 CHECK(version>=0), created_by text NOT NULL,
        approved_by text NOT NULL DEFAULT '', posted_by text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz,
        UNIQUE(company_code,source_key)
      );
      CREATE TABLE IF NOT EXISTS brd_flock_occupancies (
        id text PRIMARY KEY, flock_no text NOT NULL, house_code text NOT NULL,
        company_code text NOT NULL, farm_code text NOT NULL, site_code text NOT NULL DEFAULT '',
        began_on date NOT NULL, ended_on date, capacity_snapshot integer NOT NULL CHECK(capacity_snapshot>0), opened_document_id text NOT NULL REFERENCES brd_flock_documents(id),
        closed_document_id text REFERENCES brd_flock_documents(id),
        CHECK(ended_on IS NULL OR ended_on>began_on)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_flock_house_open ON brd_flock_occupancies(house_code) WHERE ended_on IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_flock_open ON brd_flock_occupancies(flock_no) WHERE ended_on IS NULL;
      CREATE INDEX IF NOT EXISTS ix_flock_occupancy_date ON brd_flock_occupancies(house_code,began_on,ended_on);
      CREATE TABLE IF NOT EXISTS brd_flock_balances (
        flock_no text PRIMARY KEY, company_code text NOT NULL, farm_code text NOT NULL, site_code text NOT NULL DEFAULT '',
        house_code text NOT NULL, quantity integer NOT NULL CHECK(quantity>=0), version integer NOT NULL DEFAULT 0 CHECK(version>=0),
        baseline_on date NOT NULL, last_business_date date NOT NULL, closed_on date,
        CHECK(last_business_date>=baseline_on), CHECK(closed_on IS NULL OR quantity=0)
      );
      CREATE TABLE IF NOT EXISTS brd_flock_house_states (
        house_code text PRIMARY KEY, state text NOT NULL CHECK(state IN ('OCCUPIED','DIRTY','CLEANING','READY')),
        version integer NOT NULL DEFAULT 0 CHECK(version>=0), document_id text NOT NULL REFERENCES brd_flock_documents(id),
        last_occupied_on date
      );
      CREATE TABLE IF NOT EXISTS brd_flock_held_balances (
        id text PRIMARY KEY, flock_no text NOT NULL, company_code text NOT NULL, farm_code text NOT NULL,
        house_code text NOT NULL, position_code text NOT NULL, quantity integer NOT NULL CHECK(quantity>=0),
        version integer NOT NULL DEFAULT 0 CHECK(version>=0), document_id text NOT NULL UNIQUE REFERENCES brd_flock_documents(id)
      );
      CREATE TABLE IF NOT EXISTS brd_flock_events (
        id text PRIMARY KEY, document_id text NOT NULL REFERENCES brd_flock_documents(id), line_no integer NOT NULL CHECK(line_no>0),
        flock_no text NOT NULL DEFAULT '', occupancy_id text REFERENCES brd_flock_occupancies(id),
        company_code text NOT NULL, farm_code text NOT NULL, site_code text NOT NULL DEFAULT '', house_code text NOT NULL,
        business_date date NOT NULL, kind text NOT NULL,
        quantity_delta integer NOT NULL DEFAULT 0, held_delta integer NOT NULL DEFAULT 0,
        held_id text REFERENCES brd_flock_held_balances(id), reversal_of text REFERENCES brd_flock_events(id),
        actor text NOT NULL, approved_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE(document_id,line_no)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_flock_event_reversal ON brd_flock_events(reversal_of) WHERE reversal_of IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_flock_event_day ON brd_flock_events(flock_no,business_date);
      CREATE TABLE IF NOT EXISTS brd_flock_daily_balances (
        flock_no text NOT NULL, balance_date date NOT NULL, opening_qty integer NOT NULL CHECK(opening_qty>=0),
        closing_qty integer NOT NULL CHECK(closing_qty>=0), mortality_qty integer NOT NULL DEFAULT 0 CHECK(mortality_qty>=0),
        elimination_qty integer NOT NULL DEFAULT 0 CHECK(elimination_qty>=0),
        PRIMARY KEY(flock_no,balance_date)
      );
      CREATE TABLE IF NOT EXISTS brd_flock_document_audits (
        id text PRIMARY KEY, document_id text NOT NULL REFERENCES brd_flock_documents(id), action text NOT NULL,
        actor text NOT NULL, version integer NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        UNIQUE(document_id,version)
      );
      CREATE OR REPLACE FUNCTION phoenix_flock_occupancy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext(NEW.house_code));
        IF EXISTS(SELECT 1 FROM brd_flock_occupancies o WHERE o.id<>NEW.id
          AND (o.house_code=NEW.house_code OR o.flock_no=NEW.flock_no)
          AND daterange(o.began_on,o.ended_on,'[)') && daterange(NEW.began_on,NEW.ended_on,'[)'))
        THEN RAISE EXCEPTION 'flock occupancy overlaps'; END IF;
        RETURN NEW;
      END; $$;
      DROP TRIGGER IF EXISTS flock_occupancy_no_overlap ON brd_flock_occupancies;
      CREATE TRIGGER flock_occupancy_no_overlap BEFORE INSERT OR UPDATE ON brd_flock_occupancies
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_occupancy_guard();
      CREATE OR REPLACE FUNCTION phoenix_flock_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'flock documents cannot be deleted'; END IF;
        IF OLD.status IN ('POSTED','CANCELLED') OR
          (to_jsonb(NEW)-ARRAY['status','version','approved_by','posted_by','posted_at']) IS DISTINCT FROM
          (to_jsonb(OLD)-ARRAY['status','version','approved_by','posted_by','posted_at']) OR NEW.version<>OLD.version+1
        THEN RAISE EXCEPTION 'flock document content is immutable'; END IF;
        RETURN NEW;
      END; $$;
      DROP TRIGGER IF EXISTS flock_document_guard ON brd_flock_documents;
      CREATE TRIGGER flock_document_guard BEFORE UPDATE OR DELETE ON brd_flock_documents
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_document_guard();
      CREATE OR REPLACE FUNCTION phoenix_flock_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'posted flock facts are immutable; use reversal'; END; $$;
      DROP TRIGGER IF EXISTS flock_events_immutable ON brd_flock_events;
      CREATE TRIGGER flock_events_immutable BEFORE UPDATE OR DELETE ON brd_flock_events
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
      DROP TRIGGER IF EXISTS flock_audits_immutable ON brd_flock_document_audits;
      CREATE TRIGGER flock_audits_immutable BEFORE UPDATE OR DELETE ON brd_flock_document_audits
        FOR EACH ROW EXECUTE FUNCTION phoenix_flock_immutable();
    `);
    if (await q.hasTable('brd_flocks')) {
      await q.query('ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS planned_elimination_date date');
    }
    if (await q.hasTable('brd_daily_logs')) {
      await q.query(`ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS occupancy_id text REFERENCES brd_flock_occupancies(id)`);
    }
    await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,dict_label_en,sort_no,status) VALUES
      ('BRD_FLOCK_SOURCE','SUPPLIER','外购入栏','Supplier',1,'ACTIVE'),
      ('BRD_FLOCK_SOURCE','INTERNAL','内部育成交接','Internal rearing',2,'ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING`);
    // Workflow values are dictionaries, separate from BRD_FLOCK_STATUS growth stages.
    await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,dict_label_en,sort_no,status) VALUES
      ('BRD_LIFECYCLE_KIND','BASELINE','历史盘点基线','Physical baseline',1,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','ADMIT','入栏','Admission',2,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','MORTALITY','死亡处置','Mortality disposal',3,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','CULL','淘汰移出待售','Cull to holding',4,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','SELL_HELD','待售鸡交付核销','Holding dispatch',5,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','TRANSFER','整群转舍','Whole flock transfer',6,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','ADJUST','盘点调整','Count adjustment',7,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','REVERSE','冲销更正','Reversal',8,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','CLOSE','关闭鸡群','Close flock',9,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','CLEAN_START','开始清舍','Start cleaning',10,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','CLEAN_ACCEPT','清舍验收','Accept cleaning',11,'ACTIVE'),
      ('BRD_LIFECYCLE_KIND','HISTORY_AUTH','历史期间更正授权','History authorization',12,'ACTIVE')
      ON CONFLICT(dict_type,dict_code) DO NOTHING`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Revert only an unused installation: never silently drop a posted ledger.
    for(const table of ['brd_flock_documents','brd_flock_document_audits','brd_flock_events','brd_flock_occupancies',
      'brd_flock_balances','brd_flock_daily_balances','brd_flock_house_states','brd_flock_held_balances']) {
      if(await q.hasTable(table)) {
        const [r]=await q.query(`SELECT COUNT(*)::integer AS n FROM "${table}"`);
        if(r.n>0) throw new Error(`Flock ledger contains facts in ${table}: stop writes and use reviewed recovery, no destructive down`);
      }
    }
    for(const [table,column] of [['brd_daily_logs','occupancy_id'],['brd_flocks','planned_elimination_date']]) {
      if(await q.hasTable(table) && await q.hasColumn(table,column)) {
        const [r]=await q.query(`SELECT COUNT(*)::integer AS n FROM "${table}" WHERE "${column}" IS NOT NULL`);
        if(r.n>0) throw new Error(`Flock lifecycle column ${table}.${column} contains facts; recovery required`);
      }
    }
    if (await q.hasTable('brd_daily_logs')) await q.query('ALTER TABLE brd_daily_logs DROP COLUMN IF EXISTS occupancy_id');
    if (await q.hasTable('brd_flocks')) await q.query('ALTER TABLE brd_flocks DROP COLUMN IF EXISTS planned_elimination_date');
    await q.query(`DROP TABLE IF EXISTS brd_flock_daily_balances;
      DROP TABLE IF EXISTS brd_flock_document_audits;
      DROP TABLE IF EXISTS brd_flock_events;
      DROP TABLE IF EXISTS brd_flock_held_balances;
      DROP TABLE IF EXISTS brd_flock_house_states;
      DROP TABLE IF EXISTS brd_flock_balances;
      DROP TABLE IF EXISTS brd_flock_occupancies;
      DROP TABLE IF EXISTS brd_flock_documents;
      DROP FUNCTION IF EXISTS phoenix_flock_immutable();
      DROP FUNCTION IF EXISTS phoenix_flock_document_guard();
      DROP FUNCTION IF EXISTS phoenix_flock_occupancy_guard()`);
    // Keep shared dictionary rows: an operator may have configured labels/permissions.
  }
}
