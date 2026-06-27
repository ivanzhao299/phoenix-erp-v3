import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POS-P1c 退货/冲红:给 sal_store_sales 加退货留痕列。
 *
 * 退货为整单冲红:状态 COMPLETED → RETURNED(沿用现有 status 列,无需扩 enum 表),
 * 库存反向入 QUARANTINE 退货批(inv_ledger SALE_RETURN),资金按收款方式红冲
 * (现金腿 fin_cash_transactions OUT,赊销腿 负额 fin_ar_invoices 红字)。
 * 这两列仅记录退货时间/原因,便于销售记录展示与审计;财务/库存反向痕迹由
 * fin_ 表 / inv_ledger 的 source_type='STORE_SALE_RETURN' / change_type='SALE_RETURN' 提供。
 */
export class AddSalStoreSalesReturn1782062418112 implements MigrationInterface {
  name = 'AddSalStoreSalesReturn1782062418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sal_store_sales ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE sal_store_sales ADD COLUMN IF NOT EXISTS return_reason TEXT`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE sal_store_sales DROP COLUMN IF EXISTS return_reason`);
    await queryRunner.query(`ALTER TABLE sal_store_sales DROP COLUMN IF EXISTS returned_at`);
  }
}
