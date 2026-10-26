import * as fs from 'node:fs';
import * as path from 'node:path';
import { FarmEggService, EggLedgerEntry } from '../../farm/farm-egg.service';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('production localized-name API contracts', () => {
  it('aggregates analytics by code before joining real single-language names', () => {
    const source = read('src/modules/analytics/services/production-analytics.service.ts');
    expect(source).toContain('WITH aggregate_by_farm AS');
    expect(source).toContain('GROUP BY farm_code');
    expect(source).toContain('LEFT JOIN sys_organizations o ON o.org_code = a.farm_code');
    expect(source).toContain('WITH aggregate_by_house AS');
    expect(source).toContain('GROUP BY house_code');
    expect(source).toContain('LEFT JOIN brd_houses h ON h.house_code = a.house_code');
    expect(source).not.toContain('farm_name_en');
    expect(source).not.toContain('house_name_en');
  });

  it('keeps egg ledger output codes, real name projections and bound company scope', async () => {
    const rows: EggLedgerEntry[] = [{
      id: 1, log_date: '2026-10-10', change_type: 'TEMP_PRODUCTION_INBOUND',
      grade: 'GRADE_1', qty_change: 11, house_code: 'HOUSE-A', house_name: '鸡舍A',
      grade_name: '1号蛋', grade_name_en: 'Grade 1', grade_name_lo: 'ໄຂ່ຊັ້ນ 1',
      customer_no: null, note: null, operator: 'fixture', created_at: '2026-10-10T10:00:00Z',
    }];
    const query = jest.fn().mockResolvedValue(rows);
    const service = new FarmEggService({ query } as never, {
      get: jest.fn(() => ({ isGlobal: false, allowedCompanyCodes: ['COMP-A'] })),
    } as never);

    const result = await service.getLedger('2026-10-10', '2026-10-11');

    expect(query).toHaveBeenCalledWith(expect.any(String), ['2026-10-10', '2026-10-11', false, ['COMP-A']]);
    const sql = query.mock.calls[0][0] as string;
    const projection = sql.slice(0, sql.indexOf('FROM inv_ledger'));
    // Assert the executed output contract, allowing a computed house-code
    // projection while still requiring the actual house/master name columns.
    expect(projection).toMatch(/\bAS\s+grade\b/);
    expect(projection).toMatch(/\bAS\s+house_code\s*,\s*h\.house_name\b/);
    for (const column of ['grade_name', 'grade_name_en', 'grade_name_lo']) {
      expect(projection).toMatch(new RegExp(`\\bg\\.${column}\\b`));
    }
    expect(projection).not.toMatch(/\bh\.house_name_(?:en|lo)\b/);
    expect(sql).toContain('($3::boolean OR b.company_code = ANY($4::text[]))');
    expect(result).toEqual(rows);
  });

  it('aggregates packaging grade quantities before its master-data join', () => {
    const source = read('src/modules/terminal/packaging.service.ts');
    expect(source).toContain('WITH aggregate_by_grade AS');
    expect(source).toContain('GROUP BY gr.key');
    expect(source).toContain('LEFT JOIN product_grades g ON g.grade_code = a.grade');
    expect(source).toContain('dict_label_en AS label_en');
  });
});
