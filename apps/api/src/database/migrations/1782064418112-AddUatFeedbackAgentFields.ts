import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 试运行问题反馈 → 智能体自愈脚手架。
 *
 * 背景:uat_feedbacks(问题反馈中心)后端已就位(/api/uat/feedbacks),但试运行页缺人性化反馈窗口;
 *   且后续要把反馈接入智能体自动修正,需在反馈单上挂"智能体处理态"数据模型。
 *
 * 本迁移:
 *  1) 幂等保证 uat_feedbacks 表 + 编号序列存在(基线 ddl/26 在全新库可能未落 → 防 fresh 部署缺表)。
 *  2) 加智能体自愈三列:
 *     - agent_status: NONE/QUEUED/ANALYZING/PROPOSED/APPLIED/FAILED/SKIPPED(智能体处理流转)
 *     - agent_note  : 智能体分析结论 / 拟修方案摘要
 *     - agent_ref   : 自动修复的 PR/commit/会话引用(可追溯)
 * 纯 DDL,幂等;已有库只追加三列。
 */
export class AddUatFeedbackAgentFields1782064418112 implements MigrationInterface {
  name = 'AddUatFeedbackAgentFields1782064418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 幂等保证表 + 序列(与 apps/api/ddl/26_uat_tables.sql 基线一致)
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS seq_uat_feedback_no START 1`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS uat_feedbacks (
        id               BIGSERIAL     PRIMARY KEY,
        feedback_no      VARCHAR(64)   NOT NULL UNIQUE,
        title            VARCHAR(256)  NOT NULL,
        description      TEXT,
        module_code      VARCHAR(64),
        company_code     VARCHAR(64),
        feedback_type    VARCHAR(32)   NOT NULL DEFAULT 'BUG',
        severity         VARCHAR(16)   NOT NULL DEFAULT 'MEDIUM',
        status           VARCHAR(32)   NOT NULL DEFAULT 'OPEN',
        reporter_id      BIGINT,
        reporter_name    VARCHAR(128),
        assignee_id      BIGINT,
        assignee_name    VARCHAR(128),
        screenshot_urls  JSONB,
        resolution       TEXT,
        created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_uat_fb_status   ON uat_feedbacks (status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_uat_fb_severity ON uat_feedbacks (severity)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_uat_fb_reporter ON uat_feedbacks (reporter_id)`);

    // 2) 智能体自愈三列
    await queryRunner.query(`ALTER TABLE uat_feedbacks ADD COLUMN IF NOT EXISTS agent_status VARCHAR(24) NOT NULL DEFAULT 'NONE'`);
    await queryRunner.query(`ALTER TABLE uat_feedbacks ADD COLUMN IF NOT EXISTS agent_note   TEXT`);
    await queryRunner.query(`ALTER TABLE uat_feedbacks ADD COLUMN IF NOT EXISTS agent_ref    VARCHAR(128)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_uat_fb_agent_status ON uat_feedbacks (agent_status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 仅回退本迁移新增的智能体列(不删可能预存的基线表/数据)
    await queryRunner.query(`DROP INDEX IF EXISTS idx_uat_fb_agent_status`);
    await queryRunner.query(`ALTER TABLE uat_feedbacks DROP COLUMN IF EXISTS agent_ref`);
    await queryRunner.query(`ALTER TABLE uat_feedbacks DROP COLUMN IF EXISTS agent_note`);
    await queryRunner.query(`ALTER TABLE uat_feedbacks DROP COLUMN IF EXISTS agent_status`);
  }
}
