import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

const id = '12345678-1234-4234-8234-123456789abc';
const date = '2026-11-16';
const prefix = '/api/v3/farm/flock-lifecycle';
const admin = { username: 'fixture-admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };
const reviewer = {
  username: 'fixture-reviewer', role: 'ROLE_FARM_MGR', roles: ['ROLE_FARM_MGR'],
  permissions: ['MENU_FARM_DATA:V', 'MENU_FLOCK_APPROVE:A', 'MENU_PROD_INBOUND:V'],
};
const house = {
  house_code: 'H0', house_name: '鸡舍 0', farm_code: 'FARM', company_code: 'CO',
  entry_readiness: 'OCCUPIED', status: 'ACTIVE', flock_no: 'FL0', quantity: 100, occupancy_id: 'own-occupancy',
  max_capacity: 1000, version: 1, house_version: 2,
};
const document = {
  id, kind: 'MORTALITY', status: 'POSTED', house_code: house.house_code, flock_no: house.flock_no,
  business_date: date, company_code: house.company_code, farm_code: house.farm_code, version: 3,
  created_by: 'fixture', payload: { kind: 'MORTALITY', quantity: 10, reason: 'Fixture' },
};

async function workspaceFixture(page: Page, user = admin) {
  await authenticateMockPage(page, user);
  const requests: { pathname: string; params: URLSearchParams; method: string }[] = [];
  await page.route('**/api/**', route => {
    const { pathname, searchParams: params } = new URL(route.request().url());
    requests.push({ pathname, params, method: route.request().method() });
    const respond = (data: unknown) => route.fulfill({ json: { code: 200, data } });
    if (pathname === prefix + '/documents/search') {
      const items = params.get('review') === 'pending'
        ? [{ ...document, kind: 'CLOSE', status: 'APPROVED' }]
        : Array.from({ length: 40 }, (_, index) => index ? { ...document, id: `document-${index}` } : document);
      return respond({ items, nextCursor: null });
    }
    if (pathname === prefix + '/documents/' + id) {
      return respond({ ...document, events: [], audits: [], allowedActions: [], blockers: [] });
    }
    if (pathname === prefix + '/houses') {
      return respond(Array.from({ length: 12 }, (_, i) => ({ ...house, house_code: 'H' + i })));
    }
    return respond([]);
  });
  return requests;
}

test('desktop detail takes focus in view and returns focus to the list row', async ({ page }) => {
  const requests = await workspaceFixture(page);
  await page.goto('/breeding/flock-lifecycle/losses');
  const row = page.getByRole('button', { name: id, exact: true });
  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(id, { exact: true }).first()).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.contains(globalThis.document.activeElement))).toBe(true);
  await expect(dialog).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeFocused();
  expect(requests.some(({ pathname }) => pathname === prefix + '/care' || pathname === prefix + '/reports')).toBe(false);
});

test('legacy workbench exposes the reviewed shed day to a reviewer without posting rights', async ({ page }) => {
  const requests = await workspaceFixture(page, reviewer);
  await page.goto(`/breeding/flock-lifecycle?review=pending&houseCode=H0&date=${date}#flock-documents`);
  await expect(page.getByText('已审核', { exact: true }).first()).toBeVisible();
  expect(requests.some(({ pathname, params }) => pathname === prefix + '/documents/search'
    && params.get('review') === 'pending' && params.get('houseCode') === 'H0' && params.get('date') === date)).toBe(true);
  expect(requests.some(({ pathname }) => pathname === prefix + '/inbox')).toBe(false);
});

