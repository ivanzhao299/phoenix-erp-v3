import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POS-P0-6:给 sal_store_sales 加 currency_code 列(币种贯通的落脚列)。
 *
 * 根因:门店销售单原本无币种列,收款写 fin_cash_transactions、赊销写 fin_ar_invoices
 *   时币种被硬编码为 'CNY'。但本项目跨境多公司,价格本(sal_price_items)默认币种是 LAK
 *   → 一张 LAK 定价的销售单,现金腿/AR 腿被强行记成 CNY,账实币种漂移。
 *   尤其 MIXED 单:现金腿与 AR 腿若各记各的币种 → 同单内币种不一致(此前 review 拦下的 P1)。
 *
 * 修法:销售单持有唯一币种(来源=公司 ACTIVE 价格本币种,见 store-pos.service.resolveSaleCurrency),
 *   现金腿/AR 腿统一读 sal_store_sales.currency_code → 同单同币种,不再漂移。
 *
 * 兼容:default 'CNY' —— 历史行(此前现金/AR 已按 CNY 落盘)继续视为 CNY,与既有账务一致,
 *   不需要回填 DML。新单按价格本真实币种写入。
 */
export class AddSalStoreSalesCurrency1782060418112 implements MigrationInterface {
  name = 'AddSalStoreSalesCurrency1782060418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sal_store_sales ADD COLUMN IF NOT EXISTS currency_code VARCHAR(8) NOT NULL DEFAULT 'CNY'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sal_store_sales DROP COLUMN IF EXISTS currency_code`,
    );
  }
}
