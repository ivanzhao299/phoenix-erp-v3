import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceStorePosAtomicSettlement1787878800000 implements MigrationInterface {
  name = 'EnforceStorePosAtomicSettlement1787878800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sal_store_sales
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
      ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(64)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_store_sale_payment_idempotency
      ON sal_store_sales(idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_store_shift_open_per_store
      ON sal_store_shift_closings(store_code) WHERE status='OPEN'`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS store_sale_allocations (
      id BIGSERIAL PRIMARY KEY,
      sale_id BIGINT NOT NULL REFERENCES sal_store_sales(id),
      sale_item_id BIGINT NOT NULL REFERENCES sal_store_sale_items(id),
      batch_no VARCHAR(128) NOT NULL REFERENCES inv_batches(batch_no),
      warehouse_code VARCHAR(64) NOT NULL,
      allocated_qty NUMERIC(18,3) NOT NULL,
      returned_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_store_sale_allocation_qty CHECK (allocated_qty > 0),
      CONSTRAINT chk_store_sale_allocation_returned CHECK (returned_qty >= 0 AND returned_qty <= allocated_qty),
      CONSTRAINT uq_store_sale_item_batch UNIQUE(sale_item_id,batch_no)
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_sale_allocation_sale
      ON store_sale_allocations(sale_id,sale_item_id)`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS store_sale_adjustments (
      id BIGSERIAL PRIMARY KEY,
      sale_id BIGINT NOT NULL REFERENCES sal_store_sales(id),
      shift_closing_id BIGINT NULL REFERENCES sal_store_shift_closings(id),
      adjustment_type VARCHAR(32) NOT NULL,
      reason TEXT NOT NULL,
      created_by VARCHAR(128) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_store_sale_adjustment_type CHECK (adjustment_type IN ('CLOSED_SHIFT_RETURN')),
      CONSTRAINT uq_store_sale_return_adjustment UNIQUE(sale_id,adjustment_type)
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS store_sale_adjustments`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_sale_allocations`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_store_shift_open_per_store`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_store_sale_payment_idempotency`);
    await queryRunner.query(`ALTER TABLE sal_store_sales
      DROP COLUMN IF EXISTS warehouse_code,
      DROP COLUMN IF EXISTS idempotency_key`);
  }
}
