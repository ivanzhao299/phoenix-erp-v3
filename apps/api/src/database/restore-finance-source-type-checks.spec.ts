import { RestoreFinanceSourceTypeChecks1787304000000 } from './migrations/1787304000000-RestoreFinanceSourceTypeChecks';

describe('RestoreFinanceSourceTypeChecks1787304000000', () => {
  it('locks every application source into NOT VALID then VALIDATE CHECK constraints', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new RestoreFinanceSourceTypeChecks1787304000000();

    await migration.up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ALTER TABLE "fin_ar_invoices"');
    expect(sql).toContain('ALTER TABLE "fin_ap_invoices"');
    expect(sql).toContain('ALTER TABLE "fin_cash_transactions"');
    expect(sql).toContain('ALTER TABLE "fin_shareholder_contributions"');
    for (const value of [
      'SALES_ORDER', 'SALES_RETURN', 'STORE_SALE', 'STORE_SALE_RETURN',
      'MANUAL', 'CONTRACT', 'OPENING', 'PO', 'EXPENSE', 'REIMBURSEMENT',
      'AP_PAYMENT', 'AR_RECEIPT', 'TRANSFER', 'SHAREHOLDER', 'PAYMENT', 'IMPORT',
    ]) {
      expect(sql).toContain(`'${value}'`);
    }
    expect(sql.match(/NOT VALID/g)).toHaveLength(4);
    expect(sql.match(/VALIDATE CONSTRAINT/g)).toHaveLength(4);
    expect(sql).toContain('"source_type" IS NULL OR "source_type" IN');
  });

  it('drops all four restored constraints on rollback without changing data', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new RestoreFinanceSourceTypeChecks1787304000000();

    await migration.down({ query } as any);

    expect(query).toHaveBeenCalledTimes(4);
    for (const [statement] of query.mock.calls) {
      expect(statement).toContain('DROP CONSTRAINT IF EXISTS');
      expect(statement).not.toMatch(/\b(UPDATE|INSERT|DELETE|TRUNCATE|MERGE)\b/i);
    }
  });
});
