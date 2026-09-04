import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PostgreSQL numeric has a special NaN value (but no infinities). Keep cash
 * facts and derived balance snapshots finite at the storage boundary.
 */
export class RejectNonFiniteCashBalances1788570000000 implements MigrationInterface {
  name = 'RejectNonFiniteCashBalances1788570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "fin_cash_transactions" DROP CONSTRAINT IF EXISTS "chk_fin_cash_txn_amount_finite"');
    await queryRunner.query('ALTER TABLE "fin_cash_transactions" ADD CONSTRAINT "chk_fin_cash_txn_amount_finite" CHECK ("amount" <> \'NaN\'::numeric) NOT VALID');
    await queryRunner.query('ALTER TABLE "fin_cash_transactions" VALIDATE CONSTRAINT "chk_fin_cash_txn_amount_finite"');

    await queryRunner.query('ALTER TABLE "fin_cash_transactions" DROP CONSTRAINT IF EXISTS "chk_fin_cash_txn_balance_after_finite"');
    await queryRunner.query('ALTER TABLE "fin_cash_transactions" ADD CONSTRAINT "chk_fin_cash_txn_balance_after_finite" CHECK ("balance_after" <> \'NaN\'::numeric) NOT VALID');
    await queryRunner.query('ALTER TABLE "fin_cash_transactions" VALIDATE CONSTRAINT "chk_fin_cash_txn_balance_after_finite"');

    await queryRunner.query('ALTER TABLE "fin_cash_accounts" DROP CONSTRAINT IF EXISTS "chk_fin_cash_acc_opening_balance_finite"');
    await queryRunner.query('ALTER TABLE "fin_cash_accounts" ADD CONSTRAINT "chk_fin_cash_acc_opening_balance_finite" CHECK ("opening_balance" <> \'NaN\'::numeric) NOT VALID');
    await queryRunner.query('ALTER TABLE "fin_cash_accounts" VALIDATE CONSTRAINT "chk_fin_cash_acc_opening_balance_finite"');

    await queryRunner.query('ALTER TABLE "fin_cash_accounts" DROP CONSTRAINT IF EXISTS "chk_fin_cash_acc_current_balance_finite"');
    await queryRunner.query('ALTER TABLE "fin_cash_accounts" ADD CONSTRAINT "chk_fin_cash_acc_current_balance_finite" CHECK ("current_balance" <> \'NaN\'::numeric) NOT VALID');
    await queryRunner.query('ALTER TABLE "fin_cash_accounts" VALIDATE CONSTRAINT "chk_fin_cash_acc_current_balance_finite"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "fin_cash_accounts" DROP CONSTRAINT IF EXISTS "chk_fin_cash_acc_current_balance_finite"');
    await queryRunner.query('ALTER TABLE "fin_cash_accounts" DROP CONSTRAINT IF EXISTS "chk_fin_cash_acc_opening_balance_finite"');
    await queryRunner.query('ALTER TABLE "fin_cash_transactions" DROP CONSTRAINT IF EXISTS "chk_fin_cash_txn_balance_after_finite"');
    await queryRunner.query('ALTER TABLE "fin_cash_transactions" DROP CONSTRAINT IF EXISTS "chk_fin_cash_txn_amount_finite"');
  }

}
