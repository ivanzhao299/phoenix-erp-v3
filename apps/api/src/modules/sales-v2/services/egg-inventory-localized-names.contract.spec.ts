import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('sales inventory localized-name read contract', () => {
  const source = readFileSync(join(__dirname, 'egg-inventory.service.ts'), 'utf8');

  it('adds real SKU, product, company, warehouse and location names without replacing codes', () => {
    expect(source).toContain('SELECT b.*');
    expect(source).toContain('sku.sku_code = b.sku_code');
    expect(source).toContain('p.product_code = b.product_code');
    expect(source).toContain("o.org_type = 'COMPANY'");
    expect(source).toContain('COALESCE(o.company_code, o.org_code) = b.company_code');
    expect(source).toContain('loc.location_code = b.location_code AND loc.warehouse_code = b.warehouse_code');
    expect(source).toContain('sku.sku_name_en');
    expect(source).toContain('p.product_name_en');
  });

  it('keeps filters and the list/allocator ordering contracts on stable fields', () => {
    expect(source).toContain('b.sku_code = $${pi++}');
    expect(source).toContain('b.product_code = $${pi++}');
    expect(source).toContain('ORDER BY expire_date ASC NULLS LAST, created_at ASC');
    expect(source).toContain('ORDER BY b.egg_date DESC NULLS LAST, b.batch_no DESC, b.id DESC');
    expect(source).toContain('ORDER BY b.expire_date ASC, b.batch_no ASC, b.id ASC');
  });
});
