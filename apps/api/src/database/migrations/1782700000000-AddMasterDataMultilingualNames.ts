import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 主数据名称多语言补齐（task #25，2026-06-28，用户拍板「全量补齐」）
 * ════════════════════════════════════════════════════════════════════════
 * Why：多家主数据管理页缺 _en/_lo 名称列，导致英文/老挝语用户在列表/选择器里只能看中文。
 *   tField(obj, base) 按当前语言取 `<base>_<lang>`，缺则回退 `<base>`（中文）。本迁移为
 *   13 类主数据补齐 `<nameCol>_en` / `<nameCol>_lo`（已存在的不重复加，IF NOT EXISTS 幂等）。
 *
 * 已有列现状（不重复补）：
 *   products: product_name_zh/_lo（补 _en）  warehouses: warehouse_name_zh（补 _en/_lo）
 *   suppliers: supplier_name_en（补 _lo）     bank: bank_name_en（补 _lo）
 *   grades/specs: *_lo（补 _en）              dict: 三语齐全（不动）
 *
 * 纯 DDL（ADD COLUMN），无 DML —— 符合 g197-H（迁移 up() 禁业务 DML）。
 * 列均 nullable（不进任何唯一约束）—— 不触 g198 nullable-in-unique 门禁。
 * 写路径在 master-data-runtime.service.ts 的 writableCols 放行；表为 raw-SQL 访问，
 *   不声明 entity 列 —— 不增 g197 entity↔DB 漂移。
 */
export class AddMasterDataMultilingualNames1782700000000 implements MigrationInterface {
  name = 'AddMasterDataMultilingualNames1782700000000';

  // [表, 列] —— 仅补「尚不存在」的语言列（IF NOT EXISTS 再兜一层幂等）
  private readonly cols: [string, string][] = [
    ['sal_customers', 'customer_name_en'],
    ['sal_customers', 'customer_name_lo'],
    ['prc2_suppliers', 'supplier_name_lo'],
    ['biz_projects', 'project_name_en'],
    ['biz_projects', 'project_name_lo'],
    ['mst_materials', 'material_name_en'],
    ['mst_materials', 'material_name_lo'],
    ['fin_cash_accounts', 'account_name_en'],
    ['fin_cash_accounts', 'account_name_lo'],
    ['mst_products', 'product_name_en'],
    ['mst_stores', 'store_name_en'],
    ['mst_stores', 'store_name_lo'],
    ['fin_bank_accounts', 'bank_name_lo'],
    ['product_skus', 'sku_name_en'],
    ['product_skus', 'sku_name_lo'],
    ['wms_warehouses', 'warehouse_name_en'],
    ['wms_warehouses', 'warehouse_name_lo'],
    ['product_grades', 'grade_name_en'],
    ['packaging_specs', 'spec_name_en'],
    ['sal_drivers', 'driver_name_en'],
    ['sal_drivers', 'driver_name_lo'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, col] of this.cols) {
      await queryRunner.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} varchar(255)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, col] of this.cols) {
      await queryRunner.query(
        `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${col}`,
      );
    }
  }
}
