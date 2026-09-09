import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryInboundDate1788943471000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // A clean CI database does not contain this runtime-created generic CRUD table
    // when the frozen G17 SQL migration runs, so G17's conditional ALTER is skipped.
    // Establish the source document schema here before inventory starts copying its
    // business date into inv_batches.inbound_date.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wms_inbound (
        id BIGSERIAL PRIMARY KEY,
        task_no VARCHAR(64) UNIQUE,
        status VARCHAR(32),
        warehouse_code VARCHAR(64),
        type VARCHAR(32),
        item VARCHAR(128),
        qty NUMERIC(18,3),
        store_code VARCHAR(64),
        operator VARCHAR(64),
        attachment_url TEXT,
        date DATE,
        site_code VARCHAR(64),
        company_code VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('ALTER TABLE wms_inbound ADD COLUMN IF NOT EXISTS date DATE');

    if (!(await queryRunner.hasTable('inv_batches'))) return;
    await queryRunner.query(`
      ALTER TABLE inv_batches
        ADD COLUMN IF NOT EXISTS inbound_date DATE NULL
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN inv_batches.inbound_date IS
        'Business date on which the batch entered its current inventory pool; never derived from created_at'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_inv_batches_inbound_date_stable
        ON inv_batches (inbound_date DESC NULLS LAST, batch_no DESC, id DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('inv_batches'))) return;
    await queryRunner.query('DROP INDEX IF EXISTS IDX_inv_batches_inbound_date_stable');
    await queryRunner.query('ALTER TABLE inv_batches DROP COLUMN IF EXISTS inbound_date');
  }
}
