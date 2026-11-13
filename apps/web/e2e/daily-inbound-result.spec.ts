import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

const user = {
  username: 'inbound-fixture', role: 'ROLE_FARM_MGR', roles: ['ROLE_FARM_MGR'],
  permissions: ['MENU_PROD_INBOUND:V,C'], store_code: 'FIXTURE-COMPANY',
};
const codes = ['GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY'];
const confirmation = '确认入库（形成销售库存）';
const receiptContext = { eggDate: '2026-10-16', companyCode: 'FIXTURE-COMPANY', siteCode: 'FIXTURE-SITE', warehouseCode: 'FIXTURE-W1', locationCode: 'FIXTURE-L1' };
const inputFor = (page: Page, code = 'GRADE_0') => page.locator('table tbody tr').filter({ has: page.getByRole('cell', { name: code, exact: true }) }).locator('input');
const selectorFor = (page: Page, value: string) => page.locator('select').filter({ has: page.locator(`option[value="${value}"]`) });

async function prepareInbound(page: Page) {
  await page.goto('/breeding/daily-inbound');
  await expect(page.getByRole('button', { name: confirmation, exact: true })).toBeEnabled();
  await page.locator('input[type=date]').fill('2026-10-16');
  await selectorFor(page, 'FIXTURE-H1').selectOption('FIXTURE-H1');
  await expect(page.getByText('归属预览：公司 FIXTURE-COMPANY · 场站 FIXTURE-SITE', { exact: true })).toBeVisible();
  await selectorFor(page, 'FIXTURE-W1').selectOption('FIXTURE-W1');
  await selectorFor(page, 'FIXTURE-L1').selectOption('FIXTURE-L1');
  await inputFor(page).fill('11');
}

// Only this independent page may issue production-inbound; all API data is intercepted.
test.beforeEach(async ({ page }, testInfo) => {
  await authenticateMockPage(page, {
    ...user, permissions: testInfo.title.startsWith('view-only') ? ['MENU_PROD_INBOUND:V'] : user.permissions,
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    let json: unknown = [];
    if (path === '/api/v2/inventory/source/mode') json = { mode: 'TEMP_PRODUCTION_INBOUND' };
    if (path === '/api/lookup/houses') json = [{ houseCode: 'FIXTURE-H1', houseName: '测试鸡舍', houseNameLo: 'ເຮືອນທົດສອບ', companyCode: 'FIXTURE-COMPANY', siteCode: 'FIXTURE-SITE', ownershipResolved: true }];
    if (path === '/api/lookup/warehouses') json = [{ warehouseCode: 'FIXTURE-W1', warehouseName: '测试蛋库' }];
    if (path === '/api/crud/wms_locations') json = [
      { location_code: 'FIXTURE-L1', location_name: '测试库位', warehouse_code: 'FIXTURE-W1', status: 'ACTIVE' },
      { location_code: 'OTHER-WAREHOUSE', location_name: '不可跨仓', warehouse_code: 'OTHER-W', status: 'ACTIVE' },
      { location_code: 'INACTIVE-LOCATION', warehouse_code: 'FIXTURE-W1', status: 'INACTIVE' },
    ];
    if (path === '/api/lookup/product-grades') json = codes.map((grade_code, sort_order) => ({ grade_code, grade_name: `测试-${grade_code}`, sort_order, status: 'ACTIVE', is_saleable: grade_code !== 'DIRTY', is_storable: true }));
    await route.fulfill({ json });
  });
});

