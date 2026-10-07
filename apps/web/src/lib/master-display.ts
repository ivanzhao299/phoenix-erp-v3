import { localizedMasterName, masterNameWithCode, type AppLanguage } from './localized-master-data';

export type MasterNames = Map<string, Record<string, unknown>>;

/** Normalize read-only lookup projections, retaining all real locale fields. */
export function masterNameMap(rows: Record<string, unknown>[], domain: string): MasterNames {
  return new Map(rows.map(raw => {
    const row: Record<string, unknown> = { ...raw };
    for (const [key, value] of Object.entries(raw)) {
      row[key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)] = value;
    }
    row[`${domain}_code`] = row[`${domain}_code`] ?? row.code;
    row[`${domain}_name`] = row[`${domain}_name`] ?? row.name;
    if (domain === 'sku') {
      row.sku_code = row.sku_code ?? row.item_code;
      row.sku_name = row.sku_name ?? row.item_name;
      for (const locale of ['zh', 'en', 'lo']) row[`sku_name_${locale}`] = row[`sku_name_${locale}`] ?? row[`item_name_${locale}`];
    }
    if (domain === 'company') row.company_name = row.company_name || row.org_name_cn || row.org_name;
    return [String(row[`${domain}_code`] ?? ''), row];
  }));
}

export function masterDisplayName(names: MasterNames, domain: string, code: unknown, lang: AppLanguage, snapshot?: object): string {
  const base = `${domain}_name`;
  const master = names.get(String(code ?? ''));
  const source = snapshot as Record<string, unknown> | undefined;
  const name = (row: Record<string, unknown> | undefined) => {
    const canonical = typeof row?.[base] === 'string' ? row[base] : '';
    // Restrict historical helper fallback to the current locale + canonical
    // source, rather than selecting another locale's optional translation.
    return localizedMasterName({ [base]: canonical, [`${base}_${lang}`]: row?.[`${base}_${lang}`] }, base, lang) || canonical.trim();
  };
  return name(master) || name(source);
}

export function masterDisplayLabel(names: MasterNames, domain: string, code: unknown, lang: AppLanguage, snapshot?: object): string {
  return masterNameWithCode(masterDisplayName(names, domain, code, lang, snapshot), String(code ?? '')) || '—';
}
