import { expect, test } from '@playwright/test';

const FLOCK_NO = process.env.FLOCK_E2E_NO || 'PW-FLOCK-001';
// Must match the explicit BRD_BREED code in the disposable seed.
const BREED_CODE = 'HY_LINE_BROWN';
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
  // The current canonical post-login entry for this return target is the
  // breeding flock page; keep this contract aligned with the product route.
  await expect(page).toHaveURL(/\/breeding\/flock$/);
  await page.goto('/breeding/flock');

  const row = page.locator('tbody tr').filter({ hasText: FLOCK_NO });
  await expect(row).toBeVisible();
  const quantityCell = row.locator('td').nth(6);
  const oldQuantity = Number((await quantityCell.innerText()).replace(/[^\d.-]/g, ''));
  const newQuantity = oldQuantity === 900 ? 212 : 900;

  await row.locator('button').first().click();
  const breedSelect = page.getByRole('dialog').locator('label', { hasText: '鸡群品种' }).locator('..').locator('select');
  // A historical name or the first dictionary option must not substitute for
  // the persisted code; its enabled option also proves ACTIVE dict availability.
  await expect(breedSelect).toBeEnabled();
  await expect(breedSelect).toHaveValue(BREED_CODE);
  await expect(breedSelect.locator(`option[value="${BREED_CODE}"]`)).toBeEnabled();
  const quantityInput = page.locator('label', { hasText: '当前存栏(羽)' }).locator('..').locator('input');
  await quantityInput.fill(String(newQuantity));

  let mutationCompleted = false;
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.request().method() === 'PUT' && url.pathname.includes('/api/crud/brd_flocks/')) {
      mutationCompleted = true;
    }
  });

  const refreshed = page.waitForResponse(response =>
    mutationCompleted &&
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname === '/api/crud/brd_flocks',
  );
  const saved = page.waitForResponse(response =>
    response.request().method() === 'PUT' && new URL(response.url()).pathname.includes('/api/crud/brd_flocks/'),
  );
  await page.getByRole('button', { name: '保存修改' }).click();
  const saveResponse = await saved;
  expect(saveResponse.ok()).toBe(true);
  expect(saveResponse.request().postDataJSON()).toMatchObject({ breed_code: BREED_CODE, current_qty: newQuantity });
  const refreshResponse = await refreshed;
  expect(refreshResponse.ok()).toBe(true);
  const refreshedBody: unknown = await refreshResponse.json();
  await expect(page.getByText('更新成功', { exact: true })).toBeVisible();

  const records = Array.isArray(refreshedBody)
    ? refreshedBody
    : ((refreshedBody as { data?: unknown[] } | undefined)?.data || []);
  expect(records).toEqual(expect.arrayContaining([
    expect.objectContaining({ flock_no: FLOCK_NO, current_qty: newQuantity, breed_code: BREED_CODE }),
  ]));
  await expect(quantityCell).toHaveText(`${newQuantity.toLocaleString()}羽`);
  expect(browserErrors).toEqual([]);
});
