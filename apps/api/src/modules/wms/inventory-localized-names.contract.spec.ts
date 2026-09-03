import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('inventory localized-name read contract', () => {
  const wms = readFileSync(join(__dirname, 'wms.service.ts'), 'utf8');
  const crud = readFileSync(join(__dirname, '../generic-crud/generic-crud.service.ts'), 'utf8');

  it('keeps batch codes and appends exact multilingual master-data columns', () => {
    expect(wms).toContain('SELECT b.*');
    expect(wms).toContain('w.warehouse_name_en');
    expect(wms).toContain('w.warehouse_name_lo');
    expect(wms).toContain('sku.sku_name_en');
    expect(wms).toContain('sku.sku_name_lo');
    expect(wms).toContain('sku.sku_code = b.sku_code');
    expect(wms).toContain('mat.material_code = b.material_code');
    expect(wms).toContain('prod.product_code = b.product_code');
  });

  it('uses an explicit table allowlist instead of guessing code columns', () => {
    expect(crud).toContain('const localizedReadSource: Record<string, string>');
    expect(crud).toContain('wms_locations:');
    expect(crud).toContain('inv_batches:');
    for (const table of ['wms_inbound', 'wms_outbound', 'wms_transfer', 'wms_stocktake', 'inv_ledger']) {
      expect(crud).toContain(`${table}:`);
    }
    for (const join of ['brd_houses', 'sal_customers', 'wms_warehouses dwh', 'mst_stores dest_store', 'sys_organizations dept', 'biz_projects project', 'sys_user receiver', 'prc2_suppliers supplier']) {
      expect(crud).toContain(`JOIN ${join}`);
    }
    expect(crud).toContain("WHEN 'OTHER' THEN base.destination_code");
    expect(crud).not.toContain('endsWith("_code")');
  });
});
