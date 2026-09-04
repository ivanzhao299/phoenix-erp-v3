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
