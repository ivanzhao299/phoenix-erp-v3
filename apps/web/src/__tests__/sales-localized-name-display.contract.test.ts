import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (file: string) => readFileSync(join(process.cwd(), 'src/app/(admin)/sales2', file), 'utf8');

describe('sales localized-name display contracts', () => {
  it('uses the shared name and workflow formatters across C-group pages', () => {
    for (const file of ['orders/page.tsx', 'returns/page.tsx', 'delivery/page.tsx', 'reports/page.tsx', 'customers/page.tsx', 'pricing/page.tsx']) {
      expect(read(file)).toContain('formatMasterData');
    }
    expect(read('orders/page.tsx')).toContain('formatBusinessEnum');
    expect(read('returns/page.tsx')).toContain("formatBusinessEnum('restock'");
    expect(read('delivery/page.tsx')).toContain("formatBusinessEnum('delivery'");
  });

  it('labels all-history homepage delivery and loss metrics as cumulative', () => {
    const home = read('page.tsx');
    expect(home).toContain('累计配送');
    expect(home).toContain('累计损耗');
    expect(home).not.toContain('今日配送');
    expect(home).not.toContain('今日损耗');
  });

  it('preserves raw codes as formatter inputs instead of replacing write/filter values', () => {
    expect(read('returns/page.tsx')).toContain('item.sku_code ?? item.product_code');
    expect(read('customers/page.tsx')).toContain("row.channel_code, lang");
    expect(read('pricing/page.tsx')).toContain('row.sku_code ?? row.product_code');
  });
});
