import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSysUserArchiveLifecycle1782730000000 implements MigrationInterface {
  name = 'AddSysUserArchiveLifecycle1782730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL`);
    await queryRunner.query(`ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL`);
    await queryRunner.query(`ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_sys_user_status_lifecycle'
        ) THEN
          ALTER TABLE sys_user
            ADD CONSTRAINT chk_sys_user_status_lifecycle
            CHECK (status IN (-1, 0, 1));
        END IF;
      END $$;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sys_user_status ON sys_user(status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sys_user_archived_at ON sys_user(archived_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sys_user_archived_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_sys_user_status`);
    await queryRunner.query(`ALTER TABLE sys_user DROP CONSTRAINT IF EXISTS chk_sys_user_status_lifecycle`);
    await queryRunner.query(`ALTER TABLE sys_user DROP COLUMN IF EXISTS archive_reason`);
    await queryRunner.query(`ALTER TABLE sys_user DROP COLUMN IF EXISTS archived_by`);
    await queryRunner.query(`ALTER TABLE sys_user DROP COLUMN IF EXISTS archived_at`);
  }
}
