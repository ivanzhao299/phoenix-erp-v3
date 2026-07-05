import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExtendBugReportsWorkflow1782750600000 implements MigrationInterface {
  name = 'ExtendBugReportsWorkflow1782750600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'P2'`);
    await queryRunner.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS module_code VARCHAR(64) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS assignee_username VARCHAR(128) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(128) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS repair_task_no VARCHAR(48) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS repair_task_status VARCHAR(24) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS repair_task_payload JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await queryRunner.query(`ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'CHK_bug_reports_priority'
        ) THEN
          ALTER TABLE bug_reports ADD CONSTRAINT CHK_bug_reports_priority CHECK (priority IN ('P0','P1','P2','P3'));
        END IF;
      END $$;
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_bug_reports_priority_status ON bug_reports(priority, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_bug_reports_assignee ON bug_reports(assignee_username)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_bug_reports_assignee`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_bug_reports_priority_status`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS CHK_bug_reports_priority`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP COLUMN IF EXISTS closed_at`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP COLUMN IF EXISTS repair_task_payload`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP COLUMN IF EXISTS repair_task_status`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP COLUMN IF EXISTS repair_task_no`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP COLUMN IF EXISTS assignee_name`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP COLUMN IF EXISTS assignee_username`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP COLUMN IF EXISTS module_code`);
    await queryRunner.query(`ALTER TABLE bug_reports DROP COLUMN IF EXISTS priority`);
  }
}
