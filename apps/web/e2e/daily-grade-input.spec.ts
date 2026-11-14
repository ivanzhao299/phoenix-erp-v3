import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

const gradeCodes = ['GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'];

// All API traffic stays inside these browser fixtures; no database or account writes.
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
    if (path === '/api/lookup/product-grades') json = gradeCodes.map((grade_code, i) => ({ grade_code, grade_name: `测试档${i + 1}`, sort_order: i, status: 'ACTIVE' }));
    await route.fulfill({ json });
  });
});

test('nine inline grade inputs suppress arrow stepping and spinner, not ordinary numbers', async ({ page }) => {
  await page.goto('/breeding/daily');
  const inputs = page.locator('input[type=number][aria-label]');
  await expect(inputs).toHaveCount(9);
  await expect(page.getByRole('button', { name: '按等级分级', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const input of await inputs.all()) {
    await input.fill('12');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('12');
    await input.press('ArrowDown');
    await expect(input).toHaveValue('12');
    await expect(input).toHaveAttribute('min', '0');
    await expect(input).toHaveAttribute('step', '1');
    expect(await input.evaluate(element => getComputedStyle(element).appearance)).toBe('textfield');
    const box = (await input.boundingBox())!;
    await input.click({ position: { x: box.width - 8, y: box.height / 4 } });
    await expect(input).toHaveValue('12');
    await input.click({ position: { x: box.width - 8, y: box.height * 3 / 4 } });
    await expect(input).toHaveValue('12');
    await expect(input).toHaveAccessibleName(/测试档/);
  }
  const ordinary = page.getByText('死亡(羽)', { exact: true }).locator('..').locator('input');
  await ordinary.fill('12');
  await ordinary.press('ArrowUp');
  await expect(ordinary).toHaveValue('13');
  await ordinary.press('ArrowDown');
  await expect(ordinary).toHaveValue('12');
});

test('inline editing retains focus movement, clear-to-empty, zero and native integer validation', async ({ page }) => {
  await page.goto('/breeding/daily');
  const inputs = page.locator('input[type=number][aria-label]');
  await expect(inputs).toHaveCount(9);
  const input = inputs.first();
  await input.fill('123');
  await input.press('End');
  await input.press('Backspace');
  await expect(input).toHaveValue('12');
  await input.press('Home');
  await input.press('Delete');
  await expect(input).toHaveValue('2');
  await input.press('ControlOrMeta+A');
  await input.press('Backspace');
  await expect(input).toHaveValue('');
  await input.pressSequentially('45');
  await expect(input).toHaveValue('45');
  await input.press('Tab');
  await expect(inputs.nth(1)).toBeFocused();
  await input.fill('-5');
  await expect(input).toHaveValue('0');
  await input.fill('0');
  await expect(input).toHaveValue('0');
  await input.fill('1.5');
  expect(await input.evaluate(element => (element as HTMLInputElement).validity.stepMismatch)).toBe(true);
  for (const gradeInput of await inputs.all()) {
    await gradeInput.fill('8');
    await gradeInput.clear();
    await expect(gradeInput).toHaveValue('');
  }
  const ordinary = page.getByText('饲料(kg)', { exact: true }).locator('..').locator('input');
  await ordinary.fill('-2');
  await expect(ordinary).toHaveValue('0');
  await ordinary.clear();
  await expect(ordinary).toHaveValue('');
});

test('ACTIVE grade master can enable GRADE_0 as a tenth inline code without weight assumptions', async ({ page }) => {
  const codes = ['GRADE_0', ...gradeCodes];
  await page.route('**/api/lookup/product-grades', route => route.fulfill({ json: codes.map((grade_code, sort_order) => ({
    grade_code, grade_name: `主数据-${grade_code}`, grade_name_lo: `ທົດສອບ-${grade_code}`, sort_order, status: 'ACTIVE',
    is_saleable: grade_code.startsWith('GRADE_'), is_storable: true,
  })) }));
  await page.goto('/breeding/daily');
  await expect(page.locator('input[type=number][aria-label]')).toHaveCount(codes.length);
  for (const code of codes) await expect(page.getByText(`主数据-${code} (${code})`, { exact: true })).toBeVisible();
  const gradeZero = page.getByRole('spinbutton', { name: '主数据-GRADE_0 · 数量(枚)', exact: true });
  await gradeZero.fill('17');
  await expect(page.getByText('产蛋合计（枚）', { exact: true }).locator('..')).toHaveText('产蛋合计（枚）17');
  await gradeZero.clear();
  await expect(gradeZero).toHaveValue('');
  await expect(page.getByText('产蛋合计（枚）', { exact: true }).locator('..')).toHaveText('产蛋合计（枚）0');
});
