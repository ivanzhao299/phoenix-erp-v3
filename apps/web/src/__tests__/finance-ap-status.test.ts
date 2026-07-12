import { describe, expect, it } from 'vitest';
import { getApInvoiceStatusLabel } from '@/lib/finance-ap-status';

describe('getApInvoiceStatusLabel', () => {
  it('uses AP payment semantics for open invoices', () => {
    expect(getApInvoiceStatusLabel('OPEN')).toBe('未付款');
    expect(getApInvoiceStatusLabel('OPEN')).not.toBe('未收款');
  });

  it('keeps other AP invoice statuses readable', () => {
    expect(getApInvoiceStatusLabel('PARTIALLY_PAID')).toBe('部分付款');
    expect(getApInvoiceStatusLabel('PAID')).toBe('已付清');
    expect(getApInvoiceStatusLabel('DISPUTED')).toBe('争议中');
    expect(getApInvoiceStatusLabel('CANCELLED')).toBe('已取消');
  });

  it('delegates to page i18n when a translation function is provided', () => {
    expect(getApInvoiceStatusLabel('OPEN', (key, fallback) => `${key}:${fallback}`))
      .toBe('fin2.ap.status_open:未付款');
  });

  it('falls back safely for unknown or empty status values', () => {
    expect(getApInvoiceStatusLabel('CUSTOM_STATUS')).toBe('CUSTOM_STATUS');
    expect(getApInvoiceStatusLabel('')).toBe('—');
    expect(getApInvoiceStatusLabel(null)).toBe('—');
  });
});
