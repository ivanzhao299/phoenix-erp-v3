export type ProductionQueueAction = 'LEGACY_TEMP_INBOUND' | 'FORMAL_INSTALLMENTS' | 'FORMAL_RAW';

export interface ProductionQueueRange {
  action: ProductionQueueAction;
  companyCode: string;
  siteCode: string;
  houseCode: string;
  eggDate: string;
  sourceBatchCode?: string;
}

export function productionQueueRange(params: Pick<URLSearchParams, 'get'>): ProductionQueueRange | null {
  const action = params.get('queueAction');
  if (action !== 'LEGACY_TEMP_INBOUND' && action !== 'FORMAL_INSTALLMENTS' && action !== 'FORMAL_RAW') return null;
  const companyCode = params.get('companyCode') ?? '';
  const siteCode = params.get('siteCode') ?? '';
  const houseCode = params.get('houseCode') ?? '';
  const eggDate = params.get('eggDate') ?? '';
  const sourceBatchCode = params.get('sourceBatchCode') ?? '';
  const validCode = (code: string) => /^[A-Za-z0-9_.-]{1,100}$/.test(code);
  if (![companyCode, siteCode, houseCode].every(validCode) || (action === 'FORMAL_RAW' && !validCode(sourceBatchCode))) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eggDate) || !Number.isFinite(Date.parse(eggDate))
    || new Date(eggDate).toISOString().slice(0, 10) !== eggDate) return null;
  return {action, companyCode, siteCode, houseCode, eggDate, ...(action === 'FORMAL_RAW' ? {sourceBatchCode} : {})};
}

export function queueProductionHref(href: string | null | undefined, action: string): string | undefined {
  if (!href || !href.startsWith('/breeding/') || href.includes('#')) return undefined;
  const [path, query, extra] = href.split('?');
  if (extra !== undefined || query === undefined) return undefined;
  const source = productionQueueRange(new URLSearchParams(query));
  if (!source || source.action !== action) return undefined;
  const target = action === 'LEGACY_TEMP_INBOUND' ? '/breeding/daily-inbound' : '/breeding/production-inbound';
  if (path !== target) return undefined;
  const params = new URLSearchParams({
    queueAction: source.action, companyCode: source.companyCode, siteCode: source.siteCode,
    houseCode: source.houseCode, eggDate: source.eggDate,
  });
  if (source.sourceBatchCode) params.set('sourceBatchCode', source.sourceBatchCode);
  return `${target}?${params}`;
}
