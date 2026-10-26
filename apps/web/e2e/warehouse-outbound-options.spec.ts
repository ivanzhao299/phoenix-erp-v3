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
    const field = (label: string) => page.locator('form label').filter({ hasText: label }).locator('..');
    const type = field('出库类型').locator('select');
    const dest = field('去向类型').locator('select');
    const expected = identity === 'admin' ? [...STANDALONE_OUTBOUND_TYPES] : identity === 'inout-only' ? ['SALE', 'SCRAP', 'RETURN'] : [...ISSUE_OUTBOUND_TYPES];
    await expect.poll(async () => type.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual(expected);
    for (const value of expected) {
      await type.selectOption(value);
      await expect.poll(async () => dest.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))).toEqual([...OUTBOUND_DESTINATIONS[value]]);
      expect(OUTBOUND_DESTINATIONS[value]).toContain(await dest.inputValue());
    }
    if (identity === 'admin' || identity === 'inout-only') {
      await type.selectOption('SCRAP');
      await field('其他去向').locator('input').fill('stale recipient');
      await type.selectOption('RETURN');
      await type.selectOption('SCRAP');
      await expect(field('其他去向').locator('input')).toHaveValue('');
    }
  });
}
