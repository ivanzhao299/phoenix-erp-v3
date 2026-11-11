import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

type DailyPayload = Record<string, unknown> & { eggs_by_grade: Record<string, number> };
const codes = ['GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'];

// The old two-shift/partial-save flow no longer exists. One day is one atomic report.
test.beforeEach(async ({ page }) => {
  await authenticateMockPage(page, {
    username: 'daily-atomic-fixture', role: 'ROLE_FARM_MGR', roles: ['ROLE_FARM_MGR'],
    permissions: ['MENU_FARM_DAILY:V,C,E'], store_code: 'FIXTURE-COMPANY',
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    let json: unknown = [];
    if (path === '/api/crud/brd_houses') json = [{ house_code: 'FIXTURE-H1', house_name: '测试鸡舍', farm_code: 'FIXTURE-COMPANY' }];
    if (path === '/api/crud/brd_flocks') json = [{ flock_no: 'FIXTURE-F1', house_code: 'FIXTURE-H1', current_qty: 1000 }];
    if (path === '/api/lookup/houses') json = [{ houseCode: 'FIXTURE-H1', houseName: '测试鸡舍', companyCode: 'FIXTURE-COMPANY' }];
    if (path === '/api/lookup/product-grades') json = codes.map((grade_code, sort_order) => ({ grade_code, grade_name: grade_code, sort_order, status: 'ACTIVE' }));
    await route.fulfill({ json });
  });
});

for (const status of [201, 400]) {
  test(`single-day atomic save (${status}) never posts a second shift or automatic inventory`, async ({ page }) => {
    const mutations: string[] = [];
    const payloads: DailyPayload[] = [];
    await page.route('**/api/**', async route => {
      if (route.request().method() === 'GET') return route.fallback();
      const path = new URL(route.request().url()).pathname;
      mutations.push(path);
      if (path !== '/api/v3/farm/daily-logs') throw new Error(`Unexpected mutation: ${path}`);
      payloads.push(route.request().postDataJSON());
      return route.fulfill({ status, json: status === 201 ? { code: 200 } : { message: 'fixture atomic report rejected' } });
    });
    await page.goto('/breeding/daily');
    await expect(page.locator('input[type=number][aria-label]')).toHaveCount(codes.length);
    await page.locator('input[type=date]').first().fill('2026-10-16');
    await page.getByRole('spinbutton', { name: 'GRADE_0 · 数量(枚)', exact: true }).fill('11');
    await page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true }).fill('22');
    await page.getByRole('spinbutton', { name: 'GRADE_2 · 数量(枚)', exact: true }).fill('0');
    await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
    if (status === 201) {
      await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
      for (const input of await page.locator('input[type=number][aria-label]').all()) await expect(input).toHaveValue('');
      await expect(page).toHaveURL(/historyHouse=FIXTURE-H1.*historyDate=2026-10-16/);
    } else {
      await expect(page.getByText('日报提交失败：fixture atomic report rejected', { exact: false })).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: 'GRADE_0 · 数量(枚)', exact: true })).toHaveValue('11');
      await expect(page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true })).toHaveValue('22');
      await expect(page.getByText('日报已成功提交！', { exact: false })).toHaveCount(0);
    }
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ house_code: 'FIXTURE-H1', flock_no: 'FIXTURE-F1', farm_code: 'FIXTURE-COMPANY', log_date: '2026-10-16', eggs_by_grade: { GRADE_0: 11, GRADE_1: 22 } });
    expect(payloads[0]).not.toHaveProperty('shift');
    expect(payloads[0]).not.toHaveProperty('eggs_produced');
    expect(mutations).toEqual(['/api/v3/farm/daily-logs']);
    await expect(page.getByRole('button', { name: '同步入销售库存', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('rejected atomic report retries the complete unchanged day only after explicit submit', async ({ page }) => {
  const payloads: DailyPayload[] = [];
  await page.route('**/api/v3/farm/daily-logs', async route => {
    expect(route.request().method()).toBe('POST');
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: payloads.length === 1 ? 400 : 201, json: { message: 'fixture retry required' } });
  });
  await page.goto('/breeding/daily');
  await page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true }).fill('33');
  await page.getByRole('spinbutton', { name: 'DIRTY · 数量(枚)', exact: true }).fill('4');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('日报提交失败：fixture retry required', { exact: false })).toBeVisible();
  expect(payloads).toHaveLength(1);
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(payloads[1].eggs_by_grade).toEqual({ GRADE_1: 33, DIRTY: 4 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('mortality-only day saves without inventing egg quantities or opening inventory', async ({ page }) => {
  const payloads: DailyPayload[] = [];
  await page.route('**/api/v3/farm/daily-logs', async route => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { code: 200 } });
  });
  await page.goto('/breeding/daily');
  await page.getByText('死亡(羽)', { exact: true }).locator('..').locator('input').fill('2');
  await page.getByText('淘汰(羽)', { exact: true }).locator('..').locator('input').fill('3');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({ mortality_qty: 2, elimination_qty: 3, eggs_by_grade: {} });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('fractional inline grade is rejected before any report or inventory mutation', async ({ page }) => {
  const mutations: string[] = [];
  await page.route('**/api/**', async route => {
    if (route.request().method() === 'GET') return route.fallback();
    mutations.push(route.request().url());
    throw new Error('Fractional quantities must not reach an API mutation');
  });
  await page.goto('/breeding/daily');
  await page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true }).fill('1.5');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('九档数量必须为非负整数', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
  await expect(page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true })).toHaveValue('1.5');
});