for (const scenario of ['success', 'rejected', 'forbidden', 'invalid-json', 'invalid-fields', 'body-error', 'wrong-context', 'timeout', 'offline', 'server-error'] as const) {
  test(`independent inbound result: ${scenario}`, async ({ page }) => {
    const bodies: Array<Record<string, unknown>> = [];
    const pageErrors: string[] = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/api/v2/inventory/production-inbound', async route => {
      expect(route.request().method()).toBe('POST');
      const body = route.request().postDataJSON();
      bodies.push(body);
      if (scenario === 'timeout' || scenario === 'offline') return route.abort(scenario === 'timeout' ? 'timedout' : 'internetdisconnected');
      if (scenario === 'invalid-json') return route.fulfill({ status: 201, body: '<html>lost acknowledgement</html>' });
      if (scenario === 'invalid-fields') return route.fulfill({ status: 201, json: { ...receiptContext, mode: 'TEMP_PRODUCTION_INBOUND', batches: [], totalInbound: 11 } });
      if (scenario === 'body-error' || scenario === 'wrong-context') return route.fulfill({ status: 201, json: {
        ...receiptContext, mode: 'TEMP_PRODUCTION_INBOUND', batches: [{ batchNo: 'fixture-batch-1', grade: 'GRADE_0', qty: 11 }], totalInbound: 11,
        ...(scenario === 'body-error' ? { code: 400, message: 'fixture SKU unavailable' } : { companyCode: 'OTHER-COMPANY' }),
      } });
      if (scenario === 'rejected' || scenario === 'forbidden') return route.fulfill({ status: scenario === 'rejected' ? 400 : 403, json: { message: 'fixture SKU unavailable' } });
      if (scenario === 'server-error') return route.fulfill({ status: 502, json: { message: 'proxy failed after commit' } });
      return route.fulfill({ status: 201, json: { ...receiptContext, mode: 'TEMP_PRODUCTION_INBOUND', batches: [{ batchNo: 'fixture-batch-1', grade: 'GRADE_0', qty: 11 }], totalInbound: 11 } });
    });
    await prepareInbound(page);
    expect(bodies).toHaveLength(0);
    await page.getByRole('button', { name: confirmation, exact: true }).click();
    if (scenario === 'success') {
      await expect(page.getByText(/入库成功 · 合计/)).toHaveText(/11.*1.*个可售批次/);
      await expect(page.getByRole('cell', { name: 'fixture-batch-1', exact: true })).toBeVisible();
      await expect(inputFor(page)).toHaveValue('');
    } else if (scenario === 'rejected' || scenario === 'forbidden') {
      await expect(page.getByText('fixture SKU unavailable', { exact: true }).first()).toBeVisible();
      await expect(inputFor(page)).toHaveValue('11');
    } else {
      // Invalid/lost acknowledgements cannot prove failure OR success after a possible write.
      await expect(page.getByText('结果未确认，请先核对入库台账，不要重复提交', { exact: true })).toBeVisible();
      await expect(inputFor(page)).toHaveValue('11');
    }
    if (scenario !== 'success') await expect(page.getByText(/入库成功 · 合计/)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    const retryable = ['timeout', 'offline', 'server-error'].includes(scenario);
    expect(bodies).toHaveLength(retryable ? 3 : 1);
    expect(bodies[0]).toMatchObject({ eggDate: '2026-10-16', houseCode: 'FIXTURE-H1', companyCode: 'FIXTURE-COMPANY', siteCode: 'FIXTURE-SITE', warehouseCode: 'FIXTURE-W1', locationCode: 'FIXTURE-L1', items: [{ grade: 'GRADE_0', qty: 11 }] });
    expect(bodies[0].idempotencyKey).toEqual(expect.any(String));
    expect(String(bodies[0].idempotencyKey).length).toBeGreaterThan(0);
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });
}

test('explicit replay reuses the day/house idempotency key and displays the existing batch', async ({ page }) => {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/v2/inventory/production-inbound', async route => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: bodies.length === 1 ? 201 : 200, json: { ...receiptContext, mode: 'TEMP_PRODUCTION_INBOUND', batches: [{ batchNo: 'existing-fixture-batch', grade: 'GRADE_0', qty: 11 }], totalInbound: 11 } });
  });
  await prepareInbound(page);
  await page.getByRole('button', { name: confirmation, exact: true }).click();
  await expect(page.getByRole('cell', { name: 'existing-fixture-batch', exact: true })).toBeVisible();
  await inputFor(page).fill('11');
  await page.getByRole('button', { name: confirmation, exact: true }).click();
  await expect(inputFor(page)).toHaveValue('');
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await expect(page.getByRole('cell', { name: 'existing-fixture-batch', exact: true })).toHaveCount(1);
});

