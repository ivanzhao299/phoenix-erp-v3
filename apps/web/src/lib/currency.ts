// 货币符号统一来源（SYS_CURRENCY 字典 5 态：CNY/USD/THB/LAK/VND，另兼容 HKD/EUR）。
// Why：cash-accounts / finance2 / ar / ap 各自内联映射且缺币种 → 多币种账户(刘杰 USD/THB)
// 一律 fallback 成 ¥，符号显示错误。统一走此函数，缺失币种回退到币种代码文本而非乱贴符号。

const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  HKD: 'HK$',
  THB: '฿',
  LAK: '₭',
  VND: '₫',
  EUR: '€',
};

/** 取货币符号；未知币种回退到币种代码（如 'XXX '），绝不默认贴 ¥。 */
export function currencySymbol(code?: string | null): string {
  const c = (code || '').toUpperCase();
  return CURRENCY_SYMBOL[c] || (c ? `${c} ` : '');
}

/** 金额 + 货币符号（千分位 2 位小数）。 */
export function formatMoney(value: number | string | null | undefined, currency = 'CNY'): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return `${currencySymbol(currency)}${n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
