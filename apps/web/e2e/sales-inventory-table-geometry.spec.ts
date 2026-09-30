import { expect, test, type Locator, type Page } from '@playwright/test';
import { authenticateMockPage } from './support/auth';

const tokenUser = { username: 'e2e-admin', name: 'E2E Admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };
const companyDisplay = '老挝凤凰农业发展有限公司（COMP-LAO-AGRI）';
const batch = {
  batch_no: 'BATCH-GEOMETRY-20260906', sku_code: 'SKU-EGG-AA-30', sku_name: '鲜鸡蛋 30 枚装',
  product_code: 'EGG', product_name: '鲜鸡蛋', company_code: 'COMP-LAO-AGRI', company_name: '老挝凤凰农业发展有限公司',
  qty_available: 54321, qty: 98765, status: 'AVAILABLE', quality_grade: 'AA', egg_date: '2026-09-01',
  expire_date: '2026-09-20', source_type: 'PACKAGING', source_no: 'PKG-20260901-001', created_at: '2026-09-01T00:00:00Z', days_remaining: 14,
};
const unmappedProductionBatch = {
  batch_no: 'EGG-20260908-00001', sku_code: null, sku_name: null,
  product_code: 'PRD-EGG-GRADE_1', product_name: 'PRD-EGG-GRADE_1', company_code: 'COMP-LAO-AGRI', company_name: '老挝凤凰农业发展有限公司',
  qty_available: 100, qty: 100, status: 'AVAILABLE', quality_grade: 'GRADE_1', egg_date: '2026-09-08',
  expire_date: '2026-10-08', source_type: 'TEMP_PRODUCTION', source_no: 'TEMP-2026-09-08-HOUSE-1', created_at: '2026-09-08T00:00:00Z', days_remaining: 30,
};

async function mockInventory(page: Page) {
  await authenticateMockPage(page, tokenUser);
  await page.route('**/api/v2/sales/inventory/stats', route => route.fulfill({ json: { activeBatches: 2, totalAvailable: 54421, expiringBatches: 1, expiringQty: 54321, expiredBatches: 0, returnedBatches: 0, todayExpireLoss: 0, todayDamageLoss: 0, expiringWarnDays: 7 } }));
  await page.route('**/api/v2/sales/inventory/batches**', route => route.fulfill({ json: [batch, unmappedProductionBatch] }));
  await page.route('**/api/v2/sales/inventory/expiring**', route => route.fulfill({ json: [batch] }));
  await page.route('**/api/product-master/skus**', route => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/product-grades**', route => route.fulfill({ json: [] }));
  await page.route('**/api/notifications/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/online-users**', route => route.fulfill({ json: [] }));
}

async function assertDesktopGeometry(row: Locator, companyIndex: number, availableIndex: number, totalIndex?: number) {
  const companyCell = row.locator('td').nth(companyIndex);
  const companyText = companyCell.locator('span');
  const available = row.locator('td').nth(availableIndex);
  await expect(companyText).toHaveAttribute('title', companyDisplay);
  await expect(available).toHaveText('54,321');
  if (totalIndex !== undefined) await expect(row.locator('td').nth(totalIndex)).toHaveText('98,765');
  const boxes = await Promise.all([companyCell.boundingBox(), companyText.boundingBox(), available.boundingBox(), totalIndex === undefined ? null : row.locator('td').nth(totalIndex).boundingBox()]);
  const [companyBox, textBox, availableBox, totalBox] = boxes;
  expect(companyBox && textBox && availableBox).toBeTruthy();
  expect(textBox!.x).toBeGreaterThanOrEqual(companyBox!.x);
  expect(textBox!.x + textBox!.width).toBeLessThanOrEqual(companyBox!.x + companyBox!.width + 0.5);
  expect(companyBox!.x + companyBox!.width).toBeLessThanOrEqual(availableBox!.x + 0.5);
  if (totalBox) expect(availableBox!.x + availableBox!.width).toBeLessThanOrEqual(totalBox.x + 0.5);
  expect(await companyText.evaluate(el => getComputedStyle(el).overflow)).toBe('hidden');
  return { company: companyBox, companyText: textBox, available: availableBox, total: totalBox };
}

for (const viewport of [{ width: 2784, height: 1511 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  test(`inventory cells stay isolated at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockInventory(page);
    await page.goto('/sales2/inventory');
    if (viewport.width <= 768) {
      const card = page.locator('article').filter({ hasText: 'BATCH-GEOMETRY-20260906' });
      await expect(card).toContainText(companyDisplay);
      await expect(card).toContainText('54,321 / 98,765');
      await expect(page.locator('table').first()).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath(`inventory-${viewport.width}x${viewport.height}.png`), fullPage: true });
      return;
    }
    await expect(page.getByText(companyDisplay, { exact: true }).first()).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'EGG-20260908-00001' })).toContainText('PRD-EGG-GRADE_1');
    await page.screenshot({ path: testInfo.outputPath(`inventory-${viewport.width}x${viewport.height}.png`), fullPage: true });
    const batchGeometry = await assertDesktopGeometry(page.locator('tbody tr').filter({ hasText: 'BATCH-GEOMETRY-20260906' }), 4, 5, 6);
    await page.getByRole('button', { name: '临期库存' }).click();
    const expiringGeometry = await assertDesktopGeometry(page.locator('tbody tr').filter({ hasText: 'BATCH-GEOMETRY-20260906' }), 4, 5);
    await testInfo.attach('cell-geometry.json', { body: JSON.stringify({ viewport, batchGeometry, expiringGeometry }, null, 2), contentType: 'application/json' });
  });
}
