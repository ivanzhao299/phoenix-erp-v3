import { expect, test, type Page } from '@playwright/test';

const payload = Buffer.from(JSON.stringify({
  sub: 'e2e-admin', username: 'e2e-admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'],
  exp: 4_102_444_800,
})).toString('base64url');
const TOKEN = `e30.${payload}.e2e`;
const USER = { username: 'e2e-admin', name: 'E2E Admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };

async function authenticate(page: Page, lang = 'zh') {
  await page.context().addCookies([{
    name: 'phoenix_access_token', value: TOKEN,
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
  }]);
  await page.addInitScript(({ token, user, language }) => {
    sessionStorage.setItem('phoenix_session_version', 'v6');
    sessionStorage.setItem('phoenix_token', token);
    sessionStorage.setItem('phoenix_user', JSON.stringify(user));
    localStorage.setItem('phoenix_lang', language);
  }, { token: TOKEN, user: USER, language: lang });
  await page.route('**/api/notifications/stream?**', route => route.abort());
  await page.route('**/api/notifications/unread-count', route => route.fulfill({ json: { count: 0 } }));
  await page.route('**/api/online-users**', route => route.fulfill({ json: [] }));
}

test('quality dashboard keeps the async Chinese record count', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/crud/qa_inspections**', async route => {
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill({ json: { data: [
      { id: 'Q1', status: 'PASS', inspect_date: '2026-08-22' },
      { id: 'Q2', status: 'FAIL', inspect_date: '2026-08-22' },
      { id: 'Q3', status: 'PASS', inspect_date: '2026-08-21' },
    ] } });
  });

  await page.goto('/quality');
  await expect(page.getByText(/全链路质量管控 · (共|合计) 3 条质检记录/)).toBeVisible();
  await expect(page.getByText(/全链路质量管控 · (共|合计) 0 条质检记录/)).toHaveCount(0);
});

test('notification text and title attributes keep the latest unread state', async ({ page }) => {
  await authenticate(page);
  let allRead = false;
  await page.route('**/api/notifications/unread-count', route => route.fulfill({ json: { count: 2 } }));
  const items = [
    { id: 'N1', userId: 'U1', notificationType: 'SYSTEM', title: '动态通知一', content: '内容一', status: 'UNREAD', createdAt: '2026-08-22T00:00:00Z' },
    { id: 'N2', userId: 'U1', notificationType: 'SYSTEM', title: '动态通知二', content: '内容二', status: 'UNREAD', createdAt: '2026-08-22T00:00:00Z' },
  ];
  await page.route('**/api/notifications?**', route => route.fulfill({
    json: { items: items.map(item => ({ ...item, status: allRead ? 'READ' : item.status })), total: 25 },
  }));
  await page.route('**/api/notifications/read-all', route => {
    allRead = true;
    return route.fulfill({ json: { ok: true } });
  });

  await page.goto('/notifications');
  await expect(page.getByText(/站内消息通知（2 条未读）/)).toBeVisible();
  await expect(page.getByText(/第 1 \/ 2 页，共 25 条/)).toBeVisible();
  const bell = page.getByTitle('2 条未读');
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByText(/消息中心 · 2 未读/)).toBeVisible();
  await page.getByRole('button', { name: /全部已读/ }).last().click();
  await expect(page.getByTitle('消息中心')).toBeVisible();
  await page.getByRole('button', { name: /全部已读/ }).first().click();
  await expect(page.getByText(/站内消息通知（2 条未读）/)).toHaveCount(0);
  await expect(page.getByText('已全部标为已读', { exact: true })).toBeVisible();
});

test('Lao mode uses a new flock quantity and Chinese restore keeps that latest source', async ({ page }) => {
  await authenticate(page, 'lo');
  let quantity = 150;
  const flock = () => ({
    flock_no: 'PW-FLOCK-I18N', farm_code: 'PW-FARM', farm_name: '测试养殖场',
    house_code: 'PW-HOUSE', breed_type: '海兰褐', source_farm: '', start_date: '2026-01-01',
    current_qty: quantity, placement_age: 1, cost: 1, target_weeks: 80, status: 'LAYING',
  });
  await page.route('**/api/crud/brd_flocks**', async route => {
    if (route.request().method() === 'PUT') {
      quantity = Number((await route.request().postDataJSON()).current_qty);
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: [flock()] });
  });
  await page.route('**/api/crud/brd_farms**', route => route.fulfill({ json: [{ farm_code: 'PW-FARM', farm_name: '测试养殖场' }] }));
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ json: [{ house_code: 'PW-HOUSE', farm_code: 'PW-FARM', house_name: '测试鸡舍', house_type: 'LAYER' }] }));
  await page.route('**/api/crud/sys_dict**', route => route.fulfill({ json: [] }));
  await page.route('**/api/master-data/runtime/supplier/active**', route => route.fulfill({ json: [] }));

  await page.goto('/breeding/flock');
  const row = page.locator('tbody tr').filter({ hasText: 'PW-FLOCK-I18N' });
  await expect(row).toContainText('150ຂົນ');
  await row.locator('button').first().click();
  const inputs = page.locator('input[type="number"]');
  const index = await inputs.evaluateAll(nodes => nodes.findIndex(node => (node as HTMLInputElement).value === '150'));
  expect(index).toBeGreaterThanOrEqual(0);
  await inputs.nth(index).fill('300');
  await page.getByRole('dialog').getByRole('button', { name: /保存|ບັນທຶກ/ }).click();
  await expect(row).toContainText('300ຂົນ');

  await page.locator('header select').selectOption('zh');
  await expect(row).toContainText('300羽');
});
