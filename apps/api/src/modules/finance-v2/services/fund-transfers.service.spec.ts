import { FundTransfersService } from './fund-transfers.service';

describe('FundTransfersService.execute cash chain', () => {
  it('writes balanced TRANSFER legs and commits', async () => {
    const transfer: any = {
      id: '9', status: 'APPROVED', fromAccountId: '1', toAccountId: '2',
      amountOriginal: '25.00', transferNo: 'TRF-9', remark: null,
    };
    const repo = {
      findOne: jest.fn()
        .mockResolvedValueOnce(transfer)
        .mockResolvedValueOnce({ ...transfer, status: 'EXECUTED' }),
    } as any;
    const qr = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(),
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('FROM fin_cash_accounts')) {
          return params[0] === '1'
            ? [{ id: '1', account_code: 'FROM', account_name: 'From', company_code: 'C1', company_name: 'Co', currency_code: 'CNY', current_balance: '100', status: 'ACTIVE' }]
            : [{ id: '2', account_code: 'TO', account_name: 'To', company_code: 'C1', company_name: 'Co', currency_code: 'CNY', current_balance: '10', status: 'ACTIVE' }];
        }
        return [];
      }),
    } as any;
    const cashAccSvc = { applyBalance: jest.fn().mockResolvedValueOnce(75).mockResolvedValueOnce(35) } as any;
    const cashTxnSvc = { writeTransaction: jest.fn().mockResolvedValueOnce({ id: '11' }).mockResolvedValueOnce({ id: '12' }) } as any;
    const ds = { createQueryRunner: () => qr } as any;
    const svc = new FundTransfersService(repo, {} as any, ds, {} as any, cashAccSvc, cashTxnSvc);

    await expect(svc.execute('9', { username: 'u', dataScope: { scopeAll: true } }))
      .resolves.toMatchObject({ status: 'EXECUTED' });
    expect(cashAccSvc.applyBalance.mock.calls.map((c: any[]) => c[2])).toEqual([-25, 25]);
    expect(cashTxnSvc.writeTransaction.mock.calls.map((c: any[]) => [c[0].direction, c[0].sourceType, c[0].balanceAfter]))
      .toEqual([['OUT', 'TRANSFER', 75], ['IN', 'TRANSFER', 35]]);
    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
  });
});

describe('FundTransfersService.create account scope', () => {
  const dto = { fromAccountId: '1', toAccountId: '2', amountOriginal: 25 } as any;

  function service(from: any, to: any) {
    const repo = { create: jest.fn((v: any) => v), save: jest.fn() } as any;
    const accRepo = { findOne: jest.fn().mockResolvedValueOnce(from).mockResolvedValueOnce(to) } as any;
    const ds = { query: jest.fn().mockResolvedValue([{ cnt: 0 }]) } as any;
    return { svc: new FundTransfersService(repo, accRepo, ds, {} as any, {} as any, {} as any), repo };
  }

  it('rejects a cross-company destination account before creating a draft', async () => {
    const { svc, repo } = service(
      { id: '1', accountCode: 'FROM', companyCode: 'C1', currencyCode: 'CNY', status: 'ACTIVE' },
      { id: '2', accountCode: 'TO', companyCode: 'C2', currencyCode: 'CNY', status: 'ACTIVE' },
    );
    await expect(svc.create(dto, { dataScope: { scopeAll: true } }))
      .rejects.toThrow('转入账户与转出账户必须属于同一公司');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a cross-currency destination account before creating a draft', async () => {
    const { svc, repo } = service(
      { id: '1', accountCode: 'FROM', companyCode: 'C1', currencyCode: 'CNY', status: 'ACTIVE' },
      { id: '2', accountCode: 'TO', companyCode: 'C1', currencyCode: 'LAK', status: 'ACTIVE' },
    );
    await expect(svc.create(dto, { dataScope: { scopeAll: true } }))
      .rejects.toThrow('转入账户与转出账户币种必须一致');
    expect(repo.save).not.toHaveBeenCalled();
  });
});
