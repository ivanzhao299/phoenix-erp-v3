import * as fs from 'node:fs';
import * as path from 'node:path';

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

  it('keeps egg ledger codes and projects only real name columns', () => {
    const source = read('src/modules/farm/farm-egg.service.ts');
    expect(source).toContain('AS grade');
    expect(source).toContain('l.house_code, h.house_name');
    expect(source).toContain('g.grade_name, g.grade_name_en, g.grade_name_lo');
  });

  it('aggregates packaging grade quantities before its master-data join', () => {
    const source = read('src/modules/terminal/packaging.service.ts');
    expect(source).toContain('WITH aggregate_by_grade AS');
    expect(source).toContain('GROUP BY gr.key');
    expect(source).toContain('LEFT JOIN product_grades g ON g.grade_code = a.grade');
    expect(source).toContain('dict_label_en AS label_en');
  });
});
