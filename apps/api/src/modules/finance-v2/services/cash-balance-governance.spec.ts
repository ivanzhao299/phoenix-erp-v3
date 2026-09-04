import { BadRequestException } from '@nestjs/common';
import { CashAccountsService } from './cash-accounts.service';
import { CashTransactionsService } from './cash-transactions.service';
import { returningRow } from './cash-balance.guard';

describe('cash balance finite-number governance', () => {
  const repository = {} as any;
  const cls = {} as any;

  it('normalizes the real TypeORM DML RETURNING tuple and legacy rows shape', () => {
    expect(returningRow([[{ current_balance: '12.34' }], 1], 'update'))
      .toEqual({ current_balance: '12.34' });
    expect(returningRow([{ current_balance: '12.34' }], 'update'))
      .toEqual({ current_balance: '12.34' });
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, 'NaN'])(
    'applyBalance rejects non-finite delta %p before issuing SQL',
    async (delta) => {
      const qr = { query: jest.fn() } as any;
      const service = new CashAccountsService(repository, {} as any, cls);
      await expect(service.applyBalance(qr, '1', delta as number, null))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(qr.query).not.toHaveBeenCalled();
    },
  );

  it('applyBalance reads current_balance from [rows,rowCount]', async () => {
    const qr = { query: jest.fn().mockResolvedValue([[{ current_balance: '108.25' }], 1]) } as any;
    const service = new CashAccountsService(repository, {} as any, cls);
    await expect(service.applyBalance(qr, '1', 8.25, 'cashier')).resolves.toBe(108.25);
  });

  it('applyBalance fails closed when RETURNING is empty or non-finite', async () => {
    const service = new CashAccountsService(repository, {} as any, cls);
    for (const raw of [[[], 0], [[{ current_balance: 'NaN' }], 1]]) {
      const qr = { query: jest.fn().mockResolvedValue(raw) } as any;
      await expect(service.applyBalance(qr, '1', 1, null))
        .rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rebuildChain rejects a corrupt amount before any balance write', async () => {
    const mgr = {
      query: jest.fn().mockResolvedValueOnce([
        { id: '7', direction: 'IN', amount: 'NaN', source_type: 'MANUAL' },
      ]),
    } as any;
    const service = new CashAccountsService(repository, {} as any, cls);
    await expect((service as any).rebuildChain(mgr, 'CASH', 100, null))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(mgr.query).toHaveBeenCalledTimes(1);
  });

  it('createManual serializes concurrent snapshots with SELECT FOR UPDATE', async () => {
    let balance = 100;
    const snapshots: number[] = [];
    let gate = Promise.resolve();
    const ds = {
      query: jest.fn(),
      transaction: jest.fn((work: (mgr: any) => Promise<number>) => {
        const run = gate.then(() => work({
          query: jest.fn(async (sql: string, params: any[]) => {
            if (sql.includes('SELECT id, account_code')) {
              expect(sql).toContain('FOR UPDATE');
              return [{ id: '1', account_code: 'CASH', account_name: 'Cash', company_code: 'C1', company_name: 'Co', currency_code: 'CNY', current_balance: String(balance) }];
            }
            if (sql.includes('INSERT INTO fin_cash_transactions')) {
              snapshots.push(params[9]);
              return [];
            }
            if (sql.includes('UPDATE fin_cash_accounts')) {
              balance = params[0];
              return [];
            }
            return [{ cnt: 0 }];
          }),
        }));
        gate = run.then(() => undefined, () => undefined);
        return run;
      }),
    } as any;
    const service = new CashTransactionsService(repository, ds);
    await Promise.all([
      service.createManual({ account_code: 'CASH', direction: 'IN', amount: 10 }, 1, 'u'),
      service.createManual({ account_code: 'CASH', direction: 'IN', amount: 20 }, 1, 'u'),
    ]);
    expect(ds.query).not.toHaveBeenCalled();
    expect(snapshots).toEqual([110, 130]);
    expect(balance).toBe(130);
  });

  it('writeTransaction rejects non-finite values before generating a number', async () => {
    const qr = { query: jest.fn() } as any;
    const service = new CashTransactionsService(repository, {} as any);
    await expect(service.writeTransaction({
      qr, accountId: '1', accountCode: 'CASH', accountName: 'Cash', companyCode: 'C1',
      companyName: null, direction: 'IN', sourceType: 'AR_RECEIPT', currencyCode: 'CNY',
      amount: 1, balanceAfter: Number.NaN,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(qr.query).not.toHaveBeenCalled();
  });
});
