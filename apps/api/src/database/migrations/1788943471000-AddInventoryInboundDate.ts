import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryInboundDate1788943471000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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
