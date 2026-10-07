import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

const USER = { username: 'e2e-admin', name: 'E2E Admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };

async function authenticate(page: Page, lang = 'zh') {
  await authenticateMockPage(page, USER, lang);
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

test('flock quantity unit follows an in-page language round trip without refresh', async ({ page }) => {
  await authenticate(page, 'zh');
  const flock = {
    flock_no: 'PW-FLOCK-LANG-SWITCH', farm_code: 'PW-FARM', farm_name: '测试养殖场',
    house_code: 'PW-HOUSE', breed_type: '海兰褐', source_farm: '', start_date: '2026-01-01',
    current_qty: 900, placement_age: 1, cost: 1, target_weeks: 80, status: 'LAYING',
  };
  await page.route('**/api/crud/brd_flocks**', route => route.fulfill({ json: [flock] }));
  await page.route('**/api/crud/brd_farms**', route => route.fulfill({ json: [{ farm_code: 'PW-FARM', farm_name: '测试养殖场' }] }));
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ json: [{ house_code: 'PW-HOUSE', farm_code: 'PW-FARM', house_name: '测试鸡舍', house_type: 'LAYER' }] }));
  await page.route('**/api/crud/sys_dict**', route => route.fulfill({ json: [] }));
  await page.route('**/api/master-data/runtime/supplier/active**', route => route.fulfill({ json: [] }));

  await page.goto('/breeding/flock');
  const row = page.locator('tbody tr').filter({ hasText: 'PW-FLOCK-LANG-SWITCH' });
  await expect(row).toContainText('900羽');

  await page.locator('header select').selectOption('lo');
  await expect(row).toContainText('900ຂົນ');

  await page.locator('header select').selectOption('zh');
  await expect(row).toContainText('900羽');
});

for (const translated of [false, true]) test(`flock name/code labels rehydrate late masters, language and search (${translated ? 'localized' : 'canonical'})`, async ({ page }) => {
  await authenticate(page);
  const farm = { farm_code: 'LPH_MENGSAI', farm_name: '孟赛蛋鸡场', status: 'ACTIVE', ...(translated ? { farmNameZh: '孟赛蛋鸡场', farmNameEn: 'Mengsai farm', farmNameLo: 'ຟາມເມັງໄຊ' } : {}) };
  const house = { farm_code: farm.farm_code, house_code: 'HOUSE_MS_02', house_name: '2号鸡舍', status: 'ACTIVE', ...(translated ? { house_name_en: 'House Two', house_name_lo: 'ເຮືອນສອງ' } : {}) };
  await page.route('**/api/crud/brd_flocks**', route => route.fulfill({ json: [{ flock_no: 'ACCEPTANCE-FLOCK', farm_code: farm.farm_code, farm_name: farm.farm_code, house_code: house.house_code, breed_type: '海兰褐', status: 'LAYING', current_qty: 100 }] }));
  await page.route('**/api/crud/brd_farms**', async route => { await new Promise(resolve => setTimeout(resolve, 250)); await route.fulfill({ json: [farm] }); });
  await page.route('**/api/crud/brd_houses**', async route => { await new Promise(resolve => setTimeout(resolve, 350)); await route.fulfill({ json: [house] }); });
  await page.route('**/api/crud/sys_dict**', route => route.fulfill({ json: [] }));
  await page.route('**/api/master-data/runtime/supplier/active**', route => route.fulfill({ json: [] }));
  await page.goto('/breeding/flock');
  const row = page.locator('tbody tr').filter({ hasText: 'ACCEPTANCE-FLOCK' });
  const farmCell = row.locator('td').nth(1);
  const houseCell = row.locator('td').nth(2);
  for (const lang of ['zh', 'lo', 'en', 'zh']) {
    await page.locator('header select').selectOption(lang);
    const farmName = translated && lang === 'en' ? 'Mengsai farm' : translated && lang === 'lo' ? 'ຟາມເມັງໄຊ' : farm.farm_name;
    const houseName = translated && lang === 'en' ? 'House Two' : translated && lang === 'lo' ? 'ເຮືອນສອງ' : house.house_name;
    await expect(farmCell.locator('div > div').first()).toHaveText(farmName);
    await expect(farmCell).toContainText(farm.farm_code);
    await expect(houseCell.locator('div > div').first()).toHaveText(houseName);
    await expect(houseCell).toContainText(house.house_code);
  }
  const search = page.locator('input.phx-input').first();
  for (const query of ['ACCEPTANCE-FLOCK', farm.farm_code, farm.farm_name, house.house_code, house.house_name, '海兰褐']) {
    await search.fill(query);
    await expect(row).toBeVisible();
  }
  await search.fill('UNMATCHED');
  await expect(row).toHaveCount(0);
  await search.fill('');
  await row.locator('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('select').nth(0)).toContainText(`${farm.farm_name}（${farm.farm_code}）`);
  await expect(dialog.locator('select').nth(1)).toContainText(`${house.house_name}（${house.house_code}）`);
  await dialog.locator('select').nth(0).selectOption('');
  await expect(dialog.locator('select').nth(1)).toBeDisabled();
  await expect(dialog.locator('select').nth(1)).toHaveValue('');
});

test('flock missing-name fallback displays each code once; henhouse keeps the reference hierarchy', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/crud/brd_flocks**', route => route.fulfill({ json: [{ flock_no: 'FALLBACK', farm_code: 'EMPTY-FARM', house_code: 'EMPTY-HOUSE', status: 'LAYING' }] }));
  await page.route('**/api/crud/brd_farms**', route => route.fulfill({ json: [{ farm_code: 'EMPTY-FARM', farm_name: '' }] }));
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ json: [{ house_code: 'EMPTY-HOUSE', house_name: '', farm_code: 'EMPTY-FARM' }] }));
  await page.route('**/api/crud/sys_dict**', route => route.fulfill({ json: [] }));
  await page.goto('/breeding/flock');
  const row = page.locator('tbody tr').filter({ hasText: 'FALLBACK' });
  await expect(row.locator('td').nth(1)).toHaveText('EMPTY-FARM');
  await expect(row.locator('td').nth(2)).toHaveText('EMPTY-HOUSE');
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ json: [{ house_code: 'HOUSE_MS_02', house_name: '2号鸡舍', farm_code: 'EMPTY-FARM', status: 'ACTIVE' }] }));
  await page.goto('/breeding/henhouse');
  const houseCell = page.locator('tbody tr').filter({ hasText: 'HOUSE_MS_02' }).locator('td').first();
  await expect(houseCell.locator('div > div').first()).toHaveText('2号鸡舍');
  await expect(houseCell).toContainText('HOUSE_MS_02');
});

