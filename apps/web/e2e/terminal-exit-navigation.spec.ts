import { expect, test, type Page } from '@playwright/test';
import { authenticateMockPage } from './support/auth';

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
const UNRELATED_ROLE: MockUser = {
  username: 'e2e-finance', name: 'E2E Finance', role: 'ROLE_FINANCE',
  roles: ['ROLE_FINANCE'], permissions: ['MENU_FINANCE:V'],
};

async function authenticate(page: Page, user: MockUser) {
  await authenticateMockPage(page, user);
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

test('unrelated role does not get the packaging terminal home entry', async ({ page }) => {
  await authenticate(page, UNRELATED_ROLE);
  await page.goto('/terminal/packaging/dashboard');
  await enterTerminal(page);

  await expect(page.locator('a[href="/terminal/home"]')).toHaveCount(0);
  await page.goto('/terminal/home');
  await expect(page.getByRole('button', { name: /包装作业/ })).toHaveCount(0);
});
