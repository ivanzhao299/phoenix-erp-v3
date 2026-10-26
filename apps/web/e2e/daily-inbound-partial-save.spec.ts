import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

// This UI-only fixture intercepts every API request; no account or database is written.
test.beforeEach(async ({ page }) => {
  await authenticateMockPage(page, {
    username: 'grade-input-fixture', role: 'ROLE_FARM_MGR', roles: ['ROLE_FARM_MGR'],
    permissions: ['MENU_FARM_DAILY:V,C,E'], store_code: 'FIXTURE-COMPANY',
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    let json: unknown = [];
    if (path === '/api/crud/brd_houses') json = [{ house_code: 'FIXTURE-H1', house_name: '测试鸡舍', farm_code: 'FIXTURE-COMPANY' }];
    if (path === '/api/crud/brd_flocks') json = [{ flock_no: 'FIXTURE-F1', house_code: 'FIXTURE-H1', current_qty: 1000 }];
    if (path === '/api/lookup/houses') json = [{ houseCode: 'FIXTURE-H1', houseName: '测试鸡舍' }];
    if (path === '/api/lookup/product-grades') json = [
      'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED',
    ].map((grade_code, i) => ({ grade_code, grade_name: `测试档${i + 1}`, sort_order: i, status: 'ACTIVE' }));
    await route.fulfill({ json });
  });
  await page.goto('/breeding/daily');
  await page.getByRole('button', { name: '按 9 档分级', exact: true }).first().click();
  await expect(page.getByText('早班 · 9 档分级录入', { exact: true }).locator('../..').locator('input')).toHaveCount(9);
});

for (const statuses of [[201, 400], [400, 201], [201, 201], [400, 400]]) {
  test(`only saved shifts enter inbound (${statuses.join('/')})`, async ({ page }) => {
  let saves = 0;
  let inboundItems: Array<{ grade: string; qty: number }> | undefined;
  await page.route('**/api/**', async route => {
    if (route.request().method() === 'GET') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v3/farm/daily-logs') {
      saves++;
      const qty = route.request().postDataJSON().eggs_produced;
      if (![11, 22].includes(qty)) throw new Error('Unexpected fixture shift');
      const status = statuses[qty === 11 ? 0 : 1];
      return route.fulfill({ status, json: status === 201 ? { code: 200 } : { message: 'fixture shift rejected' } });
    }
    if (path === '/api/v2/inventory/production-inbound') {
      const body = route.request().postDataJSON();
      inboundItems = body.items;
      return route.fulfill({ json: { mode: 'TEMP_PRODUCTION_INBOUND', batches: body.items.map((item: { grade: string; qty: number }, index: number) => ({ batchNo: `fixture-${index}`, grade: item.grade, qty: item.qty })), totalInbound: body.items.reduce((sum: number, item: { qty: number }) => sum + item.qty, 0) } });
    }
    throw new Error(`Unexpected mutation ${path}`);
  });
  const firstDialog = page.getByText('早班 · 9 档分级录入', { exact: true }).locator('../..');
  await firstDialog.locator('input').first().fill('11');
  await firstDialog.getByRole('button', { name: '确定', exact: true }).click();
  const eggs = page.getByText('产蛋数(枚)', { exact: true }).locator('..').locator('input');
  await eggs.nth(0).fill('11');
  await page.getByRole('button', { name: '按 9 档分级', exact: true }).click();
  const secondDialog = page.getByText(/ · 9 档分级录入$/, { exact: false }).locator('../..');
  await secondDialog.locator('input').first().fill('22');
  await secondDialog.getByRole('button', { name: '确定', exact: true }).click();
  await eggs.nth(1).fill('22');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  const expected = [11, 22].filter((_, index) => statuses[index] === 201).map(qty => ({ grade: 'GRADE_1', qty }));
  if (expected.length > 0) {
    await page.getByRole('button', { name: '同步入销售库存', exact: true }).click();
    await expect.poll(() => inboundItems).toEqual(expected);
  } else {
    await expect(page.getByText(/部分班次提交失败/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: '同步入销售库存', exact: true })).toHaveCount(0);
    expect(inboundItems).toBeUndefined();
  }
  expect(saves).toBe(2);
  });
}
