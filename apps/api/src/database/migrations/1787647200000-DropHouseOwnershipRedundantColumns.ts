import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropHouseOwnershipRedundantColumns1787647200000 implements MigrationInterface {
  name = 'DropHouseOwnershipRedundantColumns1787647200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      BEGIN
        IF to_regclass('public.brd_houses') IS NOT NULL THEN
          ALTER TABLE brd_houses
            DROP COLUMN IF EXISTS company_code,
            DROP COLUMN IF EXISTS site_code,
            DROP COLUMN IF EXISTS store_code;
        END IF;
      END
      $migration$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $migration$
      BEGIN
        IF to_regclass('public.brd_houses') IS NOT NULL THEN
          ALTER TABLE brd_houses
            ADD COLUMN IF NOT EXISTS company_code VARCHAR(64),
            ADD COLUMN IF NOT EXISTS site_code VARCHAR(64),
            ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL';
        END IF;
      END
      $migration$
    `);
  }
}
