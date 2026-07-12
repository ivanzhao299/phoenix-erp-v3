export interface BreedingOverviewTodayMetrics {
  eggs: number;
  mortality: number;
}

type DailyLogRow = Record<string, unknown>;

function isRecord(value: unknown): value is DailyLogRow {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function localDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dailyLogDateKey(value: unknown): string {
  if (value instanceof Date) return localDateString(value);
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    return match?.[1] || '';
  }
  if (typeof value === 'number') return localDateString(new Date(value));
  return '';
}

export function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function asDailyLogRows(payload: unknown): DailyLogRow[] {
  const data = isRecord(payload) ? payload.data : undefined;
  const rows = isRecord(data) ? data.rows ?? data.data : data;
  const fallbackRows = rows ?? (isRecord(payload) ? payload.rows : undefined) ?? payload;
  return Array.isArray(fallbackRows) ? fallbackRows.filter(isRecord) : [];
}

export function dailyLogRowDate(row: DailyLogRow): string {
  return dailyLogDateKey(row.log_date ?? row.business_date ?? row.date);
}

export function dailyLogMortalityTotal(row: DailyLogRow): number {
  return asNumber(row.mortality_qty) + asNumber(row.elimination_qty);
}

export function sumBreedingOverviewTodayMetrics(
  rows: DailyLogRow[],
  targetDate: string,
): BreedingOverviewTodayMetrics {
  return rows.reduce<BreedingOverviewTodayMetrics>((sum, row) => {
    if (dailyLogRowDate(row) !== targetDate) return sum;
    sum.eggs += asNumber(row.eggs_produced);
    sum.mortality += dailyLogMortalityTotal(row);
    return sum;
  }, { eggs: 0, mortality: 0 });
}
