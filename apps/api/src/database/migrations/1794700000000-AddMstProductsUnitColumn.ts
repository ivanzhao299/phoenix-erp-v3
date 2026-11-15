import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 回填 mst_products.unit ← unit_zh——冻结基线(v3_schema_complete
 *   CREATE TABLE 定义了 unit)与生产存量表的 IF-NOT-EXISTS 漂移缺口从未被任何迁移
 *   覆盖,导致 quantity-contract.resolveQuantity 引用 p.unit 时生产报 42703
 *   "字段不存在"(issue #550)。补列 + 治理回填让所有环境收敛到基线意图(g198 豁免)。
 */
export class AddMstProductsUnitColumn1794700000000 implements MigrationInterface {
  name = 'AddMstProductsUnitColumn1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 基线新环境已有该列(IF NOT EXISTS 幂等);生产/存量环境补齐缺口。
    await queryRunner.query(`ALTER TABLE "mst_products" ADD COLUMN IF NOT EXISTS "unit" VARCHAR(16)`);
    // 治理回填:存量行以既有 unit_zh 为准(与基线 DEFAULT '个' 语义一致,枚类已验证为 '枚')。
    await queryRunner.query(`UPDATE "mst_products" SET "unit" = "unit_zh" WHERE "unit" IS NULL AND "unit_zh" IS NOT NULL`);
    await queryRunner.query(`COMMENT ON COLUMN "mst_products"."unit" IS '产品基本计量单位(基线 v3_schema_complete 原生列;存量环境漂移缺口由本迁移补齐,回填源 unit_zh)'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 仅回滚演练用:回填值与原列无法区分,直接移除补列。
    await queryRunner.query(`ALTER TABLE "mst_products" DROP COLUMN IF EXISTS "unit"`);
  }
}
