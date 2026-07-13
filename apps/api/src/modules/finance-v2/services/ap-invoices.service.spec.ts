import { ApInvoicesService } from './ap-invoices.service';

describe('ApInvoicesService status labels', () => {
  function buildService(query: jest.Mock) {
    const ds = { query };
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'user') return { userId: 'u1' };
        if (key === 'dataScope') return { isGlobal: true, allowedCompanyCodes: [] };
        return undefined;
      }),
    };

    return new ApInvoicesService(ds as never, cls as never);
  }

  function buildPayService(opts: {
    qrQuery: jest.Mock;
    dsQuery?: jest.Mock;
    applyBalance?: jest.Mock;
    writeTransaction?: jest.Mock;
  }) {
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: opts.qrQuery,
    };
    const ds = {
      createQueryRunner: jest.fn(() => qr),
      query: opts.dsQuery ?? jest.fn(),
    };
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'user') return { userId: 'u1' };
        if (key === 'dataScope') return { isGlobal: true, allowedCompanyCodes: [] };
        return undefined;
      }),
    };
    const cashAccSvc = {
      applyBalance: opts.applyBalance ?? jest.fn().mockResolvedValue(75),
    };
    const cashTxnSvc = {
      writeTransaction: opts.writeTransaction ?? jest.fn().mockResolvedValue({ id: '501' }),
    };

    return {
      service: new ApInvoicesService(ds as never, cls as never, cashAccSvc as never, cashTxnSvc as never),
      qr,
      ds,
      cashAccSvc,
      cashTxnSvc,
    };
  }

  it('labels unpaid AP invoices as 未付款 in list responses', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '1',
          ap_no: 'AP-202607-00001',
          company_code: 'COMP-LAO-AGRI',
          supplier_name: '测试供应商',
          amount_original: '10.00',
          paid_amount_original: '0.00',
          balance_amount_original: '10.00',
          status: 'OPEN',
          payment_status: 'UNPAID',
          aging_bucket: 'NOT_DUE',
        },
      ])
      .mockResolvedValueOnce([{ cnt: 1 }]);
    const service = buildService(query);

    const result = await service.list({});

    expect(result.items[0]).toEqual(expect.objectContaining({
      status: 'OPEN',
      payment_status: 'UNPAID',
      status_label: '未付款',
      payment_status_label: '未付款',
    }));
    expect(result.items[0].status_label).not.toBe('未收款');
  });

  it('labels cancelled AP invoices as 已取消 while preserving payment status label', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '2',
          ap_no: 'AP-202607-00002',
          company_code: 'COMP-LAO-AGRI',
          status: 'CANCELLED',
          payment_status: 'UNPAID',
          amount_original: '20.00',
          paid_amount_original: '0.00',
          balance_amount_original: '20.00',
        },
      ])
      .mockResolvedValueOnce([]);
    const service = buildService(query);

    const result = await service.findById('2');

    expect(result).toEqual(expect.objectContaining({
      status_label: '已取消',
      payment_status_label: '未付款',
      allocations: [],
    }));
  });

  it('falls back to legacy AP payments when allocation table is missing', async () => {
    const missingAllocationTable = Object.assign(new Error('relation "fin_ap_payment_allocations" does not exist'), {
      code: '42P01',
    });
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '9',
          ap_no: 'AP-202607-00009',
          company_code: 'COMP-LAO-AGRI',
          supplier_name: '测试供应商',
          amount_original: '88.00',
          paid_amount_original: '20.00',
          balance_amount_original: '68.00',
          status: 'PARTIALLY_PAID',
          payment_status: 'PARTIAL',
        },
      ])
      .mockRejectedValueOnce(missingAllocationTable)
      .mockResolvedValueOnce([
        {
          id: '101',
          alloc_no: 'PAY-202607-00101',
          amount_original: '20.00',
          currency_code: 'CNY',
          payment_date: '2026-07-11',
          payment_method: 'BANK_TRANSFER',
          reference_no: 'BANK-REF-1',
          remark: 'legacy payment',
          created_at: '2026-07-11T04:00:00.000Z',
        },
      ]);
    const service = buildService(query);

    const result = await service.findById('9');

    expect(result.allocations).toEqual([
      expect.objectContaining({
        alloc_no: 'PAY-202607-00101',
        amount_original: '20.00',
      }),
    ]);
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('FROM fin_ap_payments WHERE invoice_id = $1'),
      ['9'],
    );
  });

  it('returns AP invoice detail with empty allocations when no payment history table exists', async () => {
    const missingTable = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '8',
          ap_no: 'AP-202607-00008',
          company_code: 'COMP-LAO-AGRI',
          supplier_name: '测试供应商',
          amount_original: '50.00',
          paid_amount_original: '0.00',
          balance_amount_original: '50.00',
          status: 'OPEN',
          payment_status: 'UNPAID',
        },
      ])
      .mockRejectedValueOnce(missingTable)
      .mockRejectedValueOnce(missingTable);
    const service = buildService(query);

    const result = await service.findById('8');

    expect(result).toEqual(expect.objectContaining({
      id: '8',
      status_label: '未付款',
      payment_status_label: '未付款',
      allocations: [],
    }));
  });

  it('pays an AP invoice by writing allocation, updating invoice status, and appending AP_PAYMENT cash transaction', async () => {
    const qrQuery = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '9',
          ap_no: 'AP-202607-00009',
          company_code: 'COMP-LAO-AGRI',
          company_name: '老挝凤凰农业发展有限公司',
          supplier_code: 'SUP-001',
          supplier_name: '测试供应商',
          currency_code: 'CNY',
          exchange_rate: '1',
          amount_original: '100.00',
          paid_amount_original: '20.00',
          paid_amount_base: '20.00',
          balance_amount_original: '80.00',
          balance_amount_base: '80.00',
          status: 'PARTIALLY_PAID',
          payment_status: 'PARTIAL',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: '30',
          account_code: 'CASH-CNY',
          account_name: '现金账户',
          company_code: 'COMP-LAO-AGRI',
          company_name: '老挝凤凰农业发展有限公司',
          currency_code: 'CNY',
          current_balance: '100.00',
          status: 'ACTIVE',
        },
      ])
      .mockResolvedValueOnce([{ cnt: 0 }])
      .mockResolvedValueOnce([{ id: '21', alloc_no: 'APA-202607-00001' }])
      .mockResolvedValueOnce([]);
    const dsQuery = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: '9',
          ap_no: 'AP-202607-00009',
          company_code: 'COMP-LAO-AGRI',
          amount_original: '100.00',
          paid_amount_original: '45.00',
          balance_amount_original: '55.00',
          status: 'PARTIALLY_PAID',
          payment_status: 'PARTIAL',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: '21',
          alloc_no: 'APA-202607-00001',
          amount_original: '25.00',
          currency_code: 'CNY',
          payment_date: '2026-07-13',
        },
      ]);
    const applyBalance = jest.fn().mockResolvedValue(75);
    const writeTransaction = jest.fn().mockResolvedValue({ id: '501' });
    const { service, qr, cashAccSvc, cashTxnSvc } = buildPayService({
      qrQuery,
      dsQuery,
      applyBalance,
      writeTransaction,
    });

    const result = await service.payInvoice('9', {
      cashAccountId: '30',
      paymentDate: '2026-07-13',
      amountOriginal: 25,
      paymentMethod: 'BANK_TRANSFER',
      referenceNo: 'BANK-REF-1',
      remark: '测试付款',
    });

    expect(qr.startTransaction).toHaveBeenCalledWith('SERIALIZABLE');
    expect(qr.commitTransaction).toHaveBeenCalled();
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
    expect(qrQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO fin_ap_payment_allocations'),
      expect.arrayContaining(['APA-202607-00001', '9', 'COMP-LAO-AGRI', 'CNY', 25]),
    );
    expect(qrQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE fin_ap_invoices'),
      [45, 45, 55, 55, 'PARTIALLY_PAID', 'PARTIAL', 'u1', '9'],
    );
    expect(cashAccSvc.applyBalance).toHaveBeenCalledWith(qr, '30', -25, 'u1');
    expect(cashTxnSvc.writeTransaction).toHaveBeenCalledWith(expect.objectContaining({
      qr,
      accountId: '30',
      direction: 'OUT',
      sourceType: 'AP_PAYMENT',
      sourceId: '21',
      sourceNo: 'APA-202607-00001',
      amount: 25,
      balanceAfter: 75,
    }));
    expect(result).toEqual(expect.objectContaining({
      id: '9',
      status_label: '部分付款',
      payment_status_label: '部分付款',
      allocations: [expect.objectContaining({ alloc_no: 'APA-202607-00001' })],
    }));
  });

  it('rolls back AP payment when amount exceeds current invoice balance', async () => {
    const qrQuery = jest.fn().mockResolvedValueOnce([
      {
        id: '9',
        ap_no: 'AP-202607-00009',
        company_code: 'COMP-LAO-AGRI',
        currency_code: 'CNY',
        exchange_rate: '1',
        amount_original: '100.00',
        paid_amount_original: '90.00',
        paid_amount_base: '90.00',
        balance_amount_original: '10.00',
        balance_amount_base: '10.00',
        status: 'PARTIALLY_PAID',
        payment_status: 'PARTIAL',
      },
    ]);
    const writeTransaction = jest.fn();
    const { service, qr, cashTxnSvc } = buildPayService({
      qrQuery,
      writeTransaction,
    });

    await expect(service.payInvoice('9', {
      cashAccountId: '30',
      paymentDate: '2026-07-13',
      amountOriginal: 11,
    })).rejects.toThrow('超额');

    expect(qr.rollbackTransaction).toHaveBeenCalled();
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(qr.release).toHaveBeenCalled();
    expect(cashTxnSvc.writeTransaction).not.toHaveBeenCalled();
    expect(qrQuery).toHaveBeenCalledTimes(1);
  });
});
