import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

// This UI-only fixture intercepts every API request; no account or database is written.
test.beforeEach(async ({ page }) => {
  await authenticateMockPage(page, {
    username: 'grade-input-fixture', role: 'ROLE_FARM_MGR', roles: ['ROLE_FARM_MGR'],
    permissions: ['MENU_FARM_DAILY:V,C,E,X'], store_code: 'FIXTURE-COMPANY',
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
});

test('date export downloads saved nine-grade data, not the edited entry form', async ({ page }) => {
  const grades = { GRADE_1: 11, GRADE_2: 22, GRADE_3: 33, GRADE_4: 44, GRADE_5: 55, DIRTY: 66, CRACKED: 77, BROKEN: 88, DAMAGED: 99 };
  const saved = { id: 1, log_date: '2026-10-16', house_code: 'FIXTURE-H1', eggs_produced: 495, eggs_by_grade: grades, mortality_qty: 2, elimination_qty: 3, note: '=FORMULA,"quoted"\nsecond line' };
  await page.route('**/api/crud/brd_daily_logs**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/export')) expect(url.searchParams.get('log_date')).toBe('2026-10-16');
    await route.fulfill({ json: { code: 200, data: [saved] } });
  });
  await page.goto('/breeding/daily');
  await expect(page.locator('dl dd')).toHaveText(Object.values(grades).map(String));
  await page.getByText('产蛋数(枚)', { exact: true }).locator('..').locator('input').first().fill('777');
  await page.getByRole('button', { name: '导出报表', exact: true }).click();
  const dialog = page.getByText('导出已保存的日报', { exact: true }).locator('../..');
  await dialog.locator('input[type=date]').fill('2026-10-16');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出报表', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('daily-report_2026-10-16.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('"495"'); expect(csv).not.toContain('"777"');
  for (const code of Object.keys(grades)) expect(csv).toContain(code);
  expect(csv).toContain(`"'=FORMULA,""quoted""\nsecond line"`);
});
