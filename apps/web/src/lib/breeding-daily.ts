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

/** Sum positive 9-grade quantities; blank and zero entries do not count as input. */
export function gradeQuantityTotal(gradeQty: Record<string, unknown> | null | undefined): number {
  return Object.values(gradeQty || {}).reduce((sum: number, value) => {
    const quantity = Number(value);
    return sum + (quantity > 0 ? quantity : 0);
  }, 0);
}

/** A row is submittable when it has a regular daily value or a positive grade breakdown. */
export function hasDailyReportInput(row: DailyReportSubmissionRow): boolean {
  return Boolean(
    row.eggs || row.deaths || row.feedKg || row.dirtyEggs || row.brokenEggs || row.waterL
      || gradeQuantityTotal(row.gradeQty) > 0,
  );
}

/** Preserve an explicit total, but let the API derive it from grades when blank. */
export function dailyReportEggTotal(value: unknown, hasGradeData: boolean): number | undefined {
  if (hasGradeData && String(value ?? '').trim() === '') return undefined;
  return Number(value) || 0;
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
