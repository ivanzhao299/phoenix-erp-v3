import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 1. 建 chanjet_book_company_map(账套 ↔ 公司映射,无数据;seed 在 service 启动时插入)
 * 2. chanjet_ar_snapshot 加 company_code(DataScope 字段)+ dept_code(部门维度占位)
 * 3. 重建唯一约束含 company_code + dept_code(避免误覆盖跨公司数据)
 */
export class CreateChanjetBookCompanyMapAndExtendArSnapshot1781793986478 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 映射表
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chanjet_book_company_map" (
        "bookid" varchar(64) NOT NULL,
        "book_name" varchar(256) NOT NULL,
        "company_code" varchar(64) NOT NULL,
        "company_name" varchar(256) NOT NULL,
        "sync_enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chanjet_book_company_map" PRIMARY KEY ("bookid"),
        CONSTRAINT "uq_chanjet_book_company_map_company" UNIQUE ("company_code")
      )
    `);

    // 2. 扩展 chanjet_ar_snapshot:加 company_code + dept_code
    await queryRunner.query(`ALTER TABLE "chanjet_ar_snapshot" ADD COLUMN IF NOT EXISTS "company_code" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "chanjet_ar_snapshot" ADD COLUMN IF NOT EXISTS "dept_code" varchar(64)`);

    // 3. 重建唯一约束:把 dept_code 加入唯一性(同部门覆盖,跨部门并存)
    await queryRunner.query(`ALTER TABLE "chanjet_ar_snapshot" DROP CONSTRAINT IF EXISTS "uq_chanjet_ar"`);
    await queryRunner.query(`
      ALTER TABLE "chanjet_ar_snapshot"
        ADD CONSTRAINT "uq_chanjet_ar_v2"
        UNIQUE ("bookid", "period", "dept_code", "assistant_customer_code", "subject_id")
    `);

    // 4. company_code 索引(DataScope 过滤性能)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chanjet_ar_company_period" ON "chanjet_ar_snapshot"("company_code","period")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chanjet_ar_company_period"`);
    await queryRunner.query(`ALTER TABLE "chanjet_ar_snapshot" DROP CONSTRAINT IF EXISTS "uq_chanjet_ar_v2"`);
    await queryRunner.query(`
      ALTER TABLE "chanjet_ar_snapshot"
        ADD CONSTRAINT "uq_chanjet_ar"
        UNIQUE ("bookid", "period", "assistant_customer_code", "subject_id")
    `);
    await queryRunner.query(`ALTER TABLE "chanjet_ar_snapshot" DROP COLUMN IF EXISTS "dept_code"`);
    await queryRunner.query(`ALTER TABLE "chanjet_ar_snapshot" DROP COLUMN IF EXISTS "company_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chanjet_book_company_map"`);
  }
}
