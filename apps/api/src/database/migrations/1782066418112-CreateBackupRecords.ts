import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 系统运维 — 备份模块数据模型(记录 + 配置)。
 *
 * 安全边界:真备份(pg_dump/恢复)是基础设施操作,由服务器上既有运维脚本
 *   (scripts/backup-db.sh / backup-postgres.sh)+ cron 执行。应用层只负责:
 *   - 展示备份历史(sys_backup_records)
 *   - 维护计划/保留策略(sys_backup_config)
 *   - 接受"手动请求备份"(写一条 PENDING 记录,由运维 runner 拾取执行并回写)
 *   应用进程不直接跑 pg_dump,凭证/执行留在运维侧。
 */
export class CreateBackupRecords1782066418112 implements MigrationInterface {
  name = 'CreateBackupRecords1782066418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS seq_backup_no START 1`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sys_backup_records (
        id            BIGSERIAL     PRIMARY KEY,
        backup_no     VARCHAR(64)   NOT NULL UNIQUE,
        backup_type   VARCHAR(24)   NOT NULL DEFAULT 'FULL',     -- FULL / SCHEMA
        trigger_type  VARCHAR(16)   NOT NULL DEFAULT 'MANUAL',   -- MANUAL / SCHEDULED
        status        VARCHAR(16)   NOT NULL DEFAULT 'PENDING',  -- PENDING / RUNNING / SUCCESS / FAILED
        file_path     TEXT,
        size_bytes    BIGINT,
        operator      VARCHAR(128),
        note          TEXT,
        started_at    TIMESTAMPTZ,
        finished_at   TIMESTAMPTZ,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_backup_status  ON sys_backup_records (status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_backup_created ON sys_backup_records (created_at DESC)`);

    // 单行配置(id=1):计划/保留策略,运维 cron 读取
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sys_backup_config (
        id             INT           PRIMARY KEY DEFAULT 1,
        enabled        BOOLEAN       NOT NULL DEFAULT true,
        cron_expr      VARCHAR(64)   NOT NULL DEFAULT '0 3 * * *',  -- 每日 03:00
        retention_days INT           NOT NULL DEFAULT 30,
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT sys_backup_config_singleton CHECK (id = 1)
      )
    `);
    // 注:默认配置行不在迁移里 INSERT(避免 g197-H 业务 DML 门禁);
    //     由 service.getConfig() 缺行时返回默认 + putConfig() upsert 落行。
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sys_backup_config`);
    await queryRunner.query(`DROP TABLE IF EXISTS sys_backup_records`);
    await queryRunner.query(`DROP SEQUENCE IF EXISTS seq_backup_no`);
  }
}
