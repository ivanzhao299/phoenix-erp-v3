import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

test('receiving-only user cannot create a receipt with stale or failed order details', async ({ page }) => {
  await authenticateMockPage(page, {
    username: 'receiving-fixture', role: 'ROLE_WAREHOUSE', roles: ['ROLE_WAREHOUSE'],
    permissions: ['MENU_PRC2_RECEIPT:V,C,E'], store_code: 'FIXTURE',
  });
  let releaseA!: () => void;
  const waitForA = new Promise<void>(resolve => { releaseA = resolve; });
  let bRequests = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/receipts/eligible-orders')) {
      return route.fulfill({ json: [{ id: '1', poNo: 'PO-A' }, { id: '2', poNo: 'PO-B' }] });
    }
    if (path.endsWith('/eligible-orders/1')) {
      await waitForA;
      return route.fulfill({ json: { id: '1', poNo: 'PO-A', items: [{ id: '11', itemCode: 'A', itemName: 'Feed A', qty: 17, receivedQty: 0 }] } });
    }
    if (path.endsWith('/eligible-orders/2')) {
      if (++bRequests === 1) return route.fulfill({ status: 503, json: { message: 'test failure' } });
      return route.fulfill({ json: { id: '2', poNo: 'PO-B', items: [{ id: '21', itemCode: 'B', itemName: 'Feed B', qty: 5, receivedQty: 0 }] } });
    }
    if (path.endsWith('/receipts')) {
      expect(route.request().method()).toBe('GET');
      return route.fulfill({ json: { items: [], total: 0, page: 1 } });
    }
    expect(path).not.toContain('/procurement/orders/');
    return route.fulfill({ json: [] });
  });

  await page.goto('/procurement2/receipts');
  await page.getByRole('button', { name: '新建收货单' }).click();
  const select = page.locator('select').filter({ has: page.locator('option[value="2"]') });
  await Promise.all([page.waitForRequest(request => request.url().endsWith('/eligible-orders/1')), select.selectOption('1')]);
  await select.selectOption('2');
  await expect(page.getByRole('alert').filter({ hasText: '无法加载订单明细' })).toBeVisible();
  await expect(page.getByRole('button', { name: '创建收货单' })).toBeDisabled();
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('Feed B B')).toBeVisible();
  await expect(page.locator('input[type="number"]').first()).toHaveValue('5');
  await Promise.all([page.waitForResponse(response => response.url().endsWith('/eligible-orders/1')), Promise.resolve().then(releaseA)]);
  await expect(page.getByPlaceholder('PO2-...')).toHaveValue('PO-B');
  await expect(page.locator('input[type="number"]').first()).toHaveValue('5');
  await expect(page.getByText('Feed A A')).toHaveCount(0);
});
