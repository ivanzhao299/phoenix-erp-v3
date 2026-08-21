import { FinancialReportsService } from './financial-reports.service';

describe('FinancialReportsService Chanjet daily authority', () => {
  it('uses RECEIVED, never the obsolete COLLECTED value, for AR outstanding balances', async () => {
    const subject: any = Object.create(FinancialReportsService.prototype);
    subject.scope = jest.fn().mockReturnValue({ all: true, codes: [] });
    subject.buildScopeFilter = jest.fn().mockReturnValue({ filter: '', params: [] });
    subject.getChanjetDailyDocumentAggregate = jest.fn().mockResolvedValue({ available: false });
    subject.getChanjetArLedgerAggregate = jest.fn().mockResolvedValue({ available: false });
    subject.ds = { query: jest.fn().mockResolvedValue([]) };
    subject.logger = { warn: jest.fn() };

    await subject.getOverview({});

    const sql = subject.ds.query.mock.calls.map(([statement]: [string]) => statement).join('\n');
    expect(sql).toContain("status NOT IN ('RECEIVED','CANCELLED')");
    expect(sql).not.toContain('COLLECTED');
  });

  it('uses the exact business-date and EFFECTIVE contract for daily totals', async () => {
    const subject: any = Object.create(FinancialReportsService.prototype);
    subject.ds = {
      query: jest.fn().mockResolvedValue([{
        source_rows: '5',
        invalid_contract_rows: '0',
        effective_rows: '2',
        value: '205.50',
      }]),
    };
    subject.logger = { warn: jest.fn() };

    const result = await subject.getChanjetDailyDocumentAggregate(
      true,
      [],
      'AR_RECEIPT',
      '2026-07-20',
    );

    expect(result).toMatchObject({
      available: true,
      value: 205.5,
      rows: 2,
      sourceRows: 5,
      invalidContractRows: 0,
      latestPeriod: '2026-07-20',
    });
    expect(subject.ds.query).toHaveBeenCalledWith(
      expect.stringContaining("voucher_status = 'EFFECTIVE'"),
      ['AR_RECEIPT', '2026-07-20'],
    );
    const sql = subject.ds.query.mock.calls[0][0];
    expect(sql).toContain("raw_data->>'bizDate'");
    expect(sql).toContain("raw_data->>'voucherStatusEnum'");
    expect(sql).toContain("raw_data->>'totalAmount'");
    expect(sql).toContain("voucher_status = 'EFFECTIVE' AND document_amount IS NULL");
  });

  it('fails closed when any latest row violates the daily field contract', async () => {
    const subject: any = Object.create(FinancialReportsService.prototype);
    subject.ds = {
      query: jest.fn().mockResolvedValue([{
        source_rows: '5',
        invalid_contract_rows: '1',
        effective_rows: '2',
        value: '205.50',
      }]),
    };
    subject.logger = { warn: jest.fn() };

    const result = await subject.getChanjetDailyDocumentAggregate(
      false,
      ['COMP-LAO-AGRI'],
      'AP_PAYMENT',
      '2026-07-20',
    );

    expect(result).toMatchObject({ available: false, invalidContractRows: 1 });
    expect(subject.ds.query.mock.calls[0][1]).toEqual([
      ['COMP-LAO-AGRI'],
      'AP_PAYMENT',
      '2026-07-20',
    ]);
  });

  it('does not query Chanjet rows for an empty DataScope', async () => {
    const subject: any = Object.create(FinancialReportsService.prototype);
    subject.ds = { query: jest.fn() };

    const result = await subject.getChanjetDailyDocumentAggregate(
      false,
      [],
      'AR_RECEIPT',
      '2026-07-20',
    );

    expect(result.available).toBe(false);
    expect(subject.ds.query).not.toHaveBeenCalled();
  });
});
