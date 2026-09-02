import * as fs from 'node:fs';
import * as path from 'node:path';

const read = (name: string) => fs.readFileSync(path.join(process.cwd(), 'src/modules/procurement-v2/services', name), 'utf8');

describe('procurement localized-name API contracts', () => {
  it('keeps supplier performance grouped by code/currency before joining names', () => {
    const source = read('dashboard.service.ts');
    expect(source).toContain('WITH aggregate_by_supplier AS');
    expect(source).toContain('GROUP BY po.supplier_code, po.currency_code');
    expect(source).toContain('LEFT JOIN prc2_suppliers s ON s.supplier_code = a.supplier_code');
    expect(source).toContain('supplierSnapshotName');
  });

  it('adds real multilingual master names without deleting snapshot fields', () => {
    const orders = read('orders.service.ts');
    expect(orders).toContain('supplierMasterNameEn');
    expect(orders).toContain('material_name_en');
    expect(orders).toContain('...po');
    expect(read('requests.service.ts')).toContain('material_name_lo');
    const receipts = read('receipts.service.ts');
    expect(receipts).toContain('warehouse_name_en');
    expect(receipts).toContain('sku_name_lo');
    expect(receipts).toContain('...rcp');
  });
});
