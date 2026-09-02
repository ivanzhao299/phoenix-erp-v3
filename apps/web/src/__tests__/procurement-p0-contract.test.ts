import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

describe('procurement P0 contracts', () => {
  it('uses PRC_PURCHASE_TYPE as the list filter and formatter source', () => {
    for (const page of ['requests', 'orders']) {
      const source = read(`src/app/(admin)/procurement2/${page}/page.tsx`);
      expect(source).toContain("useDictOptions('PRC_PURCHASE_TYPE')");
      expect(source).toContain('dictPurchaseTypes.length ? dictPurchaseTypes');
    }
  });

  it('centralizes shipment and supplier labels while preserving code values', () => {
    expect(read('src/app/(admin)/procurement2/shipments/page.tsx')).toContain("formatBusinessEnum('procurementShipmentStatus'");
    expect(read('src/app/(admin)/procurement2/suppliers/page.tsx')).toContain("formatBusinessEnum('procurementSupplierScope'");
  });

  it('does not claim all dashboard amounts are CNY', () => {
    const source = read('src/app/(admin)/procurement2/dashboard/page.tsx');
    expect(source).not.toContain('应付余额 (CNY)');
    expect(source).not.toContain('已付金额 (CNY)');
    expect(source).toContain('应付余额（原币合计）');
    expect(source).toContain('已付金额（本位币）');
  });
});
