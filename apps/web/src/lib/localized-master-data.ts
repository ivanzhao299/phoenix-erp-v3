export type AppLanguage = 'zh' | 'en' | 'lo' | string;

function camelLocaleKey(base: string, lang: string) {
  return `${base}${lang.charAt(0).toUpperCase()}${lang.slice(1)}`;
}

/** Select a localized master-data name, accepting both snake_case and camelCase API rows. */
export function localizedMasterName(row: Record<string, unknown> | null | undefined, base: string, lang?: AppLanguage): string {
  if (!row) return '';
  const value = (key: string) => {
    const candidate = row[key];
    return candidate == null ? '' : String(candidate).trim();
  };
  const localized = (locale: string) => value(`${base}_${locale}`) || value(camelLocaleKey(base, locale));
  const requested = lang || 'zh';
  // Supplier and warehouse master names are user-facing locale contracts: a
  // supported locale must never silently show another locale's translation.
  // Other historical master-data consumers retain their established generic
  // fallback behavior (for example a single-language zone/location label).
  const strictLocale = base === 'supplier_name' || base === 'supplierName'
    || base === 'warehouse_name' || base === 'warehouseName';
  if (strictLocale) {
    if (requested === 'zh') return localized('zh') || value(base);
    if (requested === 'en' || requested === 'lo') return localized(requested);
    return localized('zh') || value(base);
  }
  if (requested === 'zh') return localized('zh') || value(base) || localized('en') || localized('lo');
  return localized(requested) || localized('zh') || value(base) || localized('en') || localized('lo');
}

export function masterNameWithCode(name: string | null | undefined, code: string | null | undefined): string {
  const cleanName = String(name ?? '').trim();
  const cleanCode = String(code ?? '').trim();
  if (!cleanName) return cleanCode;
  if (!cleanCode || cleanName === cleanCode) return cleanName;
  return `${cleanName}（${cleanCode}）`;
}
