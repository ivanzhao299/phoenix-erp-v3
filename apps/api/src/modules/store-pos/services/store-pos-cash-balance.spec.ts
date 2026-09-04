import { BadRequestException } from '@nestjs/common';
import { StorePosService } from './store-pos.service';

describe('StorePosService cash balance writes', () => {
  const service = new StorePosService({} as any, { get: () => ({ username: 'cashier' }) } as any, {} as any, {} as any);

  function manager(returnedBalance: unknown) {
    const inserted: any[][] = [];
    const mgr = {
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('FROM fin_cash_accounts') && sql.includes('FOR UPDATE')) {
          return [{ id: 3, account_code: 'STORE', account_name: 'Store Cash', current_balance: '100', currency_code: 'CNY' }];
        }
        if (sql.includes("nextval('seq_store_sale_no')")) return [{ n: 9 }];
        if (sql.includes('UPDATE fin_cash_accounts')) return [[{ current_balance: returnedBalance }], 1];
        if (sql.includes('INSERT INTO fin_cash_transactions')) inserted.push(params);
        return [];
      }),
    };
    return { mgr, inserted };
  }

  it('writes STORE_SALE using the real TypeORM tuple balance', async () => {
    const { mgr, inserted } = manager('125.50');
    await (service as any).writeCashTransaction(mgr, {
      accountId: 3, companyCode: 'C1', currencyCode: 'CNY', amount: 25.5,
      sourceType: 'STORE_SALE', sourceId: 8, sourceNo: 'S8', remark: 'sale',
    });
    expect(inserted[0][10]).toBe(125.5);
  });

  it('writes STORE_SALE_RETURN using the real TypeORM tuple balance', async () => {
    const { mgr, inserted } = manager('80.00');
    await (service as any).writeCashRefund(mgr, {
      accountId: 3, companyCode: 'C1', currencyCode: 'CNY', amount: 20,
      sourceId: 8, sourceNo: 'S8', remark: 'return',
    });
    expect(inserted[0][9]).toBe(80);
  });

  it.each(['sale', 'refund'])('%s fails closed on a NaN returned balance', async (kind) => {
    const { mgr, inserted } = manager('NaN');
    const args = { accountId: 3, companyCode: 'C1', currencyCode: 'CNY', amount: 20, sourceId: 8, sourceNo: 'S8', remark: kind };
    const action = kind === 'sale'
      ? (service as any).writeCashTransaction(mgr, { ...args, sourceType: 'STORE_SALE' })
      : (service as any).writeCashRefund(mgr, args);
    await expect(action).rejects.toBeInstanceOf(BadRequestException);
    expect(inserted).toHaveLength(0);
  });
});
