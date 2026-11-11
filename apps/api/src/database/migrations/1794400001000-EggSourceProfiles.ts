import { MigrationInterface, QueryRunner } from 'typeorm';

/** Commercial source policy, independent of biological breed mappings. No historical backfill. */
export class EggSourceProfiles1794400001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS md_egg_source_profiles (
        profile_code varchar(64) PRIMARY KEY,
        company_code varchar(64) NOT NULL,
        farm_code varchar(64) NOT NULL,
        site_code varchar(64) NOT NULL,
        -- Soft association: brd_houses is not present in every TS bootstrap chain.
        house_code varchar(64) NOT NULL,
        product_mode varchar(16) NOT NULL,
        variety_code varchar(64) NULL,
        effective_date date NOT NULL,
        expire_date date NULL,
        status varchar(16) NOT NULL DEFAULT 'ACTIVE',
        created_by varchar(64) NOT NULL DEFAULT 'system',
        updated_by varchar(64) NOT NULL DEFAULT 'system',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_egg_source_house_date UNIQUE (company_code, house_code, effective_date),
        CONSTRAINT ck_egg_source_mode CHECK (
          (product_mode = 'STANDARD' AND variety_code IS NULL)
          OR (product_mode = 'VARIANT' AND variety_code IS NOT NULL AND btrim(variety_code) <> '')
        ),
        CONSTRAINT ck_egg_source_dates CHECK (expire_date IS NULL OR expire_date >= effective_date),
        CONSTRAINT ck_egg_source_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
        CONSTRAINT ck_egg_source_codes CHECK (
          profile_code <> '' AND profile_code = btrim(profile_code)
          AND company_code <> '' AND company_code = btrim(company_code)
          AND farm_code <> '' AND farm_code = btrim(farm_code)
          AND site_code <> '' AND site_code = btrim(site_code)
          AND house_code <> '' AND house_code = btrim(house_code)
          AND (variety_code IS NULL OR variety_code = btrim(variety_code))
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_egg_source_lookup
      ON md_egg_source_profiles (company_code, house_code, effective_date, expire_date)
      WHERE status = 'ACTIVE'`);
    // Existing catalog keeps its legacy consumers. New managed catalog entries
    // explicitly require organization-aware consumers, including STANDARD grade 0.
    await queryRunner.query(`ALTER TABLE product_skus
      ADD COLUMN IF NOT EXISTS org_context_required boolean NOT NULL DEFAULT false`);
    // These are immutable creation snapshots, not a live join or a historical repair.
    await queryRunner.query(`ALTER TABLE inv_batches
      ADD COLUMN IF NOT EXISTS source_profile_code varchar(64) NULL,
      ADD COLUMN IF NOT EXISTS source_profile_snapshot jsonb NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE inv_batches
      DROP COLUMN IF EXISTS source_profile_snapshot, DROP COLUMN IF EXISTS source_profile_code`);
    await queryRunner.query('DROP TABLE IF EXISTS md_egg_source_profiles');
    await queryRunner.query('ALTER TABLE product_skus DROP COLUMN IF EXISTS org_context_required');
  }
}
