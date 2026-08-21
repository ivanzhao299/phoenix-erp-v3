import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restore the Finance V2 source_type guardrails that were lost when the clean
 * baseline rebuilt these tables. The allowed sets cover the legacy contract
 * plus every source emitted by current application write paths.
 */
export class RestoreFinanceSourceTypeChecks1787304000000 implements MigrationInterface {
  name = 'RestoreFinanceSourceTypeChecks1787304000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addAndValidate(queryRunner, 'fin_ar_invoices', 'chk_fin_ar_inv_source_type', [
      'SALES_ORDER', 'SALES_RETURN', 'STORE_SALE', 'STORE_SALE_RETURN',
      'MANUAL', 'CONTRACT', 'OPENING',
    ]);
    await this.addAndValidate(queryRunner, 'fin_ap_invoices', 'chk_fin_ap_invoices_source_type', [
      'PO', 'MANUAL', 'EXPENSE', 'REIMBURSEMENT', 'OPENING',
    ]);
    await this.addAndValidate(queryRunner, 'fin_cash_transactions', 'chk_fin_cash_txn_source_type', [
      'AP_PAYMENT', 'AR_RECEIPT', 'TRANSFER', 'SHAREHOLDER', 'REIMBURSEMENT',
      'STORE_SALE', 'STORE_SALE_RETURN', 'MANUAL', 'OPENING',
    ], true);
    await this.addAndValidate(queryRunner, 'fin_shareholder_contributions', 'chk_fin_shareholder_contrib_source_type', [
      'MANUAL', 'PAYMENT', 'OPENING', 'IMPORT',
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "fin_shareholder_contributions" DROP CONSTRAINT IF EXISTS "chk_fin_shareholder_contrib_source_type"');
    await queryRunner.query('ALTER TABLE "fin_cash_transactions" DROP CONSTRAINT IF EXISTS "chk_fin_cash_txn_source_type"');
    await queryRunner.query('ALTER TABLE "fin_ap_invoices" DROP CONSTRAINT IF EXISTS "chk_fin_ap_invoices_source_type"');
    await queryRunner.query('ALTER TABLE "fin_ar_invoices" DROP CONSTRAINT IF EXISTS "chk_fin_ar_inv_source_type"');
  }

  private async addAndValidate(
    queryRunner: QueryRunner,
    table: string,
    constraint: string,
    values: string[],
    nullable = false,
  ): Promise<void> {
    const allowed = values.map((value) => `'${value}'`).join(', ');
    const expression = nullable
      ? `"source_type" IS NULL OR "source_type" IN (${allowed})`
      : `"source_type" IN (${allowed})`;

    await queryRunner.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`);
    await queryRunner.query(
      `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" CHECK (${expression}) NOT VALID`,
    );
    await queryRunner.query(`ALTER TABLE "${table}" VALIDATE CONSTRAINT "${constraint}"`);
  }
}
