import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 修复主数据审批页 400(问题2 根治)。
 * 根因:master-data list() 对 17 类主数据扇出查询时 `ORDER BY updated_at`,而 sys_dict 在
 *   "fresh-bootstrap"环境可能无 updated_at 列——generic-crud 启动建 sys_dict 时未补该列
 *   (不像 mst_products 有 ADD COLUMN IF NOT EXISTS),而补列的 g55d 迁移在冻结的顶级
 *   migrations/(已桥接为"已执行"不重跑)→ Postgres 42703(undefined_column)→ 全局过滤器
 *   映射成 HTTP 400。
 * 修法:幂等保证列存在(已存在则 no-op),让 ORDER BY updated_at 在任何环境都成立,
 *   不依赖 per-type 排序绕过。配合 pending 页 silent 兜底。
 */
export class EnsureSysDictUpdatedAt1782057418112 implements MigrationInterface {
  name = 'EnsureSysDictUpdatedAt1782057418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sys_dict ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 不回退:ADD COLUMN IF NOT EXISTS 无法判断列原本是否存在,DROP 会误删历史既有列。
    // 该列是其它主数据表的标准列,保留无害。
    await queryRunner.query(`SELECT 1 /* no-op: 保留 sys_dict.updated_at(标准列,不可安全回退) */`);
  }
}
