import { MigrationInterface, QueryRunner } from 'typeorm';

export class LegacyMobileProductionSummary1795565100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE brd_daily_logs ADD COLUMN production_input_kind text');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        LOCK TABLE brd_daily_logs IN ACCESS EXCLUSIVE MODE;
        IF EXISTS (SELECT 1 FROM brd_daily_logs WHERE production_input_kind IS NOT NULL) THEN
          RAISE EXCEPTION 'Legacy mobile production reports require their input kind';
        END IF;
      END $$`);
    await queryRunner.query('ALTER TABLE brd_daily_logs DROP COLUMN production_input_kind');
  }
}
