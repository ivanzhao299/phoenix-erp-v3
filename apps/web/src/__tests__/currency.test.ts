import { describe, it, expect } from 'vitest';
import { currencySymbol, formatMoney } from '@/lib/currency';

/**
 * 货币符号与金额格式化。
 * 关键约定：未知币种绝不默认贴 ¥，回退到币种代码文本（避免多币种账户符号错误）。
 */

describe('currencySymbol', () => {
  it('maps known currencies to their symbols', () => {
    expect(currencySymbol('CNY')).toBe('¥');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('THB')).toBe('฿');
    expect(currencySymbol('LAK')).toBe('₭');
  });

  it('is case-insensitive', () => {
    expect(currencySymbol('usd')).toBe('$');
  });

  it('edge: unknown currency falls back to the code text, NOT ¥', () => {
    expect(currencySymbol('XXX')).toBe('XXX ');
    expect(currencySymbol('XXX')).not.toBe('¥');
  });

  it('edge: empty / null / undefined yield empty string', () => {
    expect(currencySymbol('')).toBe('');
    expect(currencySymbol(null)).toBe('');
    expect(currencySymbol(undefined)).toBe('');
  });
});

describe('formatMoney', () => {
  it('formats a number with the currency symbol and 2 decimals', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('defaults to CNY when no currency given', () => {
    expect(formatMoney(10)).toBe('¥10.00');
  });

  it('accepts numeric strings', () => {
    expect(formatMoney('2000', 'CNY')).toBe('¥2,000.00');
  });

  it('edge: null / empty value renders the em-dash placeholder', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney('')).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('unknown currency uses code-text prefix instead of ¥', () => {
    expect(formatMoney(5, 'XXX')).toBe('XXX 5.00');
  });
});
