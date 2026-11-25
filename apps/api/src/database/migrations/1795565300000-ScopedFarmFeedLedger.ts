import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopedFarmFeedLedger1795565300000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS farm_feed_ledger (
        id            SERIAL PRIMARY KEY,
        ledger_date   DATE         NOT NULL,
        material_name VARCHAR(100) NOT NULL,
        unit          VARCHAR(20)  NOT NULL DEFAULT '公斤',
        sort_order    INT          NOT NULL DEFAULT 0,
        prev_stock    DECIMAL(12,2) NOT NULL DEFAULT 0,
        inbound_qty   DECIMAL(12,2) NOT NULL DEFAULT 0,
        outbound_detail JSONB       NOT NULL DEFAULT '{}',
        outbound_total  DECIMAL(12,2) NOT NULL DEFAULT 0,
        daily_usage   DECIMAL(12,2) NOT NULL DEFAULT 0,
        note          VARCHAR(200),
        operator      VARCHAR(50),
        created_at    TIMESTAMP DEFAULT now(),
        updated_at    TIMESTAMP DEFAULT now(),
        UNIQUE (ledger_date, material_name)
      )`,
    );
    await queryRunner.query('CREATE INDEX IF NOT EXISTS idx_feed_ledger_date ON farm_feed_ledger(ledger_date DESC)');
    await queryRunner.query(
      'CREATE TABLE farm_feed_days (company_code text NOT NULL, farm_code text NOT NULL, ledger_date date NOT NULL, version int NOT NULL DEFAULT 0, operator text NOT NULL, PRIMARY KEY(company_code, farm_code, ledger_date))',
    );
    await queryRunner.query(
      'CREATE TABLE farm_feed_day_items (company_code text NOT NULL, farm_code text NOT NULL, ledger_date date NOT NULL, material_code text NOT NULL, unit text NOT NULL, consumed numeric(14,3), counted numeric(14,3), note text NOT NULL, PRIMARY KEY(company_code, farm_code, ledger_date, material_code, unit), FOREIGN KEY(company_code, farm_code, ledger_date) REFERENCES farm_feed_days(company_code, farm_code, ledger_date))',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DO $$ BEGIN LOCK TABLE farm_feed_days, farm_feed_day_items IN ACCESS EXCLUSIVE MODE; IF EXISTS (SELECT 1 FROM farm_feed_days) THEN RAISE EXCEPTION 'Scoped feed ledger contains business records'; END IF; END $$");
    await queryRunner.query('DROP TABLE farm_feed_day_items');
    await queryRunner.query('DROP TABLE farm_feed_days');
  }
}
