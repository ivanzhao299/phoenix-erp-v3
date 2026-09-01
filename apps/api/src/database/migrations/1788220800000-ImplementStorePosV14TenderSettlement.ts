import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: V1-4 新菜单及 MENU_FIN2_AR_LEDGER 当前生产授权集合的收紧式平移
 * V1-4: deterministic pricing, tender evidence and non-GL settlement reconciliation.
 */
export class ImplementStorePosV14TenderSettlement1788220800000 implements MigrationInterface {
  name = 'ImplementStorePosV14TenderSettlement1788220800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sal_price_books
        ADD COLUMN IF NOT EXISTS store_code varchar(64),
        ADD COLUMN IF NOT EXISTS publish_version integer NOT NULL DEFAULT 0;
      ALTER TABLE sal_store_shift_closings
        ADD COLUMN IF NOT EXISTS business_date date;
      ALTER TABLE sal_store_sales
        ADD COLUMN IF NOT EXISTS business_date date,
        ADD COLUMN IF NOT EXISTS price_drift_status varchar(16) NOT NULL DEFAULT 'NONE';
      ALTER TABLE sal_store_sale_items
        ADD COLUMN IF NOT EXISTS price_book_id bigint,
        ADD COLUMN IF NOT EXISTS price_item_id bigint,
        ADD COLUMN IF NOT EXISTS price_publish_version integer,
        ADD COLUMN IF NOT EXISTS price_scope varchar(16),
        ADD COLUMN IF NOT EXISTS price_snapshot jsonb;
      ALTER TABLE store_sale_adjustments
        ADD COLUMN IF NOT EXISTS settlement_id bigint;

      CREATE INDEX IF NOT EXISTS idx_sal_price_books_store
        ON sal_price_books(company_code, store_code) WHERE store_code IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_sal_store_sales_business_date
        ON sal_store_sales(store_code, business_date);

