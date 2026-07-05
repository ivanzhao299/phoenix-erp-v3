import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: seed MENU_BUG_REPORT into RBAC config tables for bug intake management.
 */
export class CreateBugReports1782750500000 implements MigrationInterface {
  name = 'CreateBugReports1782750500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id BIGSERIAL PRIMARY KEY,
        bug_no VARCHAR(32) NOT NULL UNIQUE,
        title VARCHAR(160) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        severity VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
        status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
        route VARCHAR(255) NOT NULL DEFAULT '',
        url TEXT NOT NULL DEFAULT '',
        reporter_user_id VARCHAR(64) NOT NULL DEFAULT '',
        reporter_username VARCHAR(128) NOT NULL DEFAULT '',
        reporter_name VARCHAR(128) NOT NULL DEFAULT '',
        roles JSONB NOT NULL DEFAULT '[]'::jsonb,
        company_code VARCHAR(64) NOT NULL DEFAULT '',
        project_code VARCHAR(64) NOT NULL DEFAULT '',
        console_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
        failed_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
        attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
        client_context JSONB NOT NULL DEFAULT '{}'::jsonb,
        resolution_note TEXT NOT NULL DEFAULT '',
        updated_by VARCHAR(128) NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT CHK_bug_reports_status CHECK (status IN ('OPEN','TRIAGED','IN_PROGRESS','RESOLVED','CLOSED','REJECTED')),
        CONSTRAINT CHK_bug_reports_severity CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL'))
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_bug_reports_status_created ON bug_reports(status, created_at)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_bug_reports_reporter ON bug_reports(reporter_username)`);

    await queryRunner.query(`
      INSERT INTO sys_menu (menu_code, menu_name_zh, menu_name_lo, domain, parent_code, sort_order, icon, route)
      VALUES ('MENU_BUG_REPORT', '问题反馈', NULL, 'SYS', NULL, 92, 'Bug', '/bug-reports')
      ON CONFLICT (menu_code) DO UPDATE SET
        menu_name_zh = EXCLUDED.menu_name_zh,
        domain = EXCLUDED.domain,
        route = EXCLUDED.route
    `);

    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT r.role_id, m.menu_id, '*'
      FROM sys_role r
      JOIN sys_menu m ON m.menu_code = 'MENU_BUG_REPORT'
      WHERE r.role_code = 'ROLE_ADMIN'
      ON CONFLICT (role_id, menu_id) DO UPDATE SET perm_codes = '*'
    `);
    await queryRunner.query(`
      INSERT INTO sys_role_menu_permission (role_id, menu_id, perm_codes)
      SELECT DISTINCT p.role_id, bug.menu_id, 'V,E'
      FROM sys_role_menu_permission p
      JOIN sys_menu mon ON mon.menu_id = p.menu_id AND mon.menu_code = 'MENU_SYS_MONITOR'
      JOIN sys_menu bug ON bug.menu_code = 'MENU_BUG_REPORT'
      ON CONFLICT (role_id, menu_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM sys_role_menu_permission p USING sys_menu m
      WHERE p.menu_id = m.menu_id AND m.menu_code = 'MENU_BUG_REPORT'
    `);
    await queryRunner.query(`DELETE FROM sys_menu WHERE menu_code = 'MENU_BUG_REPORT'`);
    await queryRunner.query(`DROP TABLE IF EXISTS bug_reports`);
  }
}
