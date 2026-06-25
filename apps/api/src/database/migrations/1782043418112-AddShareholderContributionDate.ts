import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the business contribution date for manual shareholder fund records.
 *
 * This is a nullable schema-only change for existing records. It does not
 * seed, update, or backfill business data.
 */
export class AddShareholderContributionDate1782043418112 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "fin_shareholder_contributions"
      ADD COLUMN IF NOT EXISTS "contribution_date" date
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_fin_sh_contrib_contribution_date"
      ON "fin_shareholder_contributions" ("contribution_date")
      WHERE "contribution_date" IS NOT NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "fin_shareholder_contributions"."contribution_date"
      IS '股东出资时间'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_fin_sh_contrib_contribution_date"`);
    await queryRunner.query(`
      ALTER TABLE "fin_shareholder_contributions"
      DROP COLUMN IF EXISTS "contribution_date"
    `);
  }
}
