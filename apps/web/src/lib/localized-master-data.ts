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
  return localized(lang || 'zh') || localized('zh') || localized('en') || localized('lo') || value(base);
}

export function masterNameWithCode(name: string | null | undefined, code: string | null | undefined): string {
  const cleanName = String(name ?? '').trim();
  const cleanCode = String(code ?? '').trim();
  if (!cleanName) return cleanCode;
  if (!cleanCode || cleanName === cleanCode) return cleanName;
  return `${cleanName}（${cleanCode}）`;
}
