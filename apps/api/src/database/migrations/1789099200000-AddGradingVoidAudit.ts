import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGradingVoidAudit1789099200000 implements MigrationInterface {
  name = 'AddGradingVoidAudit1789099200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pkg_grading_records
        ADD COLUMN IF NOT EXISTS status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS void_reason text,
        ADD COLUMN IF NOT EXISTS voided_at timestamp without time zone,
        ADD COLUMN IF NOT EXISTS voided_by varchar(120)
    `);
    await queryRunner.query(`
      ALTER TABLE pkg_grading_records
        DROP CONSTRAINT IF EXISTS ck_pkg_grading_records_status,
        ADD CONSTRAINT ck_pkg_grading_records_status CHECK (status IN ('ACTIVE', 'VOID'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pkg_grading_records
        DROP CONSTRAINT IF EXISTS ck_pkg_grading_records_status,
        DROP COLUMN IF EXISTS voided_by,
        DROP COLUMN IF EXISTS voided_at,
        DROP COLUMN IF EXISTS void_reason,
        DROP COLUMN IF EXISTS status
    `);
  }
}
