import { expect, test, type Page } from '@playwright/test';

type MockUser = {
  username: string;
  name: string;
  role: string;
  roles: string[];
  permissions: string[];
};

const ADMIN: MockUser = {
  username: 'e2e-admin', name: 'E2E Admin', role: 'ROLE_ADMIN',
  roles: ['ROLE_ADMIN'], permissions: ['*'],
};
const TERMINAL_OPERATOR: MockUser = {
  username: 'e2e-pkg-op', name: 'E2E 包装员', role: 'ROLE_PKG_OPERATOR',
  roles: ['ROLE_PKG_OPERATOR'], permissions: ['MENU_PKG_OP:V'],
};

function tokenFor(user: MockUser) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.username, username: user.username, role: user.role, roles: user.roles,
    permissions: user.permissions, exp: 4_102_444_800,
  })).toString('base64url');
  return `e30.${payload}.e2e`;
}

async function authenticate(page: Page, user: MockUser) {
  const token = tokenFor(user);
  await page.context().addCookies([{
    name: 'phoenix_access_token', value: token,
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
  }]);
  await page.addInitScript(({ authToken, authUser }) => {
    sessionStorage.setItem('phoenix_session_version', 'v6');
    sessionStorage.setItem('phoenix_token', authToken);
    sessionStorage.setItem('phoenix_user', JSON.stringify(authUser));
    localStorage.setItem('phoenix_token', authToken);
    localStorage.setItem('phoenix_user', JSON.stringify(authUser));
    localStorage.setItem('phoenix_lang', 'zh');
  }, { authToken: token, authUser: user });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/notifications/unread-count')) return route.fulfill({ json: { count: 0 } });
    if (path.endsWith('/notifications/stream')) return route.abort();
    if (path.endsWith('/online-users')) return route.fulfill({ json: [] });
    if (path.endsWith('/packaging/terminal/exceptions/today')) return route.fulfill({ json: { code: 200, data: [] } });
    if (path.endsWith('/packaging/terminal/reports/shift-summary')) return route.fulfill({ json: { code: 200, data: {} } });
    return route.fulfill({ json: { code: 200, data: [] } });
  });
}

async function enterTerminal(page: Page) {
  const fullscreenPrompt = page.getByText('点击进入全屏模式');
  if (await fullscreenPrompt.isVisible().catch(() => false)) await fullscreenPrompt.click();
}

test('admin opens packaging terminal in a new tab and keeps the admin tab', async ({ page, context }) => {
  await authenticate(page, ADMIN);
  await page.goto('/packaging');
  const entry = page.locator('a[href="/terminal/packaging/dashboard"][target="_blank"]');
  await expect(entry).toBeVisible();

  const [terminalPage] = await Promise.all([context.waitForEvent('page'), entry.click()]);
  await terminalPage.waitForLoadState('domcontentloaded');

  expect(context.pages()).toHaveLength(2);
  await expect(page).toHaveURL(/\/packaging/);
  await expect(terminalPage).toHaveURL(/\/terminal\/packaging\/dashboard/);
});

test('admin can return from the terminal top bar to the dashboard', async ({ page }) => {
  await authenticate(page, ADMIN);
  await page.goto('/terminal/packaging/dashboard');
  await enterTerminal(page);

  const adminReturn = page.getByRole('button', { name: '返回管理后台' });
  await expect(adminReturn).toBeVisible();
  await adminReturn.click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('packaging-only operator does not get an unsafe admin return action', async ({ page }) => {
  await authenticate(page, TERMINAL_OPERATOR);
  await page.goto('/terminal/packaging/dashboard');
  await enterTerminal(page);

  await expect(page.getByRole('button', { name: '返回管理后台' })).toHaveCount(0);
  await expect(page.locator('a[href="/terminal/home"]')).toBeVisible();
});
