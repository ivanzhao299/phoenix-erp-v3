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
});