test.describe('mobile lifecycle', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('keeps the death and culling entry point and opens scoped document details in view', async ({ page }) => {
    await workspaceFixture(page);
    await page.goto('/mobile/flock-lifecycle');
    await expect(page).toHaveURL(/\/mobile\/flock-lifecycle\/losses\?entry=mortality/);
    await page.goto('/mobile/flock-lifecycle/losses?doc=' + id);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(id, { exact: true }).first()).toBeVisible();
    await expect(dialog).toBeInViewport();
    await expect.poll(() => dialog.evaluate(element => element.contains(globalThis.document.activeElement))).toBe(true);
  });

  test('displays event-ledger totals and prevents a stale legacy summary from overwriting its report', async ({ page }) => {
    const requests = await workspaceFixture(page);
    await page.route('**/api/v3/farm/daily-hen-report?**', route => route.fulfill({
      json: {
        code: 200, date,
        rows: [
          { house_code: 'H0', flock_no: 'FL0', occupancy_id: 'own-occupancy', mortality: 10, elimination: 3, culling_reason: null },
          { house_code: 'H1', flock_no: 'FL1', occupancy_id: null, mortality: 0, elimination: 0, culling_reason: null },
        ],
        totals: { mortality: 10, elimination: 3, total_loss: 13 },
      },
    }));
    await page.route('**/api/crud/brd_daily_logs?**', route => route.fulfill({
      json: { code: 200, data: [{ id: 1, house_code: 'H1', flock_no: 'FL1', mortality_qty: 7, elimination_qty: 5, culling_reason: null }] },
    }));
    await page.goto('/mobile/mortality');
    const spin = page.getByRole('spinbutton');
    await expect(spin.nth(0)).toHaveValue('10');
    await expect(spin.nth(1)).toHaveValue('3');
    await expect(spin.nth(0)).toBeDisabled();
    await spin.nth(2).fill('1');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('H1 原日报与当前汇总不同，请在养殖日报核对后编辑。', { exact: true }).first()).toBeVisible();
    expect(requests.some(({ pathname, method }) => pathname.startsWith('/api/v3/farm/daily-logs') && method !== 'GET')).toBe(false);
  });
});

test('a lost draft response is recovered after refresh using the exact original create request', async ({ page }) => {
  await workspaceFixture(page);
  const requests: string[] = [];
  await page.route('**/api/v3/farm/flock-lifecycle/occupancies/search?**', route => route.fulfill({
    json: { code: 200, data: { items: [house], nextCursor: null } },
  }));
  await page.route('**/api/v3/farm/flock-lifecycle/balances', route => route.fulfill({
    json: { code: 200, data: [house] },
  }));
  await page.route('**/api/lookup/users**', route => route.fulfill({
    json: { code: 200, data: [{ username: 'fixture', real_name_zh: 'Fixture', status: 'ACTIVE' }] },
  }));
  await page.route('**/api/upload/contract', route => route.fulfill({
    status: 201, json: { fileId: 'FILE-fixture-evidence' },
  }));
  await page.route('**/api/v3/farm/flock-lifecycle/documents', route => {
    requests.push(route.request().postData() ?? '');
    if (requests.length <= 3) return route.abort('connectionreset');
    return route.fulfill({ status: 201, json: { code: 201, data: { ...document, status: 'DRAFT', version: 0 } } });
  });
  await page.goto(`/breeding/flock-lifecycle/losses?kind=MORTALITY&formHouseCode=H0&date=${date}`);
  const form = page.getByRole('dialog');
  await form.getByLabel(/实际羽数/).fill('3');
  await form.getByLabel(/实际处置方式/).fill('Fixture disposal');
  await form.getByLabel(/接收确认人/).fill('Fixture receiver');
  await form.getByLabel(/业务原因或交接说明/).fill('Fixture count');
  await form.getByRole('combobox', { name: '责任人' }).selectOption('fixture');
  await form.locator('input[type=file]').first().setInputFiles({
    name: 'fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n'),
  });
  await expect(form.locator('input[type=file]').first()).toBeEnabled();
  await form.getByRole('button', { name: '保存草稿' }).click();
  await expect.poll(() => requests.length).toBe(3);
  const retry = page.getByRole('button', { name: '用原请求查回单据' });
  await expect(retry).toBeEnabled();
  await page.reload();
  await retry.click();
  await expect.poll(() => requests.length).toBe(4);
  expect(new Set(requests).size).toBe(1);
  expect(JSON.parse(requests[1])).toMatchObject({
    flockNo: 'FL0', houseCode: 'H0', businessDate: date, quantity: 3,
    expectedVersion: 1, evidence: ['FILE-fixture-evidence'],
  });
  await expect(page).toHaveURL(new RegExp('doc=' + id));
});
