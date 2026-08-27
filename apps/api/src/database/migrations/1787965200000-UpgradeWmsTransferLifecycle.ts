import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpgradeWmsTransferLifecycle1787965200000 implements MigrationInterface {
  name = 'UpgradeWmsTransferLifecycle1787965200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wms_transfer
      ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(128) NULL,
      ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS received_by VARCHAR(128) NULL,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS in_transit_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS received_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS difference_qty NUMERIC(18,3) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE wms_transfer DROP CONSTRAINT IF EXISTS chk_wms_transfer_status`);
    await queryRunner.query(`ALTER TABLE wms_transfer ADD CONSTRAINT chk_wms_transfer_status
      CHECK (status IN ('PENDING','IN_TRANSIT','RECEIVED','COMPLETED')) NOT VALID`);
    await queryRunner.query(`ALTER TABLE wms_transfer VALIDATE CONSTRAINT chk_wms_transfer_status`);

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS wms_transfer_items (
      id BIGSERIAL PRIMARY KEY,
      transfer_no VARCHAR(64) NOT NULL REFERENCES wms_transfer(transfer_no) ON DELETE RESTRICT,
      source_batch_no VARCHAR(100) NOT NULL REFERENCES inv_batches(batch_no) ON DELETE RESTRICT,
      target_batch_no VARCHAR(128) NULL,
      expected_qty NUMERIC(18,3) NOT NULL CHECK (expected_qty > 0),
      received_qty NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
      damaged_qty NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (damaged_qty >= 0),
      difference_qty NUMERIC(18,3) NOT NULL DEFAULT 0,
      source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_wms_transfer_item_source UNIQUE(transfer_no,source_batch_no),
      CONSTRAINT chk_wms_transfer_item_received CHECK (received_qty + damaged_qty <= expected_qty)
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wms_transfer_items_transfer ON wms_transfer_items(transfer_no)`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS wms_transfer_discrepancies (
      id BIGSERIAL PRIMARY KEY,
      transfer_no VARCHAR(64) NOT NULL REFERENCES wms_transfer(transfer_no) ON DELETE RESTRICT,
      transfer_item_id BIGINT NOT NULL REFERENCES wms_transfer_items(id) ON DELETE RESTRICT,
      discrepancy_type VARCHAR(16) NOT NULL CHECK (discrepancy_type IN ('SHORTAGE','DAMAGE')),
      qty NUMERIC(18,3) NOT NULL CHECK (qty > 0),
      resolution_type VARCHAR(16) NULL CHECK (resolution_type IS NULL OR resolution_type IN ('LOSS','ADJUSTMENT')),
      resolution_ref VARCHAR(128) NULL,
      note TEXT NULL, created_by VARCHAR(128) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ NULL,
      CONSTRAINT uq_wms_transfer_discrepancy UNIQUE(transfer_item_id,discrepancy_type)
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wms_transfer_discrepancy_open
      ON wms_transfer_discrepancies(transfer_no) WHERE resolved_at IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_wms_transfer_discrepancy_open`);
    await queryRunner.query(`DROP TABLE IF EXISTS wms_transfer_discrepancies`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_wms_transfer_items_transfer`);
    await queryRunner.query(`DROP TABLE IF EXISTS wms_transfer_items`);
    await queryRunner.query(`ALTER TABLE wms_transfer DROP CONSTRAINT IF EXISTS chk_wms_transfer_status`);
    await queryRunner.query(`ALTER TABLE wms_transfer
      DROP COLUMN IF EXISTS difference_qty,
      DROP COLUMN IF EXISTS received_qty,
      DROP COLUMN IF EXISTS in_transit_qty,
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS received_by,
      DROP COLUMN IF EXISTS received_at,
      DROP COLUMN IF EXISTS dispatched_by,
      DROP COLUMN IF EXISTS dispatched_at`);
  }
}
