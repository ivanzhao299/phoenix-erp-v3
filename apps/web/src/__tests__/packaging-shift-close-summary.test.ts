import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(
  path.join(process.cwd(), 'src/app/(terminal)/terminal/packaging/shift-close/page.tsx'),
  'utf8',
);
const css = fs.readFileSync(
  path.join(process.cwd(), 'src/app/(terminal)/terminal/packaging/shift-close/shift-close.module.css'),
  'utf8',
);
const adminReportPage = fs.readFileSync(
  path.join(process.cwd(), 'src/app/(admin)/packaging/daily-report/page.tsx'),
  'utf8',
);

describe('BUG-20260722-0004 交班汇总', () => {
  it('按当前班次生产日期查询服务端汇总与分级记录', () => {
    expect(page).toContain('getShiftSummary(productionDate, shiftId)');
    expect(page).toContain('getActiveGrading(Number(shift?.id))');
    expect(page).toContain('Object.values(gradingOutputs).reduce');
  });

  it('按 product_grades 权威名称展示全部 ACTIVE 分级', () => {
    expect(page).toContain('useProductGrades()');
    expect(page).toContain('productGrades.map');
    expect(page).toContain('summary.gradingOutputs[grade.grade_code]');
    expect(page).not.toContain("t('ui.A大码'");
  });

  it('接口失败不伪装为全 0，并提供重试', () => {
    expect(page).toContain('role="alert"');
    expect(page).toContain('setReloadKey(key => key + 1)');
  });

  it('交班卡片在窄屏改为单列', () => {
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('grid-template-columns: 1fr');
  });

  it('PC 包装日报保留服务端分级产出并使用主数据名称', () => {
    expect(adminReportPage).toContain('item.gradingOutputs');
    expect(adminReportPage).toContain('item.shiftPackedEggs');
    expect(adminReportPage).toContain('productGrades.map');
    expect(adminReportPage).not.toContain('by_grade: []');
  });
});
