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

test('nine grade inputs suppress arrow stepping and spinner while ordinary numeric fields still step', async ({ page }) => {
  const dialog = page.getByText('早班 · 9 档分级录入', { exact: true }).locator('../..');
  for (const input of await dialog.locator('input').all()) {
    await input.fill('12');
    await input.press('ArrowUp');
    await expect(input).toHaveValue('12');
    await input.press('ArrowDown');
    await expect(input).toHaveValue('12');
    await expect(input).toHaveAttribute('min', '0');
    await expect(input).toHaveAttribute('step', '1');
    expect(await input.evaluate(element => getComputedStyle(element).appearance)).toBe('textfield');
    // Exercise the upper/lower mouse spinner locations in the rendered browser.
    // Blink does not expose native spin-button computed styles through CSSOM.
    const box = (await input.boundingBox())!;
    await input.click({ position: { x: box.width - 8, y: box.height / 4 } });
    await expect(input).toHaveValue('12');
    await input.click({ position: { x: box.width - 8, y: box.height * 3 / 4 } });
    await expect(input).toHaveValue('12');
    await expect(input).toHaveAccessibleName(/测试档/);
  }
  await dialog.getByRole('button', { name: '确定', exact: true }).click();
  const ordinary = page.locator('input[type="number"]').first();
  await ordinary.fill('12');
  await ordinary.press('ArrowUp');
  await expect(ordinary).toHaveValue('13');
  await ordinary.press('ArrowDown');
  await expect(ordinary).toHaveValue('12');
});

test('manual editing, focus movement, zero and negative validation retain their behavior', async ({ page }) => {
  const dialog = page.getByText('早班 · 9 档分级录入', { exact: true }).locator('../..');
  const input = dialog.locator('input').first();
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
  await expect(dialog.locator('input').nth(1)).toBeFocused();
  await input.fill('-5');
  await expect(input).toHaveValue('0');
  await input.fill('0');
  await expect(input).toHaveValue('0');
  await input.fill('1.5');
  expect(await input.evaluate(element => (element as HTMLInputElement).validity.stepMismatch)).toBe(true);
  await dialog.getByRole('button', { name: '清空', exact: true }).click();
  for (const gradeInput of await dialog.locator('input').all()) await expect(gradeInput).toHaveValue('');
});
