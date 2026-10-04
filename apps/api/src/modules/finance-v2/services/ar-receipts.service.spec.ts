import { ArReceiptsService } from './ar-receipts.service';

describe('ArReceiptsService', () => {
  function buildService() {
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };
    const ds = {
      query: jest.fn(),
      createQueryRunner: jest.fn(() => qr),
    };
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'user') return { userId: 'u1' };
        if (key === 'dataScope') return { isGlobal: true, allowedCompanyCodes: [] };
        return undefined;
      }),
    };
    const cashAccSvc = {
      applyBalance: jest.fn().mockResolvedValue(112),
    };
    const cashTxnSvc = {
      writeTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
    };
    const service = new ArReceiptsService(
      ds as never,
      cls as never,
      {} as never,
      cashAccSvc as never,
      cashTxnSvc as never,
    );
    return { service, ds, qr, cashAccSvc, cashTxnSvc };
  }

  it('posts to the saved receipt cash account when confirm dto omits receiveAccountId', async () => {
    const { service, ds, qr, cashAccSvc, cashTxnSvc } = buildService();
    jest.spyOn(service, 'findById').mockResolvedValue({ id: '10' } as never);
    ds.query.mockResolvedValueOnce([{
      id: '10',
      receipt_no: 'RCP-202607-00001',
      company_code: 'COMP-LAO-AGRI',
      status: 'DRAFT',
      amount_original: '12.00',
      currency_code: 'CNY',
      exchange_rate: '1',
      received_account_code: 'CA-AR-001',
      customer_name: '测试客户',
    }]);

    qr.query.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes('FROM fin_ar_invoices WHERE id = $1 FOR UPDATE')) {
        return Promise.resolve([{
          id: '20',
          ar_no: 'AR-202607-00001',
          balance_amount_original: '12.00',
          currency_code: 'CNY',
          company_code: 'COMP-LAO-AGRI',
        }]);
      }
      if (sql.includes('SELECT amount_original, received_amount_original, status FROM fin_ar_invoices')) {
        return Promise.resolve([{
          amount_original: '12.00',
          received_amount_original: '12.00',
          status: 'OPEN',
        }]);
      }
      if (sql.includes('FROM fin_cash_accounts WHERE account_code = $1 FOR UPDATE')) {
        expect(params).toEqual(['CA-AR-001']);
        return Promise.resolve([{
          id: '30',
          account_code: 'CA-AR-001',
          account_name: '应收测试账户',
          company_code: 'COMP-LAO-AGRI',
          company_name: '测试公司',
          currency_code: 'CNY',
          current_balance: '100.00',
          status: 'ACTIVE',
        }]);
      }
      return Promise.resolve([]);
    });

    await service.confirm('10', {
      allocations: [{ arInvoiceId: '20', allocatedAmountOriginal: 12 }],
    });

    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    expect(cashAccSvc.applyBalance).toHaveBeenCalledWith(qr, '30', 12, 'u1');
    expect(cashTxnSvc.writeTransaction).toHaveBeenCalledWith(expect.objectContaining({
      qr,
      accountCode: 'CA-AR-001',
      direction: 'IN',
      sourceType: 'AR_RECEIPT',
      sourceId: '10',
      sourceNo: 'RCP-202607-00001',
      amount: 12,
      balanceAfter: 112,
      createdBy: 'u1',
    }));
  });

  it('confirms an unallocated receipt and posts it to the saved cash account', async () => {
    const { service, ds, qr, cashAccSvc, cashTxnSvc } = buildService();
    jest.spyOn(service, 'findById').mockResolvedValue({ id: '11' } as never);
    ds.query.mockResolvedValueOnce([{
      id: '11',
      receipt_no: 'RCP-202607-00002',
      company_code: 'COMP-LAO-AGRI',
      status: 'DRAFT',
      amount_original: '25.00',
      currency_code: 'CNY',
      exchange_rate: '1',
      received_account_code: 'CA-AR-002',
      customer_name: '测试客户',
    }]);
    qr.query.mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes('FROM fin_cash_accounts WHERE account_code = $1 FOR UPDATE')) {
        expect(params).toEqual(['CA-AR-002']);
        return Promise.resolve([{
          id: '31',
          account_code: 'CA-AR-002',
          account_name: '普通收款账户',
          company_code: 'COMP-LAO-AGRI',
          company_name: '测试公司',
          currency_code: 'CNY',
          current_balance: '200.00',
          status: 'ACTIVE',
        }]);
      }
      return Promise.resolve([]);
    });
    cashAccSvc.applyBalance.mockResolvedValueOnce(225);

    await service.confirm('11', { allocations: [] });

    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(cashAccSvc.applyBalance).toHaveBeenCalledWith(qr, '31', 25, 'u1');
    expect(cashTxnSvc.writeTransaction).toHaveBeenCalledWith(expect.objectContaining({
      accountCode: 'CA-AR-002',
      sourceType: 'AR_RECEIPT',
      sourceId: '11',
      amount: 25,
      balanceAfter: 225,
    }));
  });

  it('denies list access when the CLS data scope has no companies', async () => {
    const { service, ds } = buildService();
    (service as any).cls.get.mockImplementation((key: string) => {
      if (key === 'user') return { userId: 'u1' };
      if (key === 'dataScope') return {
        isGlobal: false,
        scopeLevel: 'COMPANY',
        allowedCompanyCodes: [],
        allowedProjectCodes: [],
      };
      return undefined;
    });

    ds.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ cnt: '0' }]);
    const result = await service.list({} as never);

    expect(result.total).toBe(0);
    expect(ds.query.mock.calls[0][0]).toContain('1=0');
  });

  it('rejects receipt creation for a company outside the CLS data scope', async () => {
    const { service, ds } = buildService();
    (service as any).cls.get.mockImplementation((key: string) => {
      if (key === 'user') return { userId: 'u1' };
      if (key === 'dataScope') return {
        isGlobal: false,
        scopeLevel: 'COMPANY',
        allowedCompanyCodes: ['COMP-A'],
        allowedProjectCodes: [],
      };
      return undefined;
    });

    await expect(service.create({
      companyCode: 'COMP-B',
      amountOriginal: 10,
      customerName: '测试客户',
      receiptDate: '2026-07-01',
      currencyCode: 'CNY',
    } as never)).rejects.toThrow('无权写入公司 COMP-B');
    expect(ds.query).not.toHaveBeenCalled();
  });
});
