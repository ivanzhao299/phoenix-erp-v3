import { ArInvoicesService } from './ar-invoices.service';

describe('ArInvoicesService DataScope writes', () => {
  function build(scope: Record<string, unknown>) {
    const ds = { query: jest.fn() };
    const cls = {
      get: jest.fn((key: string) => {
        if (key === 'user') return { userId: 'u1' };
        if (key === 'dataScope') return scope;
        return undefined;
      }),
    };
    return { service: new ArInvoicesService(ds as never, cls as never), ds };
  }

  it('rejects a manual invoice outside the caller company scope', async () => {
    const { service, ds } = build({
      isGlobal: false,
      scopeLevel: 'COMPANY',
      allowedCompanyCodes: ['COMP-A'],
      allowedProjectCodes: [],
    });

    await expect(service.createManual({
      companyCode: 'COMP-B',
      customerName: '客户',
      currencyCode: 'CNY',
      amountOriginal: 100,
    } as never)).rejects.toThrow('无权写入公司 COMP-B');
    expect(ds.query).not.toHaveBeenCalled();
  });

  it('rejects writes when the resolved scope is empty', async () => {
    const { service, ds } = build({
      isGlobal: false,
      scopeLevel: 'COMPANY',
      allowedCompanyCodes: [],
      allowedProjectCodes: [],
    });

    await expect(service.createManual({
      companyCode: 'COMP-A',
      customerName: '客户',
      currencyCode: 'CNY',
      amountOriginal: 100,
    } as never)).rejects.toThrow('数据范围未配置');
    expect(ds.query).not.toHaveBeenCalled();
  });

  it('rejects moving an editable invoice to an out-of-scope project', async () => {
    const { service, ds } = build({
      isGlobal: false,
      scopeLevel: 'PROJECT',
      allowedCompanyCodes: ['COMP-A'],
      allowedProjectCodes: ['PROJECT-A'],
    });
    ds.query.mockResolvedValueOnce([{
      id: 'ar-1', company_code: 'COMP-A', project_code: 'PROJECT-A',
      status: 'OPEN', collection_status: 'UNRECEIVED',
      amount_original: '100', received_amount_original: '0', balance_amount_original: '100',
      exchange_rate: '1',
    }]);

    await expect(service.update('ar-1', { projectCode: 'PROJECT-B' } as never))
      .rejects.toThrow('无权写入项目 PROJECT-B');
    expect(ds.query).toHaveBeenCalledTimes(1);
  });
});
