import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * sys_dict.config_json TEXT -> JSONB（包装历史策略启用的前置条件）。
 * PackagingWorkflowPolicy 直接对象访问 pg 返回值，TEXT 返回字符串将永远 INVALID。
 * 2026-09-16 生产只读核验：467 行中 23 行非空，23/23 全部可 ::jsonb（空串与
 * 'null' 规范化为 NULL）。全部既有读者均带 typeof string 防御，兼容对象返回。
 */
export class SysDictConfigJsonJsonb1789520271000 implements MigrationInterface {
  name = 'SysDictConfigJsonJsonb1789520271000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sys_dict ALTER COLUMN config_json TYPE jsonb USING NULLIF(NULLIF(config_json, ''), 'null')::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE sys_dict ALTER COLUMN config_json TYPE text USING config_json::text',
    );
  }
}
