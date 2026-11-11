import { expect, type Download } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

const codes = ['GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'];
const grades = Object.fromEntries(codes.map((code, i) => [code, i + 1]));
const saved = { id: 1, log_date: '2026-10-16', house_code: 'FIXTURE-H2', eggs_produced: 55, eggs_by_grade: grades, mortality_qty: 2, elimination_qty: 3, note: '=FORMULA,"quoted"\nsecond line' };

function exportPanel(page: import('@playwright/test').Page) {
  return page.getByText(/导出已保存的日报|Export saved daily reports/, { exact: false }).locator('../..');
}

async function readCsv(download: Download) {
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// API fixtures supply authorized historical rows independently of unsaved entry state.
test.beforeEach(async ({ page }, testInfo) => {
  await authenticateMockPage(page, {
    username: 'grade-export-fixture', role: 'ROLE_FARM_MGR', roles: ['ROLE_FARM_MGR'],
    permissions: ['MENU_FARM_DAILY:V,C,E,X'], store_code: 'FIXTURE-COMPANY',
  }, testInfo.title.startsWith('Lao') ? 'lo' : 'zh');
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    let json: unknown = [];
    if (path === '/api/crud/brd_houses') json = ['1', '2'].map(n => ({ house_code: `FIXTURE-H${n}`, house_name: `测试鸡舍${n}`, farm_code: 'FIXTURE-COMPANY' }));
    if (path === '/api/crud/brd_flocks') json = [{ flock_no: 'FIXTURE-F1', house_code: 'FIXTURE-H1', current_qty: 1000 }];
    if (path === '/api/lookup/houses') json = ['1', '2'].map(n => ({ houseCode: `FIXTURE-H${n}`, houseName: `测试鸡舍${n}` }));
    if (path === '/api/lookup/product-grades') json = codes.map((grade_code, sort_order) => ({ grade_code, grade_name: `测试-${grade_code}`, grade_name_lo: `ທົດສອບ-${grade_code}`, sort_order, status: 'ACTIVE' }));
    if (path === '/api/crud/brd_daily_logs') json = { code: 200, data: [saved] };
    await route.fulfill({ json });
  });
});

test('date export reads saved dynamic grades across authorized houses, never unsaved inline values', async ({ page }) => {
  const queries: string[] = [];
  await page.route('**/api/crud/brd_daily_logs/export?**', async route => {
    const url = new URL(route.request().url());
    queries.push(url.search);
    expect(Object.fromEntries(url.searchParams)).toEqual({ log_date: '2026-10-16' });
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: { code: 200, data: [saved] } });
  });
  await page.goto('/breeding/daily?historyHouse=FIXTURE-H1&historyDate=2026-10-15');
  await expect(page.locator('dl dd')).toHaveText(Object.values(grades).map(String));
  await page.locator('input[type=date]').first().fill('2026-10-20');
  await page.getByRole('spinbutton', { name: '测试-GRADE_0 · 数量(枚)', exact: true }).fill('777');
  await page.getByRole('button', { name: '导出报表', exact: true }).click();
  const dialog = exportPanel(page);
  await expect(dialog).toContainText('与录入表单的鸡舍选择无关');
  await dialog.locator('input[type=date]').fill('2026-10-16');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出报表', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('daily-report_2026-10-16.csv');
  const csv = await readCsv(download);
  expect(csv).toContain('"55"');
  expect(csv).toContain('"FIXTURE-H2"');
  expect(csv).not.toContain('"777"');
  expect(csv).not.toContain('2026-10-20');
  for (const code of codes) expect(csv).toContain(`(${code})`);
  expect(csv).toContain(`"'=FORMULA,""quoted""\nsecond line"`);
  expect(queries).toHaveLength(1);
  await expect(page.getByRole('spinbutton', { name: '测试-GRADE_0 · 数量(枚)', exact: true })).toHaveValue('777');
});

test('Lao historical labels and English export retain runtime codes and saved quantities', async ({ page }) => {
  await page.route('**/api/crud/brd_daily_logs/export?**', async route => {
    expect(Object.fromEntries(new URL(route.request().url()).searchParams)).toEqual({ log_date: '2026-10-16' });
    await route.fulfill({ json: [saved] });
  });
  await page.goto('/breeding/daily');
  await expect(page.locator('dl dt').first()).toHaveText('ທົດສອບ-GRADE_0');
  await expect(page.locator('dl dd')).toHaveText(Object.values(grades).map(String));
  await page.locator('select').filter({ has: page.locator('option[value=en]') }).selectOption('en');
  await page.getByRole('button', { name: 'Export report', exact: true }).click();
  const dialog = exportPanel(page);
  await dialog.locator('input[type=date]').fill('2026-10-16');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export report', exact: true }).click();
  const csv = await readCsv(await downloading);
  expect(csv).toContain('(GRADE_0)');
  expect(csv).toContain('"55"');
  expect(csv).toContain('"FIXTURE-H2"');
});

test('export refuses response rows outside requested business date instead of downloading wrong range', async ({ page }) => {
  const downloads: Download[] = [];
  page.on('download', download => downloads.push(download));
  await page.route('**/api/crud/brd_daily_logs/export?**', async route => {
    expect(new URL(route.request().url()).searchParams.get('log_date')).toBe('2026-10-16');
    await route.fulfill({ json: [ { ...saved, log_date: '2026-10-17' } ] });
  });
  await page.goto('/breeding/daily');
  await page.getByRole('button', { name: '导出报表', exact: true }).click();
  const dialog = exportPanel(page);
  await dialog.locator('input[type=date]').fill('2026-10-16');
  await dialog.getByRole('button', { name: '导出报表', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('导出失败');
  expect(downloads).toEqual([]);
});

test('export preserves historical codes absent from ACTIVE master and leaves missing grades blank', async ({ page }) => {
  await page.route('**/api/crud/brd_daily_logs/export?**', route => route.fulfill({ json: [{
    ...saved, eggs_by_grade: { GRADE_0: 0, RETIRED_FIXTURE: 7 }, eggs_produced: 7,
  }] }));
  await page.goto('/breeding/daily');
  await page.getByRole('button', { name: '导出报表', exact: true }).click();
  const dialog = exportPanel(page);
  await dialog.locator('input[type=date]').fill('2026-10-16');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出报表', exact: true }).click();
  const csv = await readCsv(await downloading);
  expect(csv).toContain('RETIRED_FIXTURE');
  // The last columns are master codes, then the historical-only code. No total-based inference.
  expect(csv).toMatch(/,"0","","","","","","","","","","7"$/);
});
