import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 退役 CRACKED/DAMAGED 缺陷档为 8 档制终态（业务裁定 2026-11-14：
 *   现行等级体系 = GRADE_0..5 + DIRTY + BROKEN，共 8 档；"9 档"为 G67 时代历史计数，
 *   数量与成员均已失真）。基线 20260530 引导出的 4 缺陷档从未被业务确认，且生产
 *   历史（批次/日报/处置/台账）中 CRACKED/DAMAGED 存量为 0，退役无历史包袱。
 *   触发器 DDL + 两行治理 UPDATE 保证所有环境（含新建环境）到达同一终态。
 */
export class FreezeRetiredEggGrades1794500000000 implements MigrationInterface {
  name = 'FreezeRetiredEggGrades1794500000000';

  /** 静态冻结清单：全部已退役等级码。新增退役码时扩展本清单（走新迁移）。 */
  static readonly FROZEN_GRADE_CODES = [
    'CRACKED', 'DAMAGED', 'AA', 'A', 'B', 'C', 'XL', 'L', 'M', 'S', 'XS', 'GRD-001',
  ];

  /** SQL 数组字面量（单引号元素，防注入：码表为静态常量）。 */
  private static frozenCodesSql(): string {
    return `ARRAY[${FreezeRetiredEggGrades1794500000000.FROZEN_GRADE_CODES.map(code => `'${code}'`).join(', ')}]::varchar[]`;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 永久防线：任何把冻结清单内等级改回/插入为 ACTIVE 的写操作直接报错。
    //    覆盖一切通道：应用 API、运维脚本、误跑的种子、手工 SQL。
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION phoenix_guard_retired_grade_status() RETURNS trigger AS $$
      BEGIN
        IF NEW.grade_code = ANY(${FreezeRetiredEggGrades1794500000000.frozenCodesSql()})
           AND NEW.status = 'ACTIVE' THEN
          RAISE EXCEPTION 'GRADE_FROZEN: 等级 % 已永久退役，禁止激活（8 档制终态，见 FreezeRetiredEggGrades1794500000000）', NEW.grade_code
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_product_grades_retired_freeze ON product_grades
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_product_grades_retired_freeze
        BEFORE INSERT OR UPDATE OF status ON product_grades
        FOR EACH ROW EXECUTE FUNCTION phoenix_guard_retired_grade_status()
    `);
    // 2) 治理 DML（见文件头 @allow-data-dml）：CRACKED/DAMAGED → DEPRECATED（与
    //    AA/A/B/C/XL 等退役等级同生命周期值），其 SKU 一并退役。
    await queryRunner.query(
      `UPDATE product_grades SET status = 'DEPRECATED', updated_at = NOW()
        WHERE grade_code IN ('CRACKED','DAMAGED') AND status <> 'DEPRECATED'`,
    );
    await queryRunner.query(
      `UPDATE product_skus SET status = 'DEPRECATED', updated_at = NOW()
        WHERE grade_code IN ('CRACKED','DAMAGED') AND status = 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 仅供回滚演练：恢复 4 缺陷档 ACTIVE 会重新引入业务已否决的等级体系，
    // 且回滚窗口内生产不允许执行（受控部署链）。
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_product_grades_retired_freeze ON product_grades`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS phoenix_guard_retired_grade_status()`);
    await queryRunner.query(
      `UPDATE product_skus SET status = 'ACTIVE', updated_at = NOW()
        WHERE grade_code IN ('CRACKED','DAMAGED') AND status = 'DEPRECATED'`,
    );
    await queryRunner.query(
      `UPDATE product_grades SET status = 'ACTIVE', updated_at = NOW()
        WHERE grade_code IN ('CRACKED','DAMAGED') AND status = 'DEPRECATED'`,
    );
  }
}
