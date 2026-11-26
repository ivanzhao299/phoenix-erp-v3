import { expect, request, test } from '@playwright/test';
import { loadReplenishmentFixture } from './support/replenishment-fixture';

const manager = { username: process.env.REPLENISH_MANAGER_USER, password: process.env.REPLENISH_MANAGER_PASSWORD };
const warehouse = { username: process.env.REPLENISH_WMS_USER, password: process.env.REPLENISH_WMS_PASSWORD };

function requiredConfig() {
  if (!manager.username || !manager.password || !warehouse.username || !warehouse.password) {
    throw new Error('store-replenishment E2E requires isolated manager and WMS credentials (REPLENISH_MANAGER_USER/PASSWORD and REPLENISH_WMS_USER/PASSWORD)');
  }
  return { fixture: loadReplenishmentFixture(), manager, warehouse };
}

async function token(baseURL: string, credentials: { username?: string; password?: string }) {
  const api = await request.newContext({ baseURL });
  const response = await api.post('/api/auth/login', { data: credentials });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body?.data?.access_token || body?.data?.token || body?.access_token || body?.token;
}

async function apiFor(baseURL: string, credentials: typeof manager) {
  return request.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${await token(baseURL, credentials)}` } });
}

async function bodyOf(response: { json(): Promise<unknown> }): Promise<unknown> {
  const body = await response.json();
  if (body && typeof body === 'object' && 'data' in body) return (body as { data?: unknown }).data ?? body;
  return body;
}

async function requestRow(api: Awaited<ReturnType<typeof apiFor>>, id: number) {
  const response = await api.get('/api/v2/store-replenishments');
  expect(response.ok()).toBeTruthy();
  const body = await bodyOf(response);
  const items = Array.isArray(body) ? body : [];
  return items.find(item => item && typeof item === 'object' && String((item as { id?: unknown }).id) === String(id)) as { status?: string } | undefined;
}

test.describe.serial('store replenishment manager + warehouse lifecycle', () => {
  for (const scenario of ['full', 'shortage'] as const) {
    test(`create, approve, dispatch and receive replenishment: ${scenario}`, async ({ baseURL }) => {
      const { fixture, manager, warehouse } = requiredConfig();
      const managerApi = await apiFor(baseURL!, manager);
      const warehouseApi = await apiFor(baseURL!, warehouse);
      try {
        const create = await managerApi.post('/api/v2/store-replenishments', { data: {
          storeCode: fixture.storeCode, sourceWarehouseCode: fixture.sourceWarehouseCode,
          urgency: 'NORMAL', reason: `Playwright receipt: ${scenario}`, lines: [{ skuCode: fixture.skuCode, qty: fixture.qty }],
        } });
        expect(create.ok(), `create replenishment status=${create.status()} body=${await create.text()}`).toBeTruthy();
        const row = await bodyOf(create) as { id: number; request_no: string };
        const requestPath = `/api/v2/store-replenishments/${row.id}`;
        expect(row.request_no).toMatch(/^SR-/);
        expect((await managerApi.post(`${requestPath}/submit`)).ok()).toBeTruthy();
        const approval = await warehouseApi.post(`${requestPath}/approve`, { data: { sourceWarehouseCode: fixture.sourceWarehouseCode } });
        expect(approval.ok(), `approve status=${approval.status()} body=${await approval.text()}`).toBeTruthy();
        const dispatch = await warehouseApi.post(`${requestPath}/dispatch`);
        expect(dispatch.ok(), `dispatch status=${dispatch.status()} body=${await dispatch.text()}`).toBeTruthy();
        const transferResponse = await managerApi.get(`${requestPath}/transfer`);
        expect(transferResponse.ok()).toBeTruthy();
        const transfer = await bodyOf(transferResponse) as { items: Array<{ source_batch_no: string; expected_qty: number }> };
        expect(transfer.items.length).toBeGreaterThan(0);
        const items = transfer.items.map((item, index) => ({
          batch_no: item.source_batch_no,
          received_qty: scenario === 'shortage' && index === 0 ? 0 : Number(item.expected_qty),
          damaged_qty: 0,
          note: `Playwright receipt: ${scenario}`,
        }));
        const receive = await managerApi.post(`${requestPath}/receive`, { data: { items } });
        expect(receive.ok(), `receive status=${receive.status()} body=${await receive.text()}`).toBeTruthy();
        if (scenario === 'full') {
          expect((await requestRow(managerApi, row.id))?.status).toBe('CLOSED');
        } else {
          const detail = await bodyOf(await managerApi.get(`${requestPath}/transfer`)) as {
            discrepancies: Array<{ id: string; discrepancy_type: string; resolved_at?: string | null }>;
          };
          const pending = detail.discrepancies.filter(discrepancy => !discrepancy.resolved_at);
          expect(pending.map(discrepancy => discrepancy.discrepancy_type)).toEqual(['SHORTAGE']);
          const close = await managerApi.post(`${requestPath}/close`, { data: {
            resolutions: pending.map(({ id }) => ({ id, resolution_type: 'ADJUSTMENT', resolution_ref: `PW-ADJ-${row.id}-${id}` })),
          } });
          expect(close.status()).toBe(409);
          expect((await requestRow(managerApi, row.id))?.status).toBe('RECEIVED');
        }
      } finally {
        await Promise.all([managerApi.dispose(), warehouseApi.dispose()]);
      }
    });
  }

  test('manager UI exposes the safe orchestration workbench on desktop and mobile', async ({ page }) => {
    const { manager } = requiredConfig();
    await page.goto('/login?return=/store/replenish');
    await page.getByPlaceholder(/账户名|username/i).fill(manager.username!);
    await page.getByPlaceholder(/密码|password/i).fill(manager.password!);
    const loginResponse = page.waitForResponse(response => response.url().includes('/api/auth/login') && response.request().method() === 'POST');
    await page.getByRole('button', { name: /登\s*录|log in/i }).click();
    const response = await loginResponse;
    expect(response.ok()).toBeTruthy();
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('phoenix_token'))).toBeTruthy();
    await page.goto('/store/replenish');
    await expect(page.getByRole('heading', { name: /门店补货编排|replenishment orchestration/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /新建补货申请|new replenishment/i })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: /门店补货编排|replenishment orchestration/i })).toBeVisible();
  });
});
