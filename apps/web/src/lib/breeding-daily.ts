export function isDailyReportHouseMissing(houseCode: string | null | undefined): boolean {
  return String(houseCode ?? '').trim().length === 0;
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
