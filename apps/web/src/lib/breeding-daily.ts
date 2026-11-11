export function isDailyReportHouseMissing(houseCode: string | null | undefined): boolean {
  return String(houseCode ?? '').trim().length === 0;
}

export interface DailyReportSubmissionRow {
  eggs?: unknown;
  deaths?: unknown;
  feedKg?: unknown;
  dirtyEggs?: unknown;
  brokenEggs?: unknown;
  waterL?: unknown;
  gradeQty?: Record<string, unknown> | null;
}

export function gradeQuantityTotal(gradeQty: Record<string, unknown> | null | undefined): number {
  return Object.values(gradeQty || {}).reduce((sum: number, value) => {
    const quantity = Number(value);
    return sum + (quantity > 0 ? quantity : 0);
  }, 0);
}

export function hasDailyReportInput(row: DailyReportSubmissionRow): boolean {
  return Boolean(
    row.eggs || row.deaths || row.feedKg || row.dirtyEggs || row.brokenEggs || row.waterL
      || gradeQuantityTotal(row.gradeQty) > 0,
  );
}

export function dailyReportEggTotal(value: unknown, hasGradeData: boolean): number | undefined {
  if (hasGradeData && String(value ?? '').trim() === '') return undefined;
  return Number(value) || 0;
}

export function dailyReportInboundIdempotencyKey(logDate: unknown, houseCode: unknown): string | undefined {
  const date = String(logDate ?? '').trim();
  const house = String(houseCode ?? '').trim();
  if (!date || !house) return undefined;
  let hash = 2166136261;
  for (const char of `${date}\u0000${house}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `DAILY-${date}-${house.slice(0, 24)}-${(hash >>> 0).toString(16)}`.slice(0, 64);
}

const FALLBACK_CULLING_REASON_LABELS: Record<string, string> = {
  LOW_PRODUCTION: '产蛋率低',
  SICKNESS: '患病',
  AGE: '老龄',
  INJURY: '严重外伤',
  OTHER: '其它',
};

export function cullingReasonLabel(
  value: unknown,
  dictCodeMap: Record<string, string> = {},
  emptyLabel = '—',
): string {
  const code = String(value ?? '').trim();
  if (!code) return emptyLabel;
  return dictCodeMap[code] || FALLBACK_CULLING_REASON_LABELS[code] || code;
}
