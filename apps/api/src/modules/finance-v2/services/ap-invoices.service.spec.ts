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
});