for (const c of [
  { route: '/quality/farm', table: 'qa_inspections', row: { inspect_no: 'QA-1', house_code: 'H-1' }, labels: ['House One（H-1）'] },
  { route: '/quality/backward', table: 'inv_batches', row: { batch_no: 'B-1', warehouse_code: 'WH-1', warehouse_name: 'Warehouse One', warehouse_name_en: 'Warehouse One', location_code: 'LOC-1', location_name: 'Location One' }, labels: ['Warehouse One（WH-1）', 'Location One（LOC-1）'] },
  { route: '/quality/product', table: 'qa_product_inspections', row: { inspect_no: 'QA-P1', sku_code: 'SKU-1' }, labels: ['Egg One（SKU-1）'] },
  { route: '/packaging/inbound', table: 'wms_inbound', row: { inbound_no: 'IN-1', house_code: 'H-1', warehouse: 'WH-1', status: 'PENDING' }, labels: ['House One（H-1）', 'Warehouse One（WH-1）'] },
  { route: '/warehouse/loss-report', table: 'wms_stocktake', row: { stocktake_no: 'LR-1', warehouse_code: 'WH-1', warehouse_name: 'Warehouse One', warehouse_name_en: 'Warehouse One', zone_code: 'ZONE-1', status: 'DRAFT' }, labels: ['Warehouse One（WH-1）', 'Zone One（ZONE-1）'] },
  { route: '/store/losses', table: 'store_losses', row: { loss_no: 'LOSS-1', store_code: 'STORE-1', sku_code: 'SKU-1', status: 'DRAFT' }, labels: ['Store One（STORE-1）', 'Egg One（SKU-1）'] },
]) test(`same-class ${c.route} resolves names through existing scoped reads`, async ({ page }) => {
  await authenticate(page, 'en');
  await page.route('**/api/**', route => route.fulfill({ json: { data: [], total: 0 } }));
  await page.route(`**/api/crud/${c.table}**`, route => route.fulfill({ json: { data: [{ id: 1, ...c.row }], total: 1 } }));
  await page.route('**/api/lookup/houses**', route => route.fulfill({ json: { data: [{ houseCode: 'H-1', houseName: 'House One' }] } }));
  await page.route('**/api/lookup/warehouses**', route => route.fulfill({ json: { data: [{ warehouseCode: 'WH-1', warehouseName: 'Warehouse One' }] } }));
  await page.route('**/api/lookup/stores**', route => route.fulfill({ json: { data: [{ storeCode: 'STORE-1', storeName: 'Store One' }] } }));
  await page.route('**/api/lookup/inventory-items**', route => route.fulfill({ json: { data: [{ itemType: 'SKU', skuCode: 'SKU-1', itemName: 'Egg One' }] } }));
  await page.route('**/api/crud/wms_zones**', route => route.fulfill({ json: { data: [{ zone_code: 'ZONE-1', zone_name: 'Zone One' }] } }));
  await page.goto(c.route);
  for (const label of c.labels) await expect(page.locator('tbody')).toContainText(label);
});

test('breeding alerts distinguish a house code from a historical name without duplicate labels', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', route => route.fulfill({ json: { data: [], total: 0 } }));
  const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await page.route('**/api/crud/brd_medications**', route => route.fulfill({ json: { data: [
    { id: 1, house_code: 'H-1', farm_house: '正式鸡舍', medicine: '药品甲', clear_date: soon },
    { id: 2, farm_house: '历史鸡舍名称', medicine: '药品乙', clear_date: soon },
  ] } }));
  await page.route('**/api/lookup/houses**', route => route.fulfill({ json: { data: [{ houseCode: 'H-1', houseName: '正式鸡舍' }] } }));
  await page.goto('/breeding');
  const mixed = page.locator('p').filter({ hasText: '药品甲' });
  await expect(mixed).toContainText('正式鸡舍（H-1）');
  expect((await mixed.innerText()).match(/正式鸡舍/g)).toHaveLength(1);
  const historical = page.locator('p').filter({ hasText: '药品乙' });
  await expect(historical).toContainText('历史鸡舍名称');
  await expect(historical).not.toContainText('（历史鸡舍名称）');
});
