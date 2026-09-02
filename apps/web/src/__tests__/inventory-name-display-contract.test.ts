import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (file: string) => readFileSync(join(process.cwd(), 'src/app/(admin)/warehouse', file), 'utf8');

describe('inventory name-display source contracts', () => {
  it('keeps loss-report warehouse, zone, batch and item in distinct columns', () => {
    const source = read('loss-report/page.tsx');
    for (const key of ['key: "warehouse_code"', 'key: "zone_code"', 'key: "batch_no"', 'key: "item"']) expect(source).toContain(key);
    expect(source).not.toContain('title: t("ui.批次库区"');
  });

  it('does not merge expiry location into warehouse or duplicate the location store column', () => {
    const expiry = read('expiry/page.tsx');
    expect(expiry).not.toContain('warehouse_code || b.location_code');
    expect(expiry).toContain('warehouseLabel');
    expect(expiry).toContain('locationLabel');
    const locations = read('locations/page.tsx');
    expect((locations.match(/t\("ui\.站点编码"/g) ?? [])).toHaveLength(0);
  });

  it('formats the inventory-query item through the shared localized-name helper', () => {
    const query = read('query/page.tsx');
    expect(query).toContain('row.sku_code ? "sku_name" : "product_name"');
    expect(query).not.toContain('{row.material_code || row.sku_code || row.product_code || "—"}');
  });
});