test('view-only inbound permission cannot confirm inventory', async ({ page }) => {
  await page.goto('/breeding/daily-inbound');
  await expect(page.getByRole('button', { name: confirmation, exact: true })).toBeDisabled();
  await expect(page.getByText('当前账号无录入权限（需 MENU_PROD_INBOUND 的 C 权限）', { exact: true })).toBeVisible();
});

test('packaging source mode forbids the direct inbound entry', async ({ page }) => {
  await page.route('**/api/v2/inventory/source/mode', route => route.fulfill({ json: { mode: 'PACKAGING_INBOUND' } }));
  await page.goto('/breeding/daily-inbound');
  await expect(page.getByText('已启用包装入库模式（PACKAGING_INBOUND）', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: confirmation, exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '前往包装作业', exact: true })).toHaveAttribute('href', '/packaging');
});

test('prefill reads saved day/house grades and keeps warehouse/location scope', async ({ page }) => {
  const queries: URL[] = [];
  await page.route('**/api/v3/farm/daily-logs/eggs-breakdown?**', async route => {
    queries.push(new URL(route.request().url()));
    await route.fulfill({ json: { eggsByGrade: { GRADE_0: 7, GRADE_1: 4, DIRTY: 20, UNKNOWN: 99 }, total: 31, logs: 1, missingBreakdownLogs: 0, reportedEggs: 31 } });
  });
  const warehouseQueries: URL[] = [];
  await page.route('**/api/lookup/warehouses?**', async route => {
    warehouseQueries.push(new URL(route.request().url()));
    await route.fallback();
  });
  await prepareInbound(page);
  // All stock-managed grades, including defect grades, are now visible in the
  // daily inbound form. Keep the assertion coupled to the fixture catalog.
  await expect(page.locator('table tbody input')).toHaveCount(codes.length);
  const location = selectorFor(page, 'FIXTURE-L1');
  await expect(location.locator('option[value=OTHER-WAREHOUSE]')).toHaveCount(0);
  await expect(location.locator('option[value=INACTIVE-LOCATION]')).toHaveCount(0);
  expect(warehouseQueries.some(url => url.searchParams.get('companyCode') === 'FIXTURE-COMPANY' && url.searchParams.get('siteCode') === 'FIXTURE-SITE' && url.searchParams.get('type') === 'EGG_FARM')).toBe(true);
  await page.getByRole('button', { name: '从日报预填', exact: true }).click();
  await expect(inputFor(page)).toHaveValue('7');
  await expect(inputFor(page, 'GRADE_1')).toHaveValue('4');
  expect(queries).toHaveLength(1);
  expect(Object.fromEntries(queries[0].searchParams)).toEqual({ date: '2026-10-16', houseCode: 'FIXTURE-H1' });
  await expect(page.getByText('UNKNOWN', { exact: true })).toHaveCount(0);
});

test('missing saved breakdown cannot silently replace manually entered inbound quantities', async ({ page }) => {
  await page.route('**/api/v3/farm/daily-logs/eggs-breakdown?**', route => route.fulfill({ json: { eggsByGrade: {}, total: 0, logs: 1, missingBreakdownLogs: 1, reportedEggs: 11 } }));
  await prepareInbound(page);
  await page.getByRole('button', { name: '从日报预填', exact: true }).click();
  await expect(page.getByText(/日报已存在，但有班次未录九档分级/)).toBeVisible();
  await expect(inputFor(page)).toHaveValue('11');
  await expect(page.getByText(/入库成功 · 合计/)).toHaveCount(0);
});
