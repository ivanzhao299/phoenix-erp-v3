import type { MigrationInterface, QueryRunner } from 'typeorm';

const ownershipComment = 'Finance V2 AP payment allocations created by EnsureFinanceApPaymentAllocations1795719000000';

export class EnsureFinanceApPaymentAllocations1795719000000 implements MigrationInterface {
  name = 'EnsureFinanceApPaymentAllocations1795719000000';

  async up(runner: QueryRunner): Promise<void> {
    const [{ has_allocations, has_legacy_payments }] = await runner.query(`
      SELECT to_regclass('fin_ap_payment_allocations') IS NOT NULL AS has_allocations,
             to_regclass('fin_ap_payments') IS NOT NULL AS has_legacy_payments
    `);
    if (has_allocations || has_legacy_payments) return;

    await runner.query(`
      CREATE TABLE fin_ap_payment_allocations (
        id BIGSERIAL PRIMARY KEY,
        alloc_no VARCHAR(60) NOT NULL UNIQUE,
        invoice_id BIGINT NOT NULL REFERENCES fin_ap_invoices(id),
        company_code VARCHAR(64) NOT NULL,
        company_name VARCHAR(256),
        currency_code VARCHAR(8) NOT NULL DEFAULT 'CNY',
        amount_original NUMERIC(18,2) NOT NULL,
        exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1,
        amount_base NUMERIC(18,2) NOT NULL DEFAULT 0,
        base_currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
        payment_date DATE NOT NULL,
        payment_method VARCHAR(40),
        bank_account VARCHAR(100),
        reference_no VARCHAR(100),
        cash_account_id BIGINT,
        wf_instance_id BIGINT,
        remark TEXT,
        created_by VARCHAR(80),
        updated_by VARCHAR(80),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_fin_ap_alloc_invoice ON fin_ap_payment_allocations (invoice_id);
      CREATE INDEX idx_fin_ap_alloc_date ON fin_ap_payment_allocations (payment_date DESC);
      CREATE INDEX idx_fin_ap_alloc_company ON fin_ap_payment_allocations (company_code);
      COMMENT ON TABLE fin_ap_payment_allocations IS '${ownershipComment}';
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    const [{ comment }] = await runner.query(`
      SELECT obj_description(to_regclass('fin_ap_payment_allocations'), 'pg_class') AS comment
    `);
    if (comment !== ownershipComment) return;

    await runner.query('LOCK TABLE fin_ap_payment_allocations IN ACCESS EXCLUSIVE MODE');
    const [allocation] = await runner.query('SELECT 1 FROM fin_ap_payment_allocations LIMIT 1');
    if (allocation) throw new Error('Cannot revert AP allocations with recorded payments');
    await runner.query('DROP TABLE fin_ap_payment_allocations');
  }
}
