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

async function bodyOf(response: { json(): Promise<any> }) {
  const body = await response.json();
  return body?.data ?? body;
}

async function requestRow(api: Awaited<ReturnType<typeof apiFor>>, id: number) {
  const response = await api.get('/api/v2/store-replenishments');
  expect(response.ok()).toBeTruthy();
  return (await bodyOf(response)).find((item: { id: number }) => Number(item.id) === id);
}

test.describe.serial('store replenishment manager + warehouse lifecycle', () => {
  test('create, submit, inventory rejection, approve, dispatch and receive branches', async ({ baseURL }) => {
    const { fixture, manager, warehouse } = requiredConfig();
    const managerApi = await apiFor(baseURL!, manager);
    const warehouseApi = await apiFor(baseURL!, warehouse);
    const create = await managerApi.post('/api/v2/store-replenishments', { data: { storeCode: fixture.storeCode, sourceWarehouseCode: fixture.sourceWarehouseCode, urgency: 'NORMAL', reason: 'Playwright lifecycle', lines: [{ skuCode: fixture.skuCode, qty: fixture.qty }] } });
    expect(create.ok()).toBeTruthy();
    const row = await bodyOf(create);
    expect(row.request_no).toMatch(/^SR-/);
    expect((await managerApi.post(`/api/v2/store-replenishments/${row.id}/submit`)).ok()).toBeTruthy();
    const approval = await warehouseApi.post(`/api/v2/store-replenishments/${row.id}/approve`, { data: { sourceWarehouseCode: fixture.sourceWarehouseCode } });
    if (!approval.ok()) {
      expect((await approval.text()).toLowerCase()).toMatch(/库存|stock|available/);
      expect((await requestRow(managerApi, row.id))?.status).toBe('SUBMITTED');
      return;
    }
    expect((await warehouseApi.post(`/api/v2/store-replenishments/${row.id}/dispatch`)).ok()).toBeTruthy();
    const transferResponse = await managerApi.get(`/api/v2/store-replenishments/${row.id}/transfer`);
    expect(transferResponse.ok()).toBeTruthy();
    const transfer = await bodyOf(transferResponse);
    expect(transfer.items.length).toBeGreaterThan(0);
    const partial = transfer.items.map((item: any, index: number) => ({ batch_no: item.source_batch_no, received_qty: index ? Number(item.expected_qty) : Math.max(0, Number(item.expected_qty) - 1), damaged_qty: 0, note: 'Playwright short receive' }));
    expect((await managerApi.post(`/api/v2/store-replenishments/${row.id}/receive`, { data: { items: partial } })).ok()).toBeTruthy();
    const after = await bodyOf(await managerApi.get(`/api/v2/store-replenishments/${row.id}/transfer`));
    const pending = after.discrepancies.filter((x: any) => !x.resolved_at);
    if (pending.length) expect((await managerApi.post(`/api/v2/store-replenishments/${row.id}/close`, { data: { resolutions: pending.map((x: any) => ({ id: x.id, resolution_type: 'ADJUSTMENT', resolution_ref: `PW-ADJ-${row.id}-${x.id}` })) } })).ok()).toBeTruthy();
    expect((await requestRow(managerApi, row.id))?.status).toBe('CLOSED');
  });

  test('manager UI exposes the safe orchestration workbench on desktop and mobile', async ({ page, baseURL }) => {
    const { manager } = requiredConfig();
    await page.goto('/login?return=/store/replenish');
    await page.getByPlaceholder(/账户名|username/i).fill(manager.username!);
    await page.getByPlaceholder(/密码|password/i).fill(manager.password!);
    await page.getByRole('button', { name: /登\s*录|log in/i }).click();
    await page.goto('/store/replenish');
    await expect(page.getByRole('heading', { name: /门店补货编排|replenishment orchestration/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /新建补货申请|new replenishment/i })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: /门店补货编排|replenishment orchestration/i })).toBeVisible();
  });
});
