import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatMasterData } from '@/lib/business-display';
import {
  formatPurchaseRequestCompany,
  formatPurchaseRequestProject,
  formatPurchaseRequester,
} from '@/app/(admin)/procurement2/requests/purchase-request-display';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('three-page display defect regressions', () => {
  it('formats purchase canonical names, snapshot fallback, code fallback, and requester account', () => {
    expect(formatPurchaseRequestCompany({ companyCode: 'C1', companyDisplayName: 'Canonical Co' }, 'en')).toBe('Canonical Co（C1）');
    expect(formatPurchaseRequestProject({ companyCode: 'C1', projectCode: 'P1', projectName: 'Snapshot Project' }, 'lo')).toBe('Snapshot Project（P1）');
    expect(formatPurchaseRequestProject({ companyCode: 'C1', projectCode: 'P2' }, 'zh')).toBe('P2');
    expect(formatPurchaseRequester({ companyCode: 'C1', requesterRealName: 'Alice', requesterUsername: 'alice' })).toBe('Alice（alice）');
    expect(formatPurchaseRequester({ companyCode: 'C1', requesterName: 'Old Snapshot', requesterUsername: 'alice' })).toBe('alice');
  });

  it('selects SKU and warehouse names by locale while retaining codes and single-name zone/location', () => {
    const row = { sku_name: '鸡蛋', sku_name_zh: '鸡蛋', sku_name_en: 'Eggs', sku_name_lo: 'ໄຂ່', warehouse_name_zh: '销售仓', warehouse_name_en: 'Sales WH', warehouse_name_lo: 'ສາງຂາຍ', zone_name: 'A区', location_name: 'A-01' };
    expect(formatMasterData(row, 'sku_name', 'SKU-1', 'zh')).toBe('鸡蛋（SKU-1）');
    expect(formatMasterData(row, 'sku_name', 'SKU-1', 'en')).toBe('Eggs（SKU-1）');
    expect(formatMasterData(row, 'sku_name', 'SKU-1', 'lo')).toBe('ໄຂ່（SKU-1）');
    expect(formatMasterData(row, 'warehouse_name', 'WH-1', 'lo')).toBe('ສາງຂາຍ（WH-1）');
    expect(formatMasterData(row, 'zone_name', 'Z-A', 'en')).toBe('A区（Z-A）');
    expect(formatMasterData(row, 'location_name', 'L-1', 'lo')).toBe('A-01（L-1）');
  });

  it('locks both pages to shared formatters instead of naked codes', () => {
    const purchase = read('src/app/(admin)/procurement2/requests/page.tsx');
    const store = read('src/app/(admin)/store/inventory/page.tsx');
    expect(purchase).toContain('formatPurchaseRequestCompany(row, lang)');
    expect(purchase).toContain('formatPurchaseRequester(row)');
    expect(store).toContain("'sku_name',r.sku_code");
    expect(store).toContain("formatMasterData(r,'warehouse_name'");
  });

  it('locks responsive page classes, local overflow, mobile cards, and no inline media breakpoint', () => {
    const page = read('src/app/(admin)/sales2/inventory/page.tsx');
    const css = read('src/app/(admin)/sales2/inventory/inventory.module.css');
    expect(page).toContain('styles.mobileCards');
    expect(page).toContain('styles.tableScroll');
    expect(page).not.toMatch(/style=\{\{[^}]*@media/);
    expect(css).toMatch(/@media \(min-width: 769px\) and \(max-width: 1199px\)/);
    expect(css).toMatch(/@media \(max-width: 768px\)/);
    expect(css).toMatch(/@media \(max-width: 390px\)/);
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('.mobileCards { display: none; }');
  });
});
