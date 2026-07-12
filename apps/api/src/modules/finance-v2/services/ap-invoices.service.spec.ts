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
});
