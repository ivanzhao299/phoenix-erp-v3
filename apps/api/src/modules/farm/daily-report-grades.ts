import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export type ReportGrades = Record<string, number>;

// All three persisted totals and downstream SQL casts use PostgreSQL integer.
export function normalizeReportGrades(input: unknown): ReportGrades {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('分级明细必须为数量对象');
  }
  let total = 0;
  const values = Object.entries(input).map(([grade, raw]) => {
    const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new BadRequestException(`${grade}分级数量必须为非负整数`);
    }
    total += value;
    if (total > 2147483647) throw new BadRequestException('分级总数量超过日报整数范围');
    return [grade, value] as const;
  });
  return Object.fromEntries(values);
}

/** Parse a JSONB value without allowing malformed historical rows to widen stock. */
export function normalizeGradeQuantityMap(value: unknown): ReportGrades {
  if (value == null) return {};
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); }
    catch { throw new BadRequestException('日报分级格式无效，请核对原单'); }
  }
  const grades = normalizeReportGrades(parsed);
  if (Object.keys(grades).some(grade => !grade || grade !== grade.trim())) {
    throw new BadRequestException('日报等级编码无效，请核对原单');
  }
  return grades;
}

export function sameReportGrades(left: unknown, right: unknown): boolean {
  function entries(map: unknown) {
    if (map == null) return null;
    const input = typeof map === 'string' ? JSON.parse(map) : map;
    return Object.entries(normalizeReportGrades(input)).sort(([a], [b]) => a.localeCompare(b));
  }
  return JSON.stringify(entries(left)) === JSON.stringify(entries(right));
}

export async function requiredReportGrades(manager: EntityManager): Promise<string[]> {
  const rows = await manager.query(`SELECT grade_code FROM product_grades p WHERE status='ACTIVE'
    AND COALESCE((to_jsonb(p)->>'stock_managed')::boolean,(to_jsonb(p)->>'is_storable')::boolean,true) FOR SHARE`);
  return rows.map((row: {grade_code:string}) => row.grade_code);
}

export function assertReportGradeCoverage(grades: ReportGrades, required: string[]) {
  if (!required.length || required.some(grade => !Object.prototype.hasOwnProperty.call(grades, grade))) {
    throw new BadRequestException('正式日报须明确填写全部库存分级；未产档位请明确填0，不得把未记录当成0');
  }
}

// Signed JSON is hashed verbatim. A stored numeric string is historical evidence,
// never silently converted into a new source claim.
export function assertStoredReportGrades(input: unknown): asserts input is ReportGrades {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || !Object.keys(input).length || Object.values(input).some(value => typeof value !== 'number')) {
    throw new ConflictException('日报分级不是已确认的整数明细，须核对原证据');
  }
  try { normalizeReportGrades(input); }
  catch { throw new ConflictException('日报分级数量超出有效范围，须核对原证据'); }
}

export async function assertNewHandoverGrades(manager: EntityManager, reports: {eggs_by_grade: ReportGrades}[]) {
  const required = await requiredReportGrades(manager);
  const catalog = await manager.query('SELECT grade_code FROM product_grades FOR SHARE');
  const known = new Set(catalog.map((r: {grade_code:string}) => r.grade_code));
  for (const {eggs_by_grade: grades} of reports) {
    if (!required.length || required.some(code => !Object.prototype.hasOwnProperty.call(grades, code))
        || Object.keys(grades).some(code => !known.has(code))) {
      throw new ConflictException('日报分级不完整或等级无法核对，请先核查原始单据');
    }
  }
}


export function storedGradeStatus(value: unknown): 'RECORDED' | 'REVIEW_REQUIRED' {
  try { assertStoredReportGrades(value); return 'RECORDED'; }
  catch { return 'REVIEW_REQUIRED'; }
}
