import { expect, test } from '@playwright/test';

const FLOCK_NO = process.env.FLOCK_E2E_NO || 'PW-FLOCK-001';
const USERNAME = process.env.FLOCK_E2E_USER || 'admin';
const PASSWORD = process.env.FLOCK_E2E_PASSWORD || 'admin123';

test('saved flock quantity is rendered from the post-save GET without reloading', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));

  await page.goto('/login?return=/breeding/flock');
  // Next dev can paint the streamed form before client hydration completes.
  // Let the login event handler attach before driving the form.
  await page.waitForTimeout(1_000);
  await page.getByPlaceholder('输入账户名').fill(USERNAME);
  await page.getByPlaceholder('输入密码').fill(PASSWORD);
  const loginResponse = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/auth/login',
  );
  await page.getByRole('button', { name: /登\s*录/ }).click();
  expect((await loginResponse).ok()).toBe(true);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('phoenix_token'))).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/breeding/flock');

  const row = page.locator('tbody tr').filter({ hasText: FLOCK_NO });
  await expect(row).toBeVisible();
  const quantityCell = row.locator('td').nth(6);
  const oldQuantity = Number((await quantityCell.innerText()).replace(/[^\d.-]/g, ''));
  const newQuantity = oldQuantity === 900 ? 212 : 900;

  await row.locator('button').first().click();
  const quantityInput = page.locator('label', { hasText: '当前存栏(羽)' }).locator('..').locator('input');
  await quantityInput.fill(String(newQuantity));

  let mutationCompleted = false;
  let refreshedBody: unknown;
  page.on('response', async response => {
    const url = new URL(response.url());
    if (response.request().method() === 'PUT' && url.pathname.includes('/api/crud/brd_flocks/')) {
      mutationCompleted = true;
    }
    if (mutationCompleted && response.request().method() === 'GET' && url.pathname === '/api/crud/brd_flocks') {
      refreshedBody = await response.json();
    }
  });

  const refreshed = page.waitForResponse(response =>
    mutationCompleted &&
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname === '/api/crud/brd_flocks',
  );
  await page.getByRole('button', { name: '保存修改' }).click();
  await refreshed;
  await expect(page.getByText('更新成功', { exact: true })).toBeVisible();

  const records = Array.isArray(refreshedBody)
    ? refreshedBody
    : ((refreshedBody as { data?: unknown[] } | undefined)?.data || []);
  expect(records).toEqual(expect.arrayContaining([
    expect.objectContaining({ flock_no: FLOCK_NO, current_qty: newQuantity }),
  ]));
  await expect(quantityCell).toHaveText(`${newQuantity.toLocaleString()}羽`);
  expect(browserErrors).toEqual([]);
});
