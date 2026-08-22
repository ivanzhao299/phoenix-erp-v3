import { expect, test } from '@playwright/test';

const USERNAME = process.env.TERMINAL_E2E_USER || 'admin';
const PASSWORD = process.env.TERMINAL_E2E_PASSWORD || 'admin123';

test('real login session opens packaging terminal in a new tab', async ({ context, page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('输入账户名').fill(USERNAME);
  await page.getByPlaceholder('输入密码').fill(PASSWORD);

  const loginResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/auth/login',
  );
  await page.getByRole('button', { name: /登\s*录/ }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard$/);

  const cookie = (await context.cookies()).find(item => item.name === 'phoenix_access_token');
  expect(cookie?.value).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);

  const storage = await page.evaluate(() => ({
    sessionToken: sessionStorage.getItem('phoenix_token'),
    sessionCookieToken: sessionStorage.getItem('phoenix_cookie_token'),
    localToken: localStorage.getItem('phoenix_token'),
    localCookieToken: localStorage.getItem('phoenix_cookie_token'),
    sessionVersion: sessionStorage.getItem('phoenix_session_version'),
  }));
  expect(storage.sessionToken).toBeTruthy();
  expect(storage.sessionCookieToken).toBeTruthy();
  expect(storage.localToken).toBeTruthy();
  expect(storage.localCookieToken).toBeTruthy();

  const terminal = await context.newPage();
  await terminal.goto('/terminal/packaging/dashboard');
  await terminal.waitForLoadState('networkidle');

  const evidence = {
    cookiePrefix: cookie?.value.slice(0, 12),
    cookieSegments: cookie?.value.split('.').length,
    sourceSessionVersion: storage.sessionVersion,
    newTabSessionVersion: await terminal.evaluate(() => sessionStorage.getItem('phoenix_session_version')),
    newTabLocalToken: Boolean(await terminal.evaluate(() => localStorage.getItem('phoenix_token'))),
    finalUrl: terminal.url(),
  };
  console.info(`TERMINAL_SESSION_EVIDENCE ${JSON.stringify(evidence)}`);
  await test.info().attach('session-evidence.json', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });

  await expect(terminal).toHaveURL(/\/terminal\/packaging\/dashboard$/);
});
