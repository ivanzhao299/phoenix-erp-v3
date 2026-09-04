import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const page = (name: string) => readFileSync(resolve(process.cwd(), `src/app/(admin)/master-data/${name}/page.tsx`), 'utf8');

describe('nine-page master-data display contract', () => {
  it.each(['projects', 'customers', 'warehouses', 'stores', 'drivers', 'vehicles', 'cash-accounts', 'bank-accounts'])(
    '%s explicitly declares canonical company display',
    (name) => expect(page(name)).toMatch(/key:\s*["']company_code["'][^}]*displayKind:\s*["']company["']/),
  );

  it.each([
    ['projects', 'projectType'],
    ['cash-accounts', 'cashAccountType'],
    ['vehicles', 'vehicleType'],
  ])('%s explicitly declares its locale type domain', (name, domain) => {
    expect(page(name)).toContain(`displayKind: "${domain}"`);
  });

  it('uses independent governed dictionaries for supplier and warehouse domains', () => {
    const supplierFields = readFileSync(resolve(process.cwd(), 'src/app/(admin)/master-data/suppliers/_fields.ts'), 'utf8');
    expect(supplierFields).toContain('dictType: "SUPPLIER_SUPPLY_CATEGORY"');
    expect(supplierFields).toContain('dictType: "SUPPLIER_SOURCING_TYPE"');
    expect(page('warehouses')).toContain('dictType: "WMS_WAREHOUSE_USAGE_TYPE"');
    expect(page('warehouses')).toContain('dictType: "WMS_WAREHOUSE_FACILITY_CLASS"');
  });

  it('locks the driver runtime page to driver_code', () => {
    expect(page('drivers')).toContain('codeKey="driver_code"');
    expect(page('drivers')).not.toContain('codeKey="driver_name"');
  });
});
