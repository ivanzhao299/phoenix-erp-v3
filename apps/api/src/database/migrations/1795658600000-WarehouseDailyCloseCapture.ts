import { MigrationInterface, QueryRunner } from 'typeorm';

/** @allow-data-dml: trigger definitions capture future physical inventory and ledger events transactionally. */
export class WarehouseDailyCloseCapture1795658600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wms_close_capture_epoch AS SELECT clock_timestamp() AS initialized_at;
      CREATE TABLE wms_close_capture (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        source_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),
        event_kind text NOT NULL CHECK (event_kind IN ('PHYSICAL','LEDGER')),
        batch_no text,
        ledger_id bigint,
        company_code text,
        warehouse_code text,
        unit text,
        movement_type text,
        quantity numeric,
        source_business_date date
      );
      CREATE INDEX wms_close_capture_xid_idx ON wms_close_capture(source_xid,id);
      CREATE INDEX wms_close_capture_scope_idx ON wms_close_capture(company_code,warehouse_code,id);
      CREATE TABLE wms_daily_close_activation (
        company_code text NOT NULL,
        warehouse_code text NOT NULL,
        first_business_date date NOT NULL,
        authorized_by text NOT NULL,
        evidence_ref text NOT NULL CHECK (btrim(evidence_ref)<>''),
        enabled boolean NOT NULL DEFAULT false,
        PRIMARY KEY (company_code, warehouse_code)
      );
      CREATE TABLE wms_daily_closes (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        company_code text NOT NULL CHECK (btrim(company_code) <> ''),
        warehouse_code text NOT NULL CHECK (btrim(warehouse_code) <> ''),
        business_date date NOT NULL,
        request_key uuid NOT NULL UNIQUE,
        version text NOT NULL,
        closed_by text NOT NULL,
        closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        snapshot jsonb NOT NULL,
        UNIQUE(company_code,warehouse_code,business_date)
      );
      CREATE TABLE wms_close_event_claims (
        event_id bigint PRIMARY KEY REFERENCES wms_close_capture(id),
        close_id bigint NOT NULL REFERENCES wms_daily_closes(id)
      );
      CREATE INDEX wms_close_event_claims_close_idx ON wms_close_event_claims(close_id);

      CREATE FUNCTION record_wms_close_physical() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF TG_OP='UPDATE' AND (OLD.batch_no,OLD.company_code,OLD.warehouse_code,OLD.unit)
            IS NOT DISTINCT FROM (NEW.batch_no,NEW.company_code,NEW.warehouse_code,NEW.unit) THEN
          IF OLD.qty IS DISTINCT FROM NEW.qty THEN
            INSERT INTO wms_close_capture(event_kind,batch_no,company_code,warehouse_code,unit,quantity)
              VALUES ('PHYSICAL',NEW.batch_no,NEW.company_code,NEW.warehouse_code,NEW.unit,NEW.qty-OLD.qty);
          END IF;
          RETURN NEW;
        END IF;
        IF TG_OP<>'INSERT' THEN
          INSERT INTO wms_close_capture(event_kind,batch_no,company_code,warehouse_code,unit,quantity)
            VALUES ('PHYSICAL',OLD.batch_no,OLD.company_code,OLD.warehouse_code,OLD.unit,-OLD.qty);
        END IF;
        IF TG_OP<>'DELETE' THEN
          INSERT INTO wms_close_capture(event_kind,batch_no,company_code,warehouse_code,unit,quantity)
            VALUES ('PHYSICAL',NEW.batch_no,NEW.company_code,NEW.warehouse_code,NEW.unit,NEW.qty);
          RETURN NEW;
        END IF;
        RETURN OLD;
      END $fn$;
      CREATE TRIGGER inventory_wms_close_capture
        AFTER INSERT OR DELETE OR UPDATE OF batch_no,company_code,warehouse_code,unit,qty
        ON inv_batches FOR EACH ROW EXECUTE FUNCTION record_wms_close_physical();

      CREATE FUNCTION record_wms_close_ledger() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE batch_row inv_batches%ROWTYPE;
      BEGIN
        SELECT * INTO batch_row FROM inv_batches WHERE batch_no=NEW.batch_no;
        INSERT INTO wms_close_capture(event_kind,batch_no,company_code,warehouse_code,unit,movement_type,quantity,source_business_date,ledger_id)
          VALUES ('LEDGER',NEW.batch_no,
            COALESCE(NULLIF(NULLIF(NEW.company_code,''),'ALL'),batch_row.company_code),
            COALESCE(NULLIF(NEW.warehouse_code,''),batch_row.warehouse_code),
            COALESCE(NULLIF(NEW.unit,''),batch_row.unit),NEW.change_type,NEW.qty_change,NEW.log_date,NEW.id);
        RETURN NEW;
      END $fn$;
      CREATE FUNCTION reject_legacy_warehouse_close() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF TG_OP<>'INSERT' AND upper(OLD.stocktake_no) LIKE 'DC-%' THEN
          RAISE EXCEPTION '历史日结记录为只读' USING ERRCODE='23514';
        END IF;
        IF TG_OP<>'DELETE' AND upper(NEW.stocktake_no) LIKE 'DC-%' THEN
          RAISE EXCEPTION '仓库日结需要使用专用接口' USING ERRCODE='23514';
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $fn$;
      CREATE TRIGGER legacy_warehouse_close_readonly
        BEFORE INSERT OR UPDATE OR DELETE ON wms_stocktake FOR EACH ROW EXECUTE FUNCTION reject_legacy_warehouse_close();
      CREATE TRIGGER ledger_wms_close_capture
        AFTER INSERT ON inv_ledger FOR EACH ROW EXECUTE FUNCTION record_wms_close_ledger();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $down$ BEGIN
        IF EXISTS (SELECT 1 FROM wms_daily_closes) OR EXISTS (SELECT 1 FROM wms_close_event_claims) THEN
          RAISE EXCEPTION 'Cannot drop sealed warehouse close snapshots or event claims';
        END IF;
      END $down$;
      DROP TRIGGER legacy_warehouse_close_readonly ON wms_stocktake;
      DROP FUNCTION reject_legacy_warehouse_close();
      DROP TRIGGER ledger_wms_close_capture ON inv_ledger;
      DROP TRIGGER inventory_wms_close_capture ON inv_batches;
      DROP FUNCTION record_wms_close_ledger();
      DROP FUNCTION record_wms_close_physical();
      DROP TABLE wms_close_event_claims;
      DROP TABLE wms_daily_closes;
      DROP TABLE wms_daily_close_activation;
      DROP TABLE wms_close_capture;
      DROP TABLE wms_close_capture_epoch;
    `);
  }
}
