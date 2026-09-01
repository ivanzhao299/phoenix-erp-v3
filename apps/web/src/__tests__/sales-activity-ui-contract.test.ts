import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ordersPage = fs.readFileSync(path.resolve(process.cwd(), 'src/app/(admin)/sales2/orders/page.tsx'), 'utf8');
const posPage = fs.readFileSync(path.resolve(process.cwd(), 'src/app/(admin)/store-pos/page.tsx'), 'utf8');

describe('sales activity UI contract', () => {
  it('uses the facade availableSources for source tabs', () => {
    expect(ordersPage).toContain('/api/v2/sales/activity?');
    expect(ordersPage).toContain('setAvailableSources');
    expect(ordersPage).toContain("availableSources.includes(value)");
    expect(ordersPage).toContain('role="tablist"');
  });

  it('keys rows by source identity and gates every order mutation', () => {
    expect(ordersPage).toContain('key={`${o.sourceType}:${o.sourceId}`}');
    expect(ordersPage).toContain("const isOrder = o.sourceType === 'ORDER'");
    expect(ordersPage).toMatch(/isOrder && o\.status === 'DRAFT'[\s\S]*doAction\(o\.sourceId, 'submit'\)/);
    expect(ordersPage).toMatch(/isOrder && \['DRAFT'[\s\S]*doAction\(o\.sourceId, 'cancel'\)/);
  });

  it('opens POS rows through the scoped store POS detail deep link', () => {
    expect(ordersPage).toContain('window.location.assign(o.detailHref)');
    expect(posPage).toContain("searchParams.get('saleId')");
    expect(posPage).toContain("searchParams.get('storeCode')");
    expect(posPage).toContain('linkedStoreCode !== storeCode');
    expect(posPage).toContain('void openDetail(saleId)');
  });
});
