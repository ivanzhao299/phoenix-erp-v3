import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), 'src/app', path), 'utf8');

describe('PDA and sales inventory name display contracts', () => {
  it('uses shared formatters on all three terminal WMS pages', () => {
    for (const page of ['inbound', 'outbound', 'stocktake']) {
      const source = read(`(terminal)/terminal/wms/${page}/page.tsx`);
      expect(source).toContain('formatMasterData');
      expect(source).toContain('formatBusinessEnum');
    }
  });

  it('submits a location code selected from the shared location master', () => {
    const source = read('(terminal)/terminal/packaging/warehouse-handover/page.tsx');
    expect(source).toContain('<LocationSelector');
    expect(source).toContain('value={location}');
    expect(source).toContain('onChange={setLocation}');
    expect(source).toMatch(/confirmHandover\(\{[\s\S]*\blocation,/);
  });

  it('formats sales batch and expiring SKU, product and company names', () => {
    const source = read('(admin)/sales2/inventory/page.tsx');
    expect(source).toContain("'product_name', b.product_code, lang");
    expect(source).toContain("'company_name', b.company_code, lang");
    expect(source).toContain("row={b as unknown as Record<string, unknown>} lang={lang}");
  });
});
