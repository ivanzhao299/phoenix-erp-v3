export type ErpShareholderIdentity = { shareholderCode: string; shareholderName: string; paidInAmount?: number };

export type ShareholderMatch = {
  status: 'EXACT' | 'ALIAS' | 'SOURCE_ONLY' | 'CONFLICT';
  confidence: number;
  shareholderCode: string;
  shareholderName: string;
  reason: string;
};

const CURRENCY_SUFFIX = /[（(](?:人民币|老挝币|美元|欧元|港币|泰铢|RMB|CNY|LAK|USD|EUR|HKD|THB)[）)]/gi;
const GENERIC_NON_PERSON = /(直营店|门店|公司|集团|项目|投资款|资本公积|未分配)/;

export function normalizeShareholderAccountingName(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(CURRENCY_SUFFIX, '')
    .replace(/[\s·•.。,_，:：;；'"“”‘’\-—]/g, '')
    .trim()
    .toLowerCase();
}

export function matchChanjetShareholderName(
  sourceName: string,
  candidates: ErpShareholderIdentity[],
  sourceAmount?: number,
): ShareholderMatch {
  const normalizedSource = normalizeShareholderAccountingName(sourceName);
  if (!normalizedSource || GENERIC_NON_PERSON.test(normalizedSource)) {
    return { status: 'SOURCE_ONLY', confidence: 0, shareholderCode: '', shareholderName: '', reason: '非自然人股东科目或名称为空' };
  }

  const exact = candidates.filter((candidate) =>
    normalizeShareholderAccountingName(candidate.shareholderName) === normalizedSource);
  if (exact.length === 1) {
    return { status: 'EXACT', confidence: 100, ...exact[0], reason: '去除空白和币种后缀后名称唯一一致' };
  }
  if (exact.length > 1) {
    return { status: 'CONFLICT', confidence: 0, shareholderCode: '', shareholderName: '', reason: '同公司存在多个同名 ERP 股东' };
  }

  const title = normalizedSource.match(/^(.{1,2})总$/u);
  if (title) {
    const prefix = title[1];
    const aliases = candidates.filter((candidate) =>
      normalizeShareholderAccountingName(candidate.shareholderName).startsWith(prefix));
    if (aliases.length === 1) {
      return { status: 'ALIAS', confidence: 92, ...aliases[0], reason: `唯一称谓别名：${sourceName} → ${aliases[0].shareholderName}` };
    }
    if (aliases.length > 1) {
      const amountMatches = Number.isFinite(sourceAmount)
        ? aliases.filter((candidate) => Math.abs(Number(candidate.paidInAmount || 0) - Number(sourceAmount)) <= 0.01)
        : [];
      if (amountMatches.length === 1) {
        return {
          status: 'ALIAS', confidence: 98,
          shareholderCode: amountMatches[0].shareholderCode,
          shareholderName: amountMatches[0].shareholderName,
          reason: `称谓候选中本位币金额唯一一致：${sourceName} → ${amountMatches[0].shareholderName}`,
        };
      }
      return { status: 'CONFLICT', confidence: 0, shareholderCode: '', shareholderName: '', reason: `称谓别名 ${sourceName} 命中多个 ERP 股东` };
    }
  }

  return { status: 'SOURCE_ONLY', confidence: 0, shareholderCode: '', shareholderName: '', reason: '没有可证明的唯一 ERP 股东对应项' };
}
