import { MigrationInterface, QueryRunner } from 'typeorm';

export class VetMaterialAllocation1795500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE brd_vaccinations ADD COLUMN planned_issue_lines jsonb NOT NULL DEFAULT '[]'");
    await queryRunner.query('ALTER TABLE brd_medication_records ADD COLUMN actual_heads integer CHECK (actual_heads > 0)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE brd_medication_records DROP COLUMN actual_heads');
    await queryRunner.query('ALTER TABLE brd_vaccinations DROP COLUMN planned_issue_lines');
  }
}
