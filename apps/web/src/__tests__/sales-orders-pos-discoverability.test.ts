import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('sales orders POS discoverability', () => {
  const ordersPage = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/(admin)/sales2/orders/page.tsx'),
    'utf8',
  );
  const sidebar = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/layout/Sidebar.tsx'),
    'utf8',
  );

  it('shows the POS entry only through the POS view permission gate', () => {
    expect(sidebar).toContain('label: "门店 POS 成交"');
    expect(sidebar).toMatch(/path: "\/store-pos"[\s\S]*?perm: "MENU_STORE_POS"/);
    expect(ordersPage).toContain("usePermission('MENU_STORE_POS')");
    expect(ordersPage).toContain('canViewStorePos && <Link href="/store-pos"');
  });

  it('explains that customer orders and POS sales are separate chains', () => {
    expect(ordersPage).toContain('客户订单与门店 POS 成交采用不同业务链路');
    expect(ordersPage).toContain('本页展示客户订单');
  });
});
