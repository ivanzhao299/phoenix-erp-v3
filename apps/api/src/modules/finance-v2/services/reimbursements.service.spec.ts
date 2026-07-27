import { BadRequestException } from '@nestjs/common';
import { ReimbursementsService } from './reimbursements.service';

describe('ReimbursementsService.pay', () => {
  function buildService(query: jest.Mock) {
    const manager = { query };
    const ds = {
      transaction: jest.fn(async (_level: string, work: (mgr: typeof manager) => Promise<unknown>) => work(manager)),
    };
    const cls = {
      get: jest.fn((key: string) => key === 'user' ? { username: 'cashier' } : undefined),
    };

    return {
      service: new ReimbursementsService(
        {} as never,
        ds as never,
        cls as never,
        {} as never,
      ),
      ds,
    };
  }

  it('uses the reimbursement original-currency amount when checking and deducting an account balance', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{
        id: '7',
        reimb_no: 'REIMB-7',
        expense_request_id: '3',
        company_code: 'LAO-01',
        currency_code: 'LAK',
        reimb_amount_original: '100000.00',
        reimb_amount_base: '35.00',
        status: 'APPROVED',
        payment_txn_id: null,
        remark: null,
      }])
      .mockResolvedValueOnce([{
        id: '9',
        account_code: 'CASH-LAK',
        account_name: '老挝现金',
        company_code: 'LAO-01',
        company_name: '老挝公司',
        currency_code: 'LAK',
        current_balance: '150000.00',
      }])
      .mockResolvedValueOnce([{ current_balance: '50000.00' }])
      .mockResolvedValueOnce([{ cnt: '0' }])
      .mockResolvedValueOnce([{ id: '11' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: '7', status: 'PAID' }]);
    const { service } = buildService(query);

    const result = await service.pay(
      '7',
      { cashAccountId: '9' },
      { dataScope: { scopeAll: true, companyCodes: [] } },
    );

    expect(result).toEqual(expect.objectContaining({ status: 'PAID', balanceAfter: 50000 }));
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SET current_balance = current_balance - $1'),
      [100000, '9'],
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO fin_cash_transactions'),
      expect.arrayContaining(['LAK', 100000, 50000]),
    );
  });

  it('reports a currency mismatch instead of a false insufficient-balance message', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{
        id: '7',
        reimb_no: 'REIMB-7',
        company_code: 'LAO-01',
        currency_code: 'LAK',
        reimb_amount_original: '100000.00',
        reimb_amount_base: '35.00',
        status: 'APPROVED',
        payment_txn_id: null,
      }])
      .mockResolvedValueOnce([{
        id: '9',
        account_code: 'CASH-CNY',
        company_code: 'LAO-01',
        currency_code: 'CNY',
        current_balance: '150000.00',
      }]);
    const { service } = buildService(query);

    await expect(service.pay(
      '7',
      { cashAccountId: '9' },
      { dataScope: { scopeAll: true, companyCodes: [] } },
    )).rejects.toThrow(new BadRequestException('现金账户币种 CNY 与报销币种 LAK 不一致'));
    expect(query).toHaveBeenCalledTimes(2);
  });
});
