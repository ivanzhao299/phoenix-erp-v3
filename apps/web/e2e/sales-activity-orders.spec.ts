import { expect, test, type Page, type Route } from '@playwright/test';
import { authenticateMockPage } from './support/auth';

const ADMIN = { username: 'e2e-admin', name: 'E2E Admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };

async function authenticate(page: Page) {
  await authenticateMockPage(page, ADMIN);
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

test('accepts the refreshed ORDER detail timeline, health, deep-links and manual override', async ({ page }) => {
  await authenticate(page);
  let overrideBody: unknown;
  await page.route('**/api/**', async route => {
    if (await commonRoute(route)) return;
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/sales/activity')) return route.fulfill({ json: {
      data: [row('ORDER', 'order-1', 'SO-E2E-001'), row('POS', '42', 'POS-E2E-042')],
      availableSources: ['ORDER', 'POS'], page: 1, limit: 20, hasMore: false,
    } });
    if (url.pathname.endsWith('/sales/orders/order-1')) return route.fulfill({ json: { data: {
      id: 'order-1', order_no: 'SO-E2E-001', company_code: 'C1', customer_name: 'E2E 客户',
      status: 'APPROVED', total_amount: 100, currency_code: 'CNY', created_at: '2026-09-01T00:00:00Z',
      items: [{ id: 'i1', product_code: 'SKU-1', product_name: 'E2E 鸡蛋', grade_code: 'A', qty: 1, resolved_unit_price: 100, actual_unit_price: 100, floor_price: null, amount: 100, below_floor_price: false }],
    } } });
    if (url.pathname.endsWith('/sales/orders/order-1/process-log')) return route.fulfill({ json: { data: {
      orderNo: 'SO-E2E-001', currentStatus: 'APPROVED',
      warnings: ['DELIVERY_COMPLETED_WITHOUT_RECEIPT'],
      documents: [
        { type: 'DELIVERY', id: 'd1', no: 'DV-1', status: 'COMPLETED', href: '/sales2/delivery?deliveryId=d1' },
        { type: 'RECEIPT', id: 'r1', no: 'RC-1', status: 'SIGNED', href: '/sales2/delivery?deliveryId=d1&receiptId=r1' },
        { type: 'AR', id: 'a1', no: 'AR-1', status: 'OPEN', href: '/finance2/ar?invoiceId=a1' },
        { type: 'RETURN', id: 't1', no: 'RET-1', status: 'INSPECTING', href: '/sales2/returns?returnId=t1' },
      ],
      timeline: [
        { id: 'n1', time: '2026-09-01T01:00:00Z', docType: 'SALES_ORDER', docNo: 'SO-E2E-001', action: 'SUBMITTED', source: 'SALES_ORDER' },
        { id: 'n2', time: '2026-09-01T02:00:00Z', docType: 'WORKFLOW', docNo: 'WF-1', action: 'APPROVE', operator: '审批人', source: 'WORKFLOW' },
        { id: 'n3', time: '2026-09-01T03:00:00Z', docType: 'DELIVERY', docNo: 'DV-1', action: 'DEPARTED', source: 'DELIVERY' },
        { id: 'n4', time: '2026-09-01T04:00:00Z', docType: 'RECEIPT', docNo: 'RC-1', action: 'RECEIPT_COMPLETED', source: 'RECEIPT' },
        { id: 'n5', time: '2026-09-01T05:00:00Z', docType: 'AR', docNo: 'AR-1', action: 'AR_CREATED', source: 'FINANCE_AR' },
        { id: 'n6', time: '2026-09-01T06:00:00Z', docType: 'RETURN', docNo: 'RET-1', action: 'RETURN_CREATED', source: 'RETURN' },
      ],
    } } });
    if (url.pathname.endsWith('/sales/orders/order-1/manual-override')) {
      overrideBody = route.request().postDataJSON();
      return route.fulfill({ json: { data: { id: 'order-1', status: 'REJECTED' } } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto('/sales2/orders');
  await expect(page.getByRole('tab', { name: '客户订单' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'POS 成交' })).toBeVisible();
  await expect(page.getByText('SO-E2E-001')).toBeVisible();
  await page.locator('tbody tr').filter({ hasText: 'SO-E2E-001' }).click();
  await expect(page.getByText('订单明细')).toBeVisible();
  await expect(page.getByText('E2E 鸡蛋')).toBeVisible();
  await expect(page.getByText('配送已完成但缺少签收记录')).toBeVisible();
  for (const href of ['/sales2/delivery?deliveryId=d1', '/sales2/delivery?deliveryId=d1&receiptId=r1', '/finance2/ar?invoiceId=a1', '/sales2/returns?returnId=t1']) {
    await expect(page.locator(`a[href="${href}"]`)).toHaveCount(1);
  }
  const timeline = page.locator('[data-source]');
  await expect(timeline).toHaveCount(6);
  await expect(timeline.nth(1)).toHaveAttribute('data-source', 'WORKFLOW');
  await page.getByRole('button', { name: '人工纠偏' }).click();
  await page.getByLabel('目标状态').selectOption('REJECTED');
  await page.getByLabel('操作原因').fill('验收纠偏');
  await page.getByRole('button', { name: '确认纠偏' }).click();
  await expect.poll(() => overrideBody).toEqual({ targetStatus: 'REJECTED', reason: '验收纠偏' });
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
