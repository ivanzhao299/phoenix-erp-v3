import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 修复 entity↔DB 漂移：sys_notifications 实体声明 company_code（公司级通知过滤键，
 * 信用/库存调度器写入），但生产表由早期 `CREATE TABLE IF NOT EXISTS` 建成、从未补列，
 * 也无迁移补齐 → `GET /api/notifications`(repo.getMany 选所有实体列) 命中 `company_code`
 * 报 PG 42703 "column does not exist" → 400。本迁移幂等补列，消除该漂移与 400。
 *
 * 纯 DDL（ADD/DROP COLUMN），不含业务数据 DML（g197-H 合规）。
 */
export class AddSysNotificationsCompanyCode1782638092093 implements MigrationInterface {
  name = 'AddSysNotificationsCompanyCode1782638092093';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sys_notifications ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sys_notifications DROP COLUMN IF EXISTS company_code`,
    );
  }
}
