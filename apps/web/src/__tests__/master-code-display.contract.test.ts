import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { masterNameMap, masterDisplayLabel } from '@/lib/master-display';

const cases = [
  ['analytics/inventory', 'house_code'], ['analytics/feed', 'supplier_code'],
  ['breeding/device-alerts', 'farm_code'], ['breeding/device', 'erp_house_code'], ['breeding/henreport', 'house_code'],
  ['breeding/immune', 'houseCode'], ['breeding/med-stock', 'house_code'],
  ['breeding/medicine', 'house'], ['breeding', 'houseCode'],
  ['finance2/ar', 'company_code'], ['finance2/ar', 'project_code'],
  ['finance2/ap', 'company_code'], ['finance2/ap', 'project_code'],
  ['finance2/reports', 'companyCode'], ['packaging/inbound', 'house'],
  ['packaging/inbound', 'warehouse'], ['packaging', 'house_code'],
  ['quality/backward', 'warehouse_name'], ['quality/backward', 'location_name'],
  ['quality/farm', 'house'], ['quality/forward', 'customer_code'], ['quality/product', 'sku'],
  ['sales2/orders', 'fulfillment_warehouse_code'], ['sales2/delivery', 'fulfillment_warehouse_code'],
  ['sales2/delivery', 'company_code'], ['sales2/pricing', 'customer_code'],
  ['sales2/pricing', 'company_code'], ['store/losses', 'store'], ['store/losses', 'sku'],
  ['store', 'store_code'], ['warehouse/loss-report', 'warehouse_name'], ['warehouse/loss-report', 'zone'],
] as const;

describe('same-class business master display contracts', () => {
  it.each(cases)('%s binds %s to an authoritative name/code formatter', (page, field) => {
    const source = ts.createSourceFile(page, readFileSync(join(process.cwd(), 'src/app/(admin)', page, 'page.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const calls: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ['formatMasterData', 'masterDisplayLabel'].includes(node.expression.getText(source))) calls.push(node.getText(source));
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(calls.some(call => call.includes(field))).toBe(true);
  });
  it('binds the loss-ranking SKU badge to the bulk business master map and active locale', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(admin)/sales2/inventory/page.tsx'), 'utf8');
    expect(page).toContain("row={skuNames.get(String(row.sku_code))} lang={lang}");
  });
  it('matches the real generic customer and inventory-item lookup contracts', () => {
    const customers = masterNameMap([{ code: 'C-1', name: '客户一' }], 'customer');
    const skus = masterNameMap([{ itemType: 'SKU', itemCode: 'SKU-1', skuCode: 'SKU-1', itemName: '鸡蛋一' }], 'sku');
    expect(masterDisplayLabel(customers, 'customer', 'C-1', 'lo')).toBe('客户一（C-1）');
    expect(masterDisplayLabel(skus, 'sku', 'SKU-1', 'en')).toBe('鸡蛋一（SKU-1）');
  });
});
