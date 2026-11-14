import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A1 验收演练迁移(2026-11-14):验证 deploy.yml 内嵌 schema-first 通道
 * (scripts/deploy-schema-first.sh 的 plain docker run 路径)能在生产走通。
 * 无副作用元数据注释,真实可逆,不携带任何业务 DML/DDL 语义变更。
 */
export class AnnotateGradeStatusLifecycle1794600000000 implements MigrationInterface {
  name = 'AnnotateGradeStatusLifecycle1794600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `COMMENT ON COLUMN "product_grades"."status" IS '等级生命周期:ACTIVE/DEPRECATED/DRAFT;退役码由触发器 trg_product_grades_retired_freeze 永久锁死(8档制终态,见 FreezeRetiredEggGrades1794500000000)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`COMMENT ON COLUMN "product_grades"."status" IS NULL`);
  }
}
