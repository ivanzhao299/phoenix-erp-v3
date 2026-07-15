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
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('source')).toBe('finance-ap');
    expect(params.get('financeApId')).toBe('ap-1');
    expect(params.get('apId')).toBeNull();
    expect(params.get('apNo')).toBe('AP-202607-00002');
    expect(params.get('supplierName')).toBeTruthy();
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
      sourceApId: 'ap-1',
      apNo: 'AP-202607-00002',
      companyCode: 'COMP-LAO-AGRI',
      supplierName: '鞠德清（中粮）',
      currencyCode: 'CNY',
      balanceAmountOriginal: '10',
    });
  });

  it('keeps the finance AP id separate from procurement payment allocation apId', () => {
    const prefill = parseFinanceApPaymentPrefill(new URLSearchParams({
      source: 'finance-ap',
      financeApId: '11',
      apNo: 'AP-202607-00003',
      sourceNo: 'PO2-202607-00002',
      balanceAmountOriginal: '20.00',
    }));

    expect(prefill).toMatchObject({
      sourceApId: '11',
      apNo: 'AP-202607-00003',
      sourceNo: 'PO2-202607-00002',
      balanceAmountOriginal: '20',
    });
    expect(prefill).not.toHaveProperty('apId');
  });

  it('accepts legacy links that still use apId for the finance source id', () => {
    const prefill = parseFinanceApPaymentPrefill(new URLSearchParams({
      source: 'finance-ap',
      apId: 'legacy-finance-ap-1',
      apNo: 'AP-202607-00004',
      balanceAmountOriginal: '5.00',
    }));

    expect(prefill?.sourceApId).toBe('legacy-finance-ap-1');
    expect(prefill).not.toHaveProperty('apId');
  });

  it('ignores unrelated or incomplete query strings', () => {
    expect(parseFinanceApPaymentPrefill(new URLSearchParams({ source: 'other' }))).toBeNull();
    expect(parseFinanceApPaymentPrefill(new URLSearchParams({ source: 'finance-ap', financeApId: 'ap-1' }))).toBeNull();
  });
});
