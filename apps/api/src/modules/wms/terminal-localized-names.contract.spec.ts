import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('terminal WMS localized-name read contract', () => {
  const source = readFileSync(join(__dirname, 'wms.service.ts'), 'utf8');

  it('keeps inbound codes while joining warehouse and product names narrowly', () => {
    expect(source).toContain("this.warehouseScope('wi.warehouse_code'");
    expect(source).toContain('wh.warehouse_code = wi.warehouse_code');
    expect(source).toContain('p.product_code = ii.product_code');
    expect(source).toContain('ii.id AS line_no');
    expect(source).toContain('p.product_name_en');
    expect(source).toContain('p.product_name_lo');
  });

  it('keeps outbound codes while joining customer and product names narrowly', () => {
    expect(source).toContain("this.orderStoreScope('o.store_code'");
    expect(source).toContain('c.customer_no = o.customer_code');
    expect(source).toContain('p.product_code = oi.product_code');
    expect(source).toContain('c.customer_name_en');
    expect(source).toContain('c.customer_name_lo');
  });
});
