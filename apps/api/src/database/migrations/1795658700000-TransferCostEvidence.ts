import { MigrationInterface, QueryRunner } from 'typeorm';

export class TransferCostEvidence1795658700000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE inv_batches ADD COLUMN transfer_cost_currency text CHECK(transfer_cost_currency ~ '^[A-Z]{3}$');
      ALTER TABLE wms_transfer_discrepancies DROP CONSTRAINT IF EXISTS wms_transfer_discrepancies_resolution_type_check;
      ALTER TABLE wms_transfer_discrepancies ADD CONSTRAINT wms_transfer_discrepancies_resolution_type_check
        CHECK (resolution_type IS NULL OR resolution_type IN ('LOSS','ADJUSTMENT','CUSTODY'));
      CREATE TABLE wms_atomic_transfer_receipts (
        transfer_no varchar(64) PRIMARY KEY REFERENCES wms_transfer(transfer_no),
        payload_digest text NOT NULL,
        receipt jsonb NOT NULL
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $down$ BEGIN
        IF EXISTS (SELECT 1 FROM wms_atomic_transfer_receipts)
          OR EXISTS (SELECT 1 FROM inv_batches WHERE transfer_cost_currency IS NOT NULL)
          OR EXISTS (SELECT 1 FROM wms_transfer_discrepancies WHERE resolution_type='CUSTODY') THEN
          RAISE EXCEPTION 'Cannot drop posted transfer receipts or cost evidence';
        END IF;
      END $down$;
      ALTER TABLE wms_transfer_discrepancies DROP CONSTRAINT wms_transfer_discrepancies_resolution_type_check;
      ALTER TABLE wms_transfer_discrepancies ADD CONSTRAINT wms_transfer_discrepancies_resolution_type_check
        CHECK (resolution_type IS NULL OR resolution_type IN ('LOSS','ADJUSTMENT'));
      DROP TABLE wms_atomic_transfer_receipts;
      ALTER TABLE inv_batches DROP COLUMN transfer_cost_currency;
    `);
  }
}
