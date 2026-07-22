export type CapitalAccountingClass = 'EQUITY' | 'DEBT_OR_ADVANCE' | 'MANUAL_REVIEW';

const DEBT_SOURCE_TYPES = new Set(['SHAREHOLDER_ADVANCE', 'GOODS_PAYMENT', 'PERSONAL_PAYMENT']);
const EQUITY_SOURCE_TYPES = new Set([
  'BANK_TRANSFER', 'CASH', 'DIVIDEND_OFFSET', 'YANTAI_DIVIDEND_OFFSET',
  'XINGCHI_DIVIDEND_OFFSET', 'EQUIPMENT_INVESTMENT', 'LAND_INVESTMENT',
  'CAPITAL_SUMMARY_IMPORT',
]);

export function classifyCapitalSource(sourceType?: string | null): CapitalAccountingClass {
  const normalized = String(sourceType || '').trim().toUpperCase();
  if (DEBT_SOURCE_TYPES.has(normalized)) return 'DEBT_OR_ADVANCE';
  if (EQUITY_SOURCE_TYPES.has(normalized)) return 'EQUITY';
  return 'MANUAL_REVIEW';
}

export function normalizePartyName(value?: string | null): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[（(][^）)]*(?:人民币|美元|基普|CNY|USD|LAK)[^）)]*[）)]/gi, '')
    .replace(/[·•\s_\-—,，.。()（）]/g, '')
    .replace(/先生|女士|股东|投资人|总$/g, '')
    .toLowerCase();
}

export function namesLikelyMatch(left?: string | null, right?: string | null): boolean {
  const a = normalizePartyName(left);
  const b = normalizePartyName(right);
  return !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 2 && (a.includes(b) || b.includes(a))));
}

export function toAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function pickPath(source: unknown, ...paths: string[]): unknown {
  if (!source || typeof source !== 'object') return undefined;
  for (const path of paths) {
    let current: unknown = source;
    for (const segment of path.split('.')) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    if (current !== undefined && current !== null && current !== '') return current;
  }
  return undefined;
}

export function shareholderSubjectCode(source: unknown): string {
  const value = pickPath(
    source, 'subjectCode', 'subject_code', 'accountCode', 'code',
    'glAccount.code', 'glAccount.subjectCode', 'account.code',
  );
  return String(value || '').trim();
}

export function shareholderSubjectName(source: unknown): string {
  const value = pickPath(
    source, 'subjectName', 'subject_name', 'accountName', 'name',
    'glAccount.name', 'glAccount.subjectName', 'account.name',
  );
  return String(value || '').trim();
}

export function isPaidInCapitalSubject(source: unknown): boolean {
  const code = shareholderSubjectCode(source).replace(/\D/g, '');
  const name = shareholderSubjectName(source);
  return code.startsWith('4001') || name.includes('实收资本') || name.includes('股本');
}

export function endingBaseAmount(source: unknown, fallback: unknown = 0): number {
  return toAmount(pickPath(
    source, 'baseEndingBalance', 'baseBalance', 'endingBalanceBase',
    'endingBalance', 'balance', 'endBalance',
  ) ?? fallback);
}

export function scoreVoucherCandidate(input: {
  contributionAmount: number;
  contributionDate?: string | null;
  shareholderName?: string | null;
  lineAmount: number;
  voucherDate?: string | null;
  subjectName?: string | null;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const amountDiff = Math.abs(roundMoney(input.contributionAmount - input.lineAmount));
  if (amountDiff <= 0.01) {
    score += 55;
    reasons.push('本位币金额一致');
  } else if (amountDiff <= Math.max(1, Math.abs(input.contributionAmount) * 0.005)) {
    score += 30;
    reasons.push('金额在0.5%容差内');
  }
  if (namesLikelyMatch(input.shareholderName, input.subjectName)) {
    score += 30;
    reasons.push('股东名称与4001子科目一致');
  }
  if (input.contributionDate && input.voucherDate) {
    const days = Math.abs((Date.parse(input.contributionDate) - Date.parse(input.voucherDate)) / 86_400_000);
    if (Number.isFinite(days) && days <= 3) {
      score += 15;
      reasons.push('日期相差不超过3天');
    } else if (Number.isFinite(days) && days <= 31) {
      score += 8;
      reasons.push('日期位于同一对账窗口');
    }
  }
  return { score: Math.min(score, 100), reasons };
}
