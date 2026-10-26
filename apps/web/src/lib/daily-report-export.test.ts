import { describe, expect, it, vi } from 'vitest';
import { dailyReportsCsv, fetchDailyExport, gradeQuantities, localDateOnly, reportGradeColumns } from './daily-report-export';
import type { ProductGrade } from '@/hooks/useProductGrades';
import zh from '@/locales/zh.json';
import en from '@/locales/en.json';
import lo from '@/locales/lo.json';

const grades = ['GRADE_1','GRADE_2','GRADE_3','GRADE_4','GRADE_5','DIRTY','CRACKED','BROKEN','DAMAGED'].map((grade_code, i) => ({ grade_code, grade_name: grade_code, sort_order: i })) as ProductGrade[];
const date = '2026-10-16';
describe('daily report export', () => {
  it('retains nine real quantities, missing versus zero and historical codes without synthesizing totals', () => {
    const values = { GRADE_1: 0, GRADE_2: '22', BROKEN: 8, OLD_GRADE: 3, BAD: -2, EMPTY: '', NULL: null };
    expect(gradeQuantities(JSON.stringify(values))).toEqual({ GRADE_1: 0, GRADE_2: 22, BROKEN: 8, OLD_GRADE: 3 });
    expect(gradeQuantities('broken json')).toEqual({});
    expect(reportGradeColumns(grades, [values]).map(g => g.code)).toEqual([...grades.map(g => g.grade_code), 'OLD_GRADE']);
    const csv = dailyReportsCsv([{ eggs_produced: 999, eggs_by_grade: values, mortality_qty: 2, elimination_qty: 3 }], [{ key: 'eggs_produced', label: 'Total' }, ...grades.map(g => ({ key: `grade:${g.grade_code}`, label: g.grade_code })), { key: 'mortality_qty', label: 'Deaths' }, { key: 'elimination_qty', label: 'Cull' }]);
    expect(csv.split('\r\n')[1]).toBe('"999","0","22","","","","","","8","","2","3"');
  });
  it('escapes CSV values and spreadsheet formula injection with UTF8 BOM and CRLF', () => {
    const csv = dailyReportsCsv([{ note: 'a,"b"\nnext', house: ' =HYPERLINK("x")' }], [{ key: 'note', label: 'Note' }, { key: 'house', label: 'House' }]);
    expect(csv).toBe('\uFEFF"Note","House"\r\n"a,""b""\nnext","\' =HYPERLINK(""x"")"');
  });
  it('uses local calendar components around timezone midnight without UTC conversion', () => {
    const fixture = { getFullYear: () => 2026, getMonth: () => 9, getDate: () => 17, toISOString: () => '2026-10-16T16:00:00.000Z' } as Date;
    expect(localDateOnly(fixture)).toBe('2026-10-17');
  });
  it('exports the full snapshot beyond the visible page in one request', async () => {
    const getRows = vi.fn(async () => Array.from({ length: 1007 }, (_, i) => ({ id: i + 1, log_date: date })));
    const rows = await fetchDailyExport(date, '', getRows);
    expect(rows).toHaveLength(1007); expect(getRows).toHaveBeenCalledOnce();
    const query = getRows.mock.calls[0] as unknown as [URLSearchParams];
    expect(query[0].has('house_code')).toBe(false); expect(query[0].has('offset')).toBe(false);
  });
  it('refuses oversized or malformed snapshots instead of downloading incomplete data', async () => {
    await expect(fetchDailyExport(date, '', async () => Array.from({ length: 20001 }, (_, i) => ({ id: i + 1, log_date: date })))).rejects.toThrow('EXPORT_TOO_LARGE');
    await expect(fetchDailyExport(date, '', async () => [{ id: 1, log_date: date }, { id: 1, log_date: date }])).rejects.toThrow('INVALID_EXPORT_RESPONSE');
    await expect(fetchDailyExport(date, '', async () => [{ id: 1, log_date: '2026-10-17' }])).rejects.toThrow('INVALID_EXPORT_RESPONSE');
    await expect(fetchDailyExport(date, '', async () => { throw Error('403'); })).rejects.toThrow('403');
    expect(await fetchDailyExport(date, '', async () => [])).toEqual([]);
  });
  it('provides every new label and grade in all three locales', () => {
    for (const key of Object.keys(zh).filter(k => k.startsWith('breeding.daily.export') || k.startsWith('breeding.daily.grade'))) for (const locale of [zh, en, lo]) expect((locale as Record<string, string>)[key]).toBeTruthy();
  });
});
