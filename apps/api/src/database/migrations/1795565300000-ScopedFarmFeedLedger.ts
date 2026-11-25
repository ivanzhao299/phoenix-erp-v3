import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopedFarmFeedLedger1795565300000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE IF NOT EXISTS farm_feed_ledger (id serial PRIMARY KEY, ledger_date date NOT NULL, material_name varchar(100) NOT NULL, unit varchar(20), sort_order int, prev_stock numeric, inbound_qty numeric, outbound_detail jsonb, outbound_total numeric, daily_usage numeric, note varchar(200), operator varchar(50), created_at timestamp, updated_at timestamp, UNIQUE(ledger_date, material_name))',
    );
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
