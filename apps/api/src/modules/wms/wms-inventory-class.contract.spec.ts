import * as fs from 'node:fs';
import * as path from 'node:path';

describe('WMS inventory-class contract', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'wms.service.ts'), 'utf8');

  it('writes broken receipt batches as BROKEN DEFECT_SALE available stock', () => {
    expect(source).toContain('INBOUND_BROKEN');
    expect(source).toContain('BROKEN');
    expect(source).toContain('inventory_class');
    expect(source).toMatch(/BROKEN[\s\S]{0,1200}inventory_class|inventory_class[\s\S]{0,1200}BROKEN/);
  });

  it('projects inventory_class in general inventory reads', () => {
    const method = source.slice(source.indexOf('async getInventoryBatches()'), source.indexOf('async getInventoryBatchesSummary()'));
    expect(method).toContain('b.inventory_class');
  });
});
