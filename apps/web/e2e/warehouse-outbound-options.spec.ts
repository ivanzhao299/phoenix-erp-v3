import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';
import { OUTBOUND_DESTINATIONS, STANDALONE_OUTBOUND_TYPES, ISSUE_OUTBOUND_TYPES } from '../src/lib/warehouse-outbound';

for (const identity of ['admin', 'inout-only', 'issue-only', 'no-create']) {
  test(`outbound dictionary, permissions and destination clearing: ${identity}`, async ({ page }) => {
    const permissions = identity === 'admin' ? ['*'] : [identity === 'inout-only' ? 'MENU_WMS_INOUT:V,C' : 'MENU_WMS_INOUT:V', ...(identity === 'issue-only' ? ['MENU_WMS_ISSUE:V,C'] : [])];
    await authenticateMockPage(page, { username: identity, role: identity === 'admin' ? 'ROLE_ADMIN' : 'ROLE_FIXTURE', roles: identity === 'admin' ? ['ROLE_ADMIN'] : ['ROLE_FIXTURE'], permissions });
    await page.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') throw Error('Unexpected fixture mutation');
      const path = new URL(route.request().url()).pathname;
      let json: unknown = [];
      if (path === '/api/crud/sys_dict') json = [
        ...[...STANDALONE_OUTBOUND_TYPES, 'TRANSFER', 'STOCKTAKE_LOSS', 'INACTIVE_TYPE'].map(code => ({ dict_type: 'INV_OUTBOUND_TYPE', dict_code: code, dict_label_zh: `字典-${code}`, status: code === 'INACTIVE_TYPE' ? 'INACTIVE' : 'ACTIVE' })),
        ...[...new Set(Object.values(OUTBOUND_DESTINATIONS).flat())].map(code => ({ dict_type: 'INV_OUTBOUND_DEST_TYPE', dict_code: code, dict_label_zh: code, status: 'ACTIVE' })),
      ];
      await route.fulfill({ json });
    });
    await page.goto('/warehouse/outbound');
    const create = page.getByRole('button', { name: '新建出库/领用单', exact: true });
    if (identity === 'no-create') { await expect(create).toHaveCount(0); return; }
    await create.click();
    // BatchDocumentEditor has wrapping labels under a div, not the legacy form.
    const type = page.locator('label').filter({ hasText: '出库类型' }).locator('select');
    const dest = page.locator('label').filter({ hasText: '去向类型' }).locator('select');
    const expected = identity === 'admin' ? [...STANDALONE_OUTBOUND_TYPES] : identity === 'inout-only' ? ['SALE', 'SCRAP', 'RETURN'] : [...ISSUE_OUTBOUND_TYPES];
    await expect.poll(async () => type.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(expected);
    await expect(type).toHaveValue(expected[0]);
    await expect(type.locator('option[value="TRANSFER"], option[value="STOCKTAKE_LOSS"], option[value="INACTIVE_TYPE"]')).toHaveCount(0);
    for (const value of expected) {
      await type.selectOption(value);
      await expect.poll(async () => dest.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual([...OUTBOUND_DESTINATIONS[value]]);
      expect(OUTBOUND_DESTINATIONS[value]).toContain(await dest.inputValue());
    }
    if (identity === 'admin' || identity === 'inout-only') {
      await type.selectOption('SCRAP');
      await page.getByLabel('去向', { exact: true }).fill('stale recipient');
      await type.selectOption('RETURN');
      await type.selectOption('SCRAP');
      await expect(page.getByLabel('去向', { exact: true })).toHaveValue('');
    }
  });
}

test('PDA checks every saved allocation and displays the durable loading receipt', async ({ page }) => {
  await authenticateMockPage(page, { username: 'shipping-fixture', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] });
  const path = '/api/v2/sales/delivery/warehouse-loading';
  const header = { id: '91', delivery_no: 'DO-FIXTURE', fulfillment_warehouse_code: 'WH-FIXTURE', status: 'LOADING' };
  const items = [
    { allocation_id: '1', order_line_id: '11', order_no: 'SO-FIXTURE', batch_no: 'BATCH-A', qty: '6', unit: 'kg' },
    { allocation_id: '2', order_line_id: '11', order_no: 'SO-FIXTURE', batch_no: 'BATCH-B', qty: '4', unit: 'kg' },
  ];
  const receipt = items.map((row, index) => ({ ...row, ledger_id: String(index + 301) }));
  let confirmed = false;
  const requests: unknown[] = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === path + '/91' && route.request().method() === 'POST') {
      confirmed = true;
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: { delivery_no: header.delivery_no, items: receipt } });
    }
    if (url.pathname === path) {
      if (url.searchParams.has('delivery_no')) return route.fulfill({
        json: { ...header, status: confirmed ? 'LOADED' : 'LOADING', items: confirmed ? receipt : items },
      });
      return route.fulfill({ json: confirmed ? [] : [header] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/terminal/wms/outbound');
  const fullscreen = page.getByText('点击进入全屏模式');
  if (await fullscreen.isVisible().catch(() => false)) await fullscreen.click();
  await page.getByRole('button', { name: /DO-FIXTURE.*WH-FIXTURE/ }).click();
  const submit = page.getByRole('button', { name: '确认完成装车' });
  await page.getByLabel('扫码核对批次').nth(0).fill('BATCH-A');
  await page.getByLabel('实装数量').nth(0).fill('6');
  await submit.click();
  await expect(page.getByRole('alert')).toHaveText('请逐行核对批次及实装数量');
  expect(requests).toEqual([]);
  await page.getByLabel('扫码核对批次').nth(1).fill('BATCH-B');
  await page.getByLabel('实装数量').nth(1).fill('4');
  await submit.click();
  await expect(page.getByText('装车过账已确认')).toBeVisible();
  await expect(page.getByText('11 · BATCH-B · 4 kg · 302')).toBeVisible();
  expect(requests).toEqual([{ items: items.map(({ allocation_id, order_line_id, batch_no, qty }) => ({ allocation_id, order_line_id, batch_no, qty })) }]);
  await page.reload();
  if (await fullscreen.isVisible().catch(() => false)) await fullscreen.click();
  await page.getByLabel('配送单号').fill('DO-FIXTURE');
  await page.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.getByText('11 · BATCH-A · 6 kg · 301')).toBeVisible();
  expect(requests).toHaveLength(1);
});
