import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('procurement P2 localized display', () => {
  it('uses real master names with snapshot fallbacks and keeps codes', () => {
    const orders = read('src/app/(admin)/procurement2/orders/page.tsx');
    expect(orders).toContain('supplierMasterName || row.supplierName');
    expect(orders).toContain("'supplierMasterName', row.supplierCode, lang");
    expect(orders).toContain('it.material_name || it.itemName');
    expect(read('src/app/(admin)/procurement2/requests/page.tsx')).toContain('it.material_name || it.itemName');
  });

  it('formats receipt warehouse/SKU, dashboard supplier, and supplier country/currency', () => {
    const receipts = read('src/app/(admin)/procurement2/receipts/page.tsx');
    expect(receipts).toContain("formatMasterData(row, 'warehouse_name', row.warehouseCode, lang)");
    expect(receipts).toContain("'sku_name', item.itemCode, lang");
    expect(read('src/app/(admin)/procurement2/dashboard/page.tsx')).toContain("formatMasterData(r, 'supplierName', r.supplierCode, lang)");
    const suppliers = read('src/app/(admin)/procurement2/suppliers/page.tsx');
    expect(suppliers).toContain('countryMap[row.countryCode]');
    expect(suppliers).toContain('currencyMap[row.defaultCurrency]');
  });

  it('loads dictionary labels for the current locale without fabricating labels', () => {
    const hook = read('src/hooks/useDictOptions.ts');
    expect(hook).toContain('entry[`dict_label_${lang}`]');
    expect(hook).toContain('entry.dict_label_zh || entry.dict_label_en || entry.dict_label_lo');
  });
});
