import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 约束建立前将历史多有效主角色归一为唯一主角色，保留全部角色授权和启停状态。
 */
export class EnforceSingleVisiblePrimaryUserRole1784120000000 implements MigrationInterface {
  name = 'EnforceSingleVisiblePrimaryUserRole1784120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      WITH ranked_primary AS (
        SELECT
          ur.user_id,
          ur.role_id,
          ROW_NUMBER() OVER (
            PARTITION BY ur.user_id
            ORDER BY
              COALESCE(r.approval_level, 0) DESC,
              ur.granted_at DESC NULLS LAST,
              r.role_code ASC
          ) AS primary_rank
        FROM sys_user_role ur
        JOIN sys_role r ON r.role_id = ur.role_id
        WHERE ur.is_primary = true
          AND COALESCE(ur.is_visible, true) = true
      )
      UPDATE sys_user_role ur
         SET is_primary = false
        FROM ranked_primary ranked
       WHERE ur.user_id = ranked.user_id
         AND ur.role_id = ranked.role_id
         AND ranked.primary_rank > 1
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_user_role_one_visible_primary
          ON sys_user_role (user_id)
       WHERE is_primary = true
         AND COALESCE(is_visible, true) = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_sys_user_role_one_visible_primary`);
  }
}
