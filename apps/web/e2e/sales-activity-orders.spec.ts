import { expect, test, type Page, type Route } from '@playwright/test';

const ADMIN = { username: 'e2e-admin', name: 'E2E Admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };

async function authenticate(page: Page) {
  const payload = Buffer.from(JSON.stringify({ sub: ADMIN.username, ...ADMIN, exp: 4_102_444_800 })).toString('base64url');
  const token = `e30.${payload}.e2e`;
  await page.context().addCookies([{ name: 'phoenix_access_token', value: token, url: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000' }]);
  await page.addInitScript(({ authToken, user }) => {
    sessionStorage.setItem('phoenix_session_version', 'v6');
    sessionStorage.setItem('phoenix_token', authToken);
    sessionStorage.setItem('phoenix_user', JSON.stringify(user));
    localStorage.setItem('phoenix_token', authToken);
    localStorage.setItem('phoenix_user', JSON.stringify(user));
    localStorage.setItem('phoenix_lang', 'zh');
  }, { authToken: token, user: ADMIN });
}

const row = (sourceType: 'ORDER' | 'POS', sourceId: string, documentNo: string) => ({
  sourceType, sourceId, documentNo, companyCode: 'C1', storeCode: sourceType === 'POS' ? 'S1' : null,
  customerCode: 'CU1', customerName: 'E2E 客户', status: sourceType === 'POS' ? 'COMPLETED' : 'DRAFT',
  displayCategory: 'TEST', amount: 100, currency: 'CNY', businessDate: '2026-09-01',
  occurredAt: '2026-09-01T00:00:00Z',
  detailHref: sourceType === 'POS' ? `/store-pos?saleId=${sourceId}&storeCode=S1` : `/sales2/orders?orderId=${sourceId}`,
});

async function commonRoute(route: Route) {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/notifications/stream')) { await route.abort(); return true; }
  if (url.pathname.endsWith('/notifications/unread-count')) { await route.fulfill({ json: { count: 0 } }); return true; }
  if (url.pathname.endsWith('/online-users')) { await route.fulfill({ json: [] }); return true; }
  if (url.pathname.endsWith('/sales/customers') || url.pathname.endsWith('/product-master/skus')) { await route.fulfill({ json: { data: [] } }); return true; }
  return false;
}

test('renders source tabs, opens ORDER detail, and follows the POS scoped deep link', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', async route => {
    if (await commonRoute(route)) return;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/sales/activity')) return route.fulfill({ json: {
      data: [row('ORDER', 'order-1', 'SO-E2E-001'), row('POS', '42', 'POS-E2E-042')],
      availableSources: ['ORDER', 'POS'], page: 1, limit: 20, hasMore: false,
    } });
    if (url.pathname.endsWith('/sales/orders/order-1')) return route.fulfill({ json: { data: {
      id: 'order-1', order_no: 'SO-E2E-001', company_code: 'C1', customer_name: 'E2E 客户',
      status: 'DRAFT', total_amount: 100, currency_code: 'CNY', created_at: '2026-09-01T00:00:00Z',
      items: [{ id: 'i1', product_code: 'SKU-1', product_name: 'E2E 鸡蛋', grade_code: 'A', qty: 1, resolved_unit_price: 100, actual_unit_price: 100, floor_price: null, amount: 100, below_floor_price: false }],
    } } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/sales2/orders');
  await expect(page.getByRole('tab', { name: '客户订单' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'POS 成交' })).toBeVisible();
  await expect(page.getByText('SO-E2E-001')).toBeVisible();
  await page.locator('tbody tr').filter({ hasText: 'SO-E2E-001' }).click();
  await expect(page.getByText('订单明细')).toBeVisible();
  await expect(page.getByText('E2E 鸡蛋')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('tbody tr').filter({ hasText: 'POS-E2E-042' }).click();
  await expect(page).toHaveURL(/\/store-pos\?saleId=42&storeCode=S1/);
});

test('shows a persistent fallback banner and legacy ORDER row when facade fails', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', async route => {
    if (await commonRoute(route)) return;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/sales/activity')) return route.fulfill({ status: 500, json: { message: 'facade failed' } });
    if (url.pathname.endsWith('/sales/orders')) return route.fulfill({ json: { data: [{
      id: 'legacy-1', order_no: 'SO-LEGACY-001', company_code: 'C1', customer_code: 'CU1', customer_name: 'Legacy 客户',
      status: 'DRAFT', total_amount: 99, currency_code: 'CNY', created_at: '2026-09-01T00:00:00Z',
    }] } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/sales2/orders');
  await expect(page.getByRole('alert').filter({ hasText: '联合列表不可用，当前展示客户订单' })).toBeVisible();
  await expect(page.getByText('SO-LEGACY-001')).toBeVisible();
  await expect(page.getByText('暂无销售数据')).toHaveCount(0);
});
