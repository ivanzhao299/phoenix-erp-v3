import type { ProductGrade } from '@/hooks/useProductGrades';

export type DailyExportRow = Record<string, unknown>;
export const DAILY_EXPORT_MAX_ROWS = 20000;

/** Business dates are calendar dates, never UTC timestamps. */
export function localDateOnly(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function gradeQuantities(value: unknown): Record<string, number> {
  if (typeof value === 'string') {
    try { return gradeQuantities(JSON.parse(value)); } catch { return {}; }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, qty]) =>
    (typeof qty === 'number' || typeof qty === 'string') && String(qty).trim() !== ''
    && Number.isFinite(Number(qty)) && Number(qty) >= 0,
  ).map(([code, qty]) => [code, Number(qty)]));
}

/** Retain historical codes absent from today's ACTIVE master without inferring counts. */
export function reportGradeColumns(grades: ProductGrade[], values: unknown[]): { code: string; grade?: ProductGrade }[] {
  const columns: { code: string; grade?: ProductGrade }[] = grades.map(grade => ({ code: grade.grade_code, grade }));
  const seen = new Set(columns.map(g => g.code));
  for (const value of values) for (const code of Object.keys(gradeQuantities(value))) {
    if (!seen.has(code)) { columns.push({ code }); seen.add(code); }
  }
  return columns;
}

/** Escape commas/newlines/quotes and spreadsheet formula prefixes in user text. */
export function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function dailyReportsCsv(rows: DailyExportRow[], columns: { key: string; label: string }[]): string {
  return '\uFEFF' + [columns.map(c => c.label), ...rows.map(row => columns.map(c =>
    c.key.startsWith('grade:') ? (gradeQuantities(row.eggs_by_grade)[c.key.slice(6)] ?? '') : (row[c.key] ?? ''),
  ))].map(row => row.map(csvCell).join(',')).join('\r\n');
}

/** One server-authorized SQL snapshot; refuse overflow rather than truncate. */
export async function fetchDailyExport(
  date: string,
  house: string,
  getRows: (query: URLSearchParams) => Promise<DailyExportRow[]>,
  onProgress: (count: number) => void = () => {},
): Promise<DailyExportRow[]> {
  const query = new URLSearchParams({ log_date: date });
  if (house) query.set('house_code', house);
  const result = await getRows(query);
  if (!Array.isArray(result)) throw new Error('INVALID_EXPORT_RESPONSE');
  if (result.length > DAILY_EXPORT_MAX_ROWS) throw new Error('EXPORT_TOO_LARGE');
  const ids = new Set<string>();
  for (const row of result) {
    if (String(row.log_date).slice(0, 10) !== date) throw new Error('INVALID_EXPORT_RESPONSE');
    const id = String(row.id ?? '');
    if (!id || ids.has(id)) throw new Error('INVALID_EXPORT_RESPONSE');
    ids.add(id);
  }
  onProgress(result.length);
  return result.sort((a, b) => String(a.log_date).localeCompare(String(b.log_date)) || Number(a.id) - Number(b.id));
}