      CREATE TABLE IF NOT EXISTS sal_store_sale_tenders (
        id bigserial PRIMARY KEY,
        sale_id bigint NOT NULL REFERENCES sal_store_sales(id) ON DELETE RESTRICT,
        tender_type varchar(16) NOT NULL,
        currency_code varchar(8) NOT NULL,
        amount numeric(18,2) NOT NULL,
        external_reference varchar(128),
        cash_account_id bigint,
        ar_invoice_id bigint,
        reversal_of_tender_id bigint REFERENCES sal_store_sale_tenders(id) ON DELETE RESTRICT,
        status varchar(16) NOT NULL DEFAULT 'CAPTURED',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_store_tender_type CHECK (tender_type IN ('CASH','QR','TRANSFER','CREDIT')),
        CONSTRAINT chk_store_tender_status CHECK (status IN ('CAPTURED','REVERSED')),
        CONSTRAINT chk_store_tender_amount CHECK (amount > 0)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_store_tender_external_reference
        ON sal_store_sale_tenders(currency_code, external_reference)
        WHERE external_reference IS NOT NULL AND reversal_of_tender_id IS NULL;
      CREATE INDEX IF NOT EXISTS idx_store_tender_sale ON sal_store_sale_tenders(sale_id);

      CREATE TABLE IF NOT EXISTS sal_store_price_drift_events (
        id bigserial PRIMARY KEY,
        sale_id bigint NOT NULL REFERENCES sal_store_sales(id) ON DELETE RESTRICT,
        sale_item_id bigint NOT NULL REFERENCES sal_store_sale_items(id) ON DELETE RESTRICT,
        snapshot_price_item_id bigint,
        current_price_item_id bigint,
        snapshot_unit_price numeric(18,6) NOT NULL,
        current_unit_price numeric(18,6),
        snapshot_publish_version integer,
        current_publish_version integer,
        event_type varchar(32) NOT NULL DEFAULT 'PRICE_VERSION_DRIFT',
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_store_price_drift_sale_item UNIQUE (sale_id, sale_item_id)
      );

      CREATE TABLE IF NOT EXISTS sal_store_settlements (
        id bigserial PRIMARY KEY,
        settlement_no varchar(64) NOT NULL UNIQUE,
        store_code varchar(64) NOT NULL,
        company_code varchar(64) NOT NULL,
        business_date date NOT NULL,
        currency_code varchar(8) NOT NULL,
        tender_total numeric(18,2) NOT NULL DEFAULT 0,
        cash_total numeric(18,2) NOT NULL DEFAULT 0,
        ar_total numeric(18,2) NOT NULL DEFAULT 0,
        evidence_total numeric(18,2) NOT NULL DEFAULT 0,
        difference_amount numeric(18,2) NOT NULL DEFAULT 0,
        match_status varchar(16) NOT NULL DEFAULT 'PENDING',
        status varchar(16) NOT NULL DEFAULT 'DRAFT',
        posted_at timestamptz,
        posted_by bigint,
        posted_by_name varchar(128),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_store_settlement_day UNIQUE (store_code, business_date),
        CONSTRAINT chk_store_settlement_status CHECK (status IN ('DRAFT','EXCEPTION','READY','POSTED')),
        CONSTRAINT chk_store_settlement_match CHECK (match_status IN ('PENDING','MATCHED','EXCEPTION'))
      );
      CREATE TABLE IF NOT EXISTS sal_store_settlement_shifts (
        settlement_id bigint NOT NULL REFERENCES sal_store_settlements(id) ON DELETE RESTRICT,
        shift_id bigint NOT NULL REFERENCES sal_store_shift_closings(id) ON DELETE RESTRICT,
        PRIMARY KEY (settlement_id, shift_id),
        UNIQUE (shift_id)
      );
      CREATE TABLE IF NOT EXISTS sal_store_settlement_reconciliations (
        id bigserial PRIMARY KEY,
        settlement_id bigint NOT NULL REFERENCES sal_store_settlements(id) ON DELETE RESTRICT,
        tender_id bigint REFERENCES sal_store_sale_tenders(id) ON DELETE RESTRICT,
        store_payment_record_id bigint,
        cash_transaction_id bigint,
        ar_invoice_id bigint,
        reference varchar(128) NOT NULL,
        currency_code varchar(8) NOT NULL,
        matched_amount numeric(18,2) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'MATCHED',
        reason text,
        evidence text,
        matched_by bigint,
        matched_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_store_recon_status CHECK (status IN ('MATCHED','EXCEPTION','UNMATCHED')),
        CONSTRAINT chk_store_recon_amount CHECK (matched_amount >= 0)
      );
      CREATE INDEX IF NOT EXISTS idx_store_recon_settlement
        ON sal_store_settlement_reconciliations(settlement_id);
      CREATE OR REPLACE FUNCTION fn_guard_posted_store_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status='POSTED' THEN RAISE EXCEPTION 'POSTED store settlement is immutable'; END IF;
        RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
      END $$;
      DROP TRIGGER IF EXISTS trg_guard_posted_store_settlement ON sal_store_settlements;
      CREATE TRIGGER trg_guard_posted_store_settlement BEFORE UPDATE OR DELETE ON sal_store_settlements
        FOR EACH ROW EXECUTE FUNCTION fn_guard_posted_store_settlement();

      INSERT INTO sys_menu(menu_code, menu_name_zh, domain, sort_order, route)
      VALUES ('MENU_STORE_SETTLEMENT','门店日结审核','FINANCE',75,'/store-settlement')
      ON CONFLICT (menu_code) DO UPDATE SET menu_name_zh=EXCLUDED.menu_name_zh, domain=EXCLUDED.domain,
        route=EXCLUDED.route;
      INSERT INTO sys_role_menu_permission(role_id, menu_id, perm_codes, deny_codes)
      SELECT rp.role_id, settlement.menu_id, rp.perm_codes, rp.deny_codes
        FROM sys_role_menu_permission rp
        JOIN sys_menu source ON source.menu_id=rp.menu_id AND source.menu_code='MENU_FIN2_AR_LEDGER'
        CROSS JOIN sys_menu settlement
       WHERE settlement.menu_code='MENU_STORE_SETTLEMENT'
      ON CONFLICT (role_id, menu_id) DO UPDATE
        SET perm_codes=EXCLUDED.perm_codes, deny_codes=EXCLUDED.deny_codes;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission WHERE menu_id=(SELECT menu_id FROM sys_menu WHERE menu_code='MENU_STORE_SETTLEMENT');
      DELETE FROM sys_menu WHERE menu_code='MENU_STORE_SETTLEMENT';
      DROP TRIGGER IF EXISTS trg_guard_posted_store_settlement ON sal_store_settlements;
      DROP FUNCTION IF EXISTS fn_guard_posted_store_settlement();
      DROP TABLE IF EXISTS sal_store_settlement_reconciliations;
      DROP TABLE IF EXISTS sal_store_settlement_shifts;
      DROP TABLE IF EXISTS sal_store_settlements;
      DROP TABLE IF EXISTS sal_store_price_drift_events;
      DROP TABLE IF EXISTS sal_store_sale_tenders;
      DROP INDEX IF EXISTS idx_sal_store_sales_business_date;
      DROP INDEX IF EXISTS idx_sal_price_books_store;
      ALTER TABLE sal_store_sale_items DROP COLUMN IF EXISTS price_snapshot, DROP COLUMN IF EXISTS price_scope,
        DROP COLUMN IF EXISTS price_publish_version, DROP COLUMN IF EXISTS price_item_id, DROP COLUMN IF EXISTS price_book_id;
      ALTER TABLE sal_store_sales DROP COLUMN IF EXISTS price_drift_status, DROP COLUMN IF EXISTS business_date;
      ALTER TABLE sal_store_shift_closings DROP COLUMN IF EXISTS business_date;
      ALTER TABLE store_sale_adjustments DROP COLUMN IF EXISTS settlement_id;
      ALTER TABLE sal_price_books DROP COLUMN IF EXISTS publish_version, DROP COLUMN IF EXISTS store_code;
    `);
  }
}
