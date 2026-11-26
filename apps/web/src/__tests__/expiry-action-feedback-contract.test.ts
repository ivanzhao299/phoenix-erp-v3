import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const warehouseRoot = join(process.cwd(),'src/app/(admin)/warehouse');
const source = readFileSync(join(warehouseRoot,'expiry/page.tsx'), 'utf8');
const outbound = readFileSync(join(warehouseRoot,'outbound/page.tsx'), 'utf8');

describe('expiry alert action feedback contract', () => {
  it('reads paged physical stock, displays its unit and provides a load error', () => {
    expect(source).toContain('/inventory/batches/query?');
    expect(source).toContain('{row.qty} {row.unit}');
    expect(source).toContain('role="alert"');
  });

  it('links to a normal outbound draft scoped to the current warehouse and batch', () => {
    expect(source).toContain('expiryBatch: row.batch_no, warehouse: row.warehouse_code');
    expect(source).not.toContain('crudApi.create');
    expect(outbound).toContain("batch_no: expiryBatch, warehouse_code: warehouse, expiry: 'UPCOMING'");
    expect(outbound).toContain('expiry_batch_no: row.batch_no');
  });
});
