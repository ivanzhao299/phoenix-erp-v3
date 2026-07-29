import { describe, expect, it } from 'vitest';
import {
  hasSufficientReimbursementBalance,
  normalizeCashAccountPayment,
} from './reimbursement-payment';

describe('reimbursement payment account contract', () => {
  it('normalizes the camelCase lookup response used by CashAccountSelector', () => {
    expect(normalizeCashAccountPayment({
      currentBalance: '80',
      currencyCode: 'CNY',
      companyCode: 'COMP-LAO-AGRI',
    })).toEqual({
      currentBalance: 80,
      currencyCode: 'CNY',
      companyCode: 'COMP-LAO-AGRI',
    });
  });

  it('checks the account against the original reimbursement amount', () => {
    const account = { currentBalance: '80', currencyCode: 'CNY' };
    expect(hasSufficientReimbursementBalance(account, '20')).toBe(true);
    expect(hasSufficientReimbursementBalance(account, '81')).toBe(false);
  });

  it('keeps legacy snake_case account payloads compatible', () => {
    expect(hasSufficientReimbursementBalance({
      current_balance: '80',
      currency_code: 'CNY',
    }, '20')).toBe(true);
  });

  it('fails closed when balance or payable amount is missing', () => {
    expect(hasSufficientReimbursementBalance({ currencyCode: 'CNY' }, '20')).toBe(false);
    expect(hasSufficientReimbursementBalance({ currentBalance: '80' }, undefined)).toBe(false);
    expect(hasSufficientReimbursementBalance({ currentBalance: '80' }, 0)).toBe(false);
  });
});
