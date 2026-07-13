import { describe, expect, it } from 'vitest';
import {
  buildFinanceApPaymentPrefillHref,
  parseFinanceApPaymentPrefill,
} from './finance-ap-payment-prefill';

describe('finance AP payment prefill', () => {
  it('builds a payment creation URL with the selected AP context', () => {
    const href = buildFinanceApPaymentPrefillHref({
      apId: 'ap-1',
      apNo: 'AP-202607-00002',
      companyCode: 'COMP-LAO-AGRI',
      companyName: '老挝凤凰农业发展有限公司',
      supplierCode: 'LJ-S-006',
      supplierName: '鞠德清（中粮）',
      currencyCode: 'CNY',
      balanceAmountOriginal: '10.00',
    });

    expect(href).toContain('/procurement2/payments/new?');
    expect(href).toContain('source=finance-ap');
    expect(href).toContain('apNo=AP-202607-00002');
    expect(href).toContain('supplierName=');
  });

  it('parses a valid AP context and normalizes amount and currency', () => {
    const prefill = parseFinanceApPaymentPrefill(new URLSearchParams({
      source: 'finance-ap',
      apId: 'ap-1',
      apNo: 'AP-202607-00002',
      companyCode: 'COMP-LAO-AGRI',
      supplierName: '鞠德清（中粮）',
      balanceAmountOriginal: '10.00',
    }));

    expect(prefill).toMatchObject({
      apId: 'ap-1',
      apNo: 'AP-202607-00002',
      companyCode: 'COMP-LAO-AGRI',
      supplierName: '鞠德清（中粮）',
      currencyCode: 'CNY',
      balanceAmountOriginal: '10',
    });
  });

  it('ignores unrelated or incomplete query strings', () => {
    expect(parseFinanceApPaymentPrefill(new URLSearchParams({ source: 'other' }))).toBeNull();
    expect(parseFinanceApPaymentPrefill(new URLSearchParams({ source: 'finance-ap', apId: 'ap-1' }))).toBeNull();
  });
});
