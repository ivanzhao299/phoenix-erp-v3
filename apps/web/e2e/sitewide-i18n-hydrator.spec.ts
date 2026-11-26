import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

const USER = { username: 'e2e-admin', name: 'E2E Admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };
const BREED_CODE = 'HY_LINE_BROWN';
// Put another valid breed first so preserving this code cannot pass through a
// first-option default. These are real sys_dict rows, not label-only options.
const BREED_DICT = [
  { dict_type: 'BRD_BREED', dict_code: 'HY_LINE_WHITE', dict_value: 'HY_LINE_WHITE', dict_label_zh: '海兰白', dict_label_en: 'Hy-Line White', dict_label_lo: '海兰白', sort_no: 10, status: 'ACTIVE' },
  { dict_type: 'BRD_BREED', dict_code: BREED_CODE, dict_value: BREED_CODE, dict_label_zh: '海兰褐', dict_label_en: 'Hy-Line Brown', dict_label_lo: '海兰褐', sort_no: 20, status: 'ACTIVE' },
];

async function mockBreedDictionary(page: Page, rows = BREED_DICT) {
  await page.route('**/api/crud/sys_dict**', route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('dict_type') !== 'BRD_BREED') return route.fulfill({ json: [] });
    expect(params.get('status')).toBe('ACTIVE');
    return route.fulfill({ json: rows.filter(row => row.status === 'ACTIVE') });
  });
}

async function mockArchive(page: Page, kind: 'flocks' | 'houses', load: () => Record<string, unknown>[], aliases: string[] = []) {
  await page.route('**/api/v3/farm/archive/' + kind + '?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const search = (params.get('search') ?? '').toLowerCase();
    const status = params.get('status');
    const page = Number(params.get('page') ?? 1);
    const matches = load().filter(row => {
      if (status && row.status !== status && !(status === 'LAYING' && row.status === 'ACTIVE')) return false;
      return [...Object.values(row), ...aliases].join(' ').toLowerCase().includes(search);
    });
    return route.fulfill({ json: { items: matches.slice((page - 1) * 25, page * 25),
      total: matches.length, birds: 0, unknown: 0, normal: 0, pageSize: 25 } });
  });
}

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

test('Lao mode preserves readonly flock stock and Chinese restore keeps the latest planning edit', async ({ page }) => {
  await authenticate(page, 'lo');
  const quantity = 150;
  let targetWeeks = 80;
  const flock = () => ({
    flock_no: 'PW-FLOCK-I18N', farm_code: 'PW-FARM', farm_name: '测试养殖场',
    house_code: 'PW-HOUSE', breed_code: BREED_CODE, breed_type: '海兰褐', source_farm: '', start_date: '2026-01-01',
    current_qty: quantity, placement_age: 1, cost: 1, target_weeks: targetWeeks, status: 'LAYING',
  });
  await mockArchive(page, 'flocks', () => [flock()]);
  await page.route('**/api/crud/brd_flocks/**', async route => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON();
      for (const unchanged of ['breed_code', 'breed_type', 'strain', 'start_date', 'current_qty', 'initial_qty']) {
        expect(payload).not.toHaveProperty(unchanged);
      }
      targetWeeks = Number(payload.target_weeks);
      expect(targetWeeks).toBe(90);
      await route.fulfill({ json: { ok: true } });
    } else await route.fallback();
  });
  await page.route('**/api/lookup/farms**', route => route.fulfill({ json: { data: [{ farmCode: 'PW-FARM', farmName: '测试养殖场' }] } }));
  await page.route('**/api/lookup/houses**', route => route.fulfill({ json: { data: [{ houseCode: 'PW-HOUSE', farmCode: 'PW-FARM', houseName: '测试鸡舍' }] } }));
  await page.route('**/api/crud/brd_farms**', route => route.fulfill({ json: [{ farm_code: 'PW-FARM', farm_name: '测试养殖场' }] }));
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ json: [{ house_code: 'PW-HOUSE', farm_code: 'PW-FARM', house_name: '测试鸡舍', house_type: 'LAYER' }] }));
  await mockBreedDictionary(page);
  await page.route('**/api/master-data/runtime/supplier/active**', route => route.fulfill({ json: [] }));

  await page.goto('/breeding/flock');
  const row = page.locator('tbody tr').filter({ hasText: 'PW-FLOCK-I18N' });
  await expect(row).toContainText('150ຂົນ');
  await row.locator('button').first().click();
  const breedSelect = page.getByRole('dialog').locator(`select:has(option[value="${BREED_CODE}"])`);
  await expect(breedSelect).toBeEnabled();
  await expect(breedSelect).toHaveValue(BREED_CODE);
  const dialog = page.getByRole('dialog');
  const stock = dialog.locator('input[type="number"][readonly][value="150"]');
  await expect(stock).toHaveValue('150');
  await expect(stock).not.toBeEditable();
  // Planning metadata remains editable; actual stock belongs to lifecycle documents.
  const inputs = dialog.locator('input[type="number"]');
  const index = await inputs.evaluateAll(nodes => nodes.findIndex(node => (node as HTMLInputElement).value === '80'));
  expect(index).toBeGreaterThanOrEqual(0);
  await inputs.nth(index).fill('90');
  await page.getByRole('dialog').getByRole('button', { name: /保存|ບັນທຶກ/ }).click();
  await expect(row).toContainText('150ຂົນ');
  await expect(row).toContainText('90ອາທິດ');

  await page.locator('header select').selectOption('zh');
  await expect(row).toContainText('150羽');
  await expect(row).toContainText('90周');
});

test('flock archive uses Singapore business days and keeps zero distinct from missing', async ({ page }) => {
  await authenticate(page);
  // Midnight in Singapore is still the preceding UTC day.
  await page.clock.setFixedTime(new Date('2026-11-24T16:10:00Z'));
  await mockBreedDictionary(page);
  const identity = { farm_code: 'PW-FARM', farm_name: '测试养殖场', house_code: 'PW-HOUSE', house_name: '测试鸡舍',
    breed_code: BREED_CODE, status: 'LAYING', start_date: '2026-11-23' };
  let saved = false;
  await mockArchive(page, 'flocks', () => [
    { ...identity, flock_no: 'CYCLE-118', placement_age: saved ? 0 : 118, current_qty: 0, current_lay_rate: '0.00', feed_conversion_ratio: '0.00' },
    { ...identity, flock_no: 'CYCLE-NOT-KNOWN', placement_age: null, current_qty: null },
  ]);
  await page.route('**/api/crud/brd_flocks/**', async route => {
    if (route.request().method() === 'PUT') {
      const patch = route.request().postDataJSON();
      expect(patch).toHaveProperty('placement_age', 0);
      for (const field of ['farm_code', 'farm_name', 'house_code', 'current_qty']) expect(patch).not.toHaveProperty(field);
      saved = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fallback();
  });
  await page.route('**/api/master-data/runtime/supplier/active**', route => route.fulfill({ json: [] }));
  await page.route('**/api/lookup/{farms,houses}**', route => route.fulfill({ json: { data: [] } }));
  const occupancyId = '11111111-1111-4111-8111-111111111111';
  await page.route('**/api/v3/farm/flock-lifecycle/flocks/CYCLE-118/cycle', route => route.fulfill({ json: { code: 200, data: {
    status: 'LAYING', breed_code: BREED_CODE, placement_date: '2026-11-23', placement_age: 118, age_as_of: '2026-11-25',
    house_code: 'PW-HOUSE', house_name: '测试鸡舍', farm_code: 'PW-FARM', farm_name: '测试养殖场',
    current_qty: 0, baseline_on: '2026-11-23', closed_on: null, active_balance: true, occupancy_id: occupancyId,
    admitted_quantity: null, mortality: '0', culled: '0', recorded_eggs_for_admitted: null, report_days: 1,
    production: [{ date: '2026-11-25', eggs: 0, closing_qty: 0 }],
  } } }));
  await page.route('**/api/v3/farm/flock-lifecycle/flocks/CYCLE-118/cycle/care', route => route.fulfill({ json: { code: 200, data: [] } }));
  await page.route('**/api/v3/farm/flock-lifecycle/*/search?**', route => {
    expect(new URL(route.request().url()).searchParams.get('flockNo')).toBe('CYCLE-118');
    return route.fulfill({ json: { code: 200, data: { items: [], nextCursor: null } } });
  });

  await page.goto('/breeding/flock');
  const known = page.getByRole('row').filter({ hasText: 'CYCLE-118' });
  const unknown = page.getByRole('row').filter({ hasText: 'CYCLE-NOT-KNOWN' });
  await expect(known).toContainText('17周 1天');
  await expect(known).toContainText('0羽');
  await expect(known).toContainText('0%');
  await expect(unknown).not.toContainText('0羽');
  await expect(unknown).not.toContainText('0周');
  const cycleButton = known.getByRole('button', { name: '鸡群周期' });
  await cycleButton.focus();
  await page.keyboard.press('Enter');
  const cycle = page.getByRole('dialog', { name: '鸡群周期 · CYCLE-118' });
  await expect(cycle).toBeVisible();
  await expect(cycle.getByText('120天')).toBeVisible();
  await expect(cycle.getByText('资料不足')).toBeVisible();
  await expect(cycle.getByRole('link', { name: '办理整群转舍' })).toHaveAttribute('href',
    `/breeding/flock-lifecycle/transfers?kind=TRANSFER&formHouseCode=PW-HOUSE&formFlockNo=CYCLE-118&occupancyId=${occupancyId}`);
  await page.keyboard.press('Escape');
  await expect(cycle).toHaveCount(0);
  await expect(cycleButton).toBeFocused();

  await known.getByRole('button', { name: '编辑鸡群 CYCLE-118' }).click();
  const edit = page.getByRole('dialog');
  await expect(edit.getByLabel('当前鸡舍')).not.toBeEditable();
  await edit.getByLabel('入舍日龄(天)', { exact: true }).fill('0');
  await edit.getByRole('button', { name: '保存修改' }).click();
  await expect(known).toContainText('0周 2天');
});

for (const scenario of [
  { name: 'missing code with a legacy Chinese label', code: '', status: 'MISSING', dict: BREED_DICT },
  { name: 'unknown historical code', code: 'LEGACY_UNKNOWN', status: 'CATALOG_REVIEW', dict: BREED_DICT },
  { name: 'inactive breed', code: BREED_CODE, status: 'CATALOG_REVIEW', dict: BREED_DICT.map(row => row.dict_code === BREED_CODE ? { ...row, status: 'INACTIVE' } : row) },
  { name: 'dictionary options unavailable with a valid persisted code', code: BREED_CODE, status: 'CONFIRMED', dict: [] },
]) test(`flock keeps breed confirmation separate from profile editing: ${scenario.name}`, async ({ page }) => {
  await authenticate(page);
  await mockBreedDictionary(page, scenario.dict);
  let breedCode = scenario.code;
  let planningSaves = 0;
  let confirmations = 0;
  await mockArchive(page, 'flocks', () => [{
    flock_no: 'PW-FLOCK-REVIEW-BREED', farm_code: 'PW-FARM', house_code: 'PW-HOUSE',
    breed_code: breedCode, breed_type: '海兰褐', strain: '海兰褐', current_qty: 150,
    start_date: '2026-01-01', status: 'LAYING',
  }]);
  await page.route('**/api/crud/brd_flocks/**', route => {
    if (route.request().method() === 'PUT') {
      planningSaves += 1;
      const payload = route.request().postDataJSON();
      for (const unchanged of ['breed_code', 'breed_type', 'strain', 'start_date', 'current_qty']) {
        expect(payload).not.toHaveProperty(unchanged);
      }
      return route.fulfill({ json: { ok: true } });
    }
    return route.fallback();
  });
  await page.route('**/api/v3/farm/flock-lifecycle/flocks/PW-FLOCK-REVIEW-BREED/breed-confirmation', route => {
    if (route.request().method() === 'POST') {
      confirmations += 1;
      expect(scenario.status).toBe('MISSING');
      expect(route.request().postDataJSON()).toEqual({
        houseCode: 'PW-HOUSE', breedCode: BREED_CODE, basis: '入栏原始凭证 PW-01',
      });
      breedCode = BREED_CODE;
      return route.fulfill({ json: { code: 200, data: { breedCode, changed: true, receiptId: '42' } } });
    }
    return route.fulfill({ json: { code: 200, data: {
      houseCode: 'PW-HOUSE', breedCode: scenario.code || null, historicalNames: ['海兰褐'], hasReports: true, status: scenario.status,
    } } });
  });
  await page.route('**/api/lookup/farms**', route => route.fulfill({ json: { data: [{ farmCode: 'PW-FARM', farmName: '测试养殖场', status: 'ACTIVE' }] } }));
  await page.route('**/api/lookup/houses**', route => route.fulfill({ json: { data: [{ houseCode: 'PW-HOUSE', farmCode: 'PW-FARM', houseName: '测试鸡舍', status: 'ACTIVE' }] } }));
  await page.route('**/api/master-data/runtime/supplier/active**', route => route.fulfill({ json: [] }));
  await page.goto('/breeding/flock');
  const row = page.locator('tbody tr').filter({ hasText: 'PW-FLOCK-REVIEW-BREED' });
  await row.getByRole('button', { name: '编辑鸡群 PW-FLOCK-REVIEW-BREED' }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('button', { name: '核对品种', exact: true })).toBeVisible();
  await expect(editor.getByRole('combobox', { name: '鸡群品种' })).toHaveCount(0);
  // Planning edits preserve the stored identity even if the catalog is unavailable.
  await editor.getByLabel('计划产蛋周数(周)', { exact: true }).fill('84');
  await editor.getByRole('button', { name: '保存修改' }).click();
  await expect(page.getByText('更新成功', { exact: true })).toBeVisible();
  expect(planningSaves).toBe(1);
  expect(confirmations).toBe(0);

  await row.getByRole('button', { name: '核对品种', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: '确认遗传品种' });
  if (scenario.status === 'MISSING') {
    const selector = confirmation.getByRole('combobox', { name: '遗传品种', exact: true });
    const confirm = confirmation.getByRole('button', { name: '确认遗传品种', exact: true });
    // Neither a matching legacy label nor the first dictionary option may assign a code.
    await expect(selector).toBeEnabled();
    await expect(selector).toHaveValue('');
    await expect(confirm).toBeDisabled();
    await selector.selectOption(BREED_CODE);
    await expect(confirm).toBeDisabled();
    await confirmation.getByLabel('核对依据（填写原始凭证编号或出处）', { exact: true }).fill('入栏原始凭证 PW-01');
    await confirm.click();
    await expect(page.getByText('品种已确认，审计编号 42', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: '核对品种', exact: true })).toHaveCount(0);
    expect(confirmations).toBe(1);
  } else {
    await expect(confirmation.getByText(scenario.code, { exact: true })).toBeVisible();
    await expect(confirmation.getByText(scenario.status === 'CONFIRMED' ? /已有有效品种标准码/ : /联系品种字典管理员/)).toBeVisible();
    await expect(confirmation.getByRole('button', { name: '确认遗传品种', exact: true })).toHaveCount(0);
    expect(confirmations).toBe(0);
  }
  await expect(row).toContainText('150羽');
});

test('flock quantity unit follows an in-page language round trip without refresh', async ({ page }) => {
  await authenticate(page, 'zh');
  const flock = {
    flock_no: 'PW-FLOCK-LANG-SWITCH', farm_code: 'PW-FARM', farm_name: '测试养殖场',
    house_code: 'PW-HOUSE', breed_code: BREED_CODE, breed_type: '海兰褐', source_farm: '', start_date: '2026-01-01',
    current_qty: 900, placement_age: 1, cost: 1, target_weeks: 80, status: 'LAYING',
  };
  await mockArchive(page, 'flocks', () => [flock]);
  await page.route('**/api/lookup/farms**', route => route.fulfill({ json: { data: [{ farmCode: 'PW-FARM', farmName: '测试养殖场' }] } }));
  await page.route('**/api/lookup/houses**', route => route.fulfill({ json: { data: [{ houseCode: 'PW-HOUSE', farmCode: 'PW-FARM', houseName: '测试鸡舍' }] } }));
  await page.route('**/api/crud/brd_farms**', route => route.fulfill({ json: [{ farm_code: 'PW-FARM', farm_name: '测试养殖场' }] }));
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ json: [{ house_code: 'PW-HOUSE', farm_code: 'PW-FARM', house_name: '测试鸡舍', house_type: 'LAYER' }] }));
  await mockBreedDictionary(page);
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
  await mockArchive(page, 'flocks', () => [{ flock_no: 'ACCEPTANCE-FLOCK', farm_code: farm.farm_code, farm_name: farm.farm_code, house_code: house.house_code, breed_code: BREED_CODE, breed_type: '海兰褐', status: 'LAYING', current_qty: 100 }],
    [farm.farm_name, house.house_name, 'Hy-Line Brown', ...(translated ? ['Mengsai farm', 'ເຮືອນສອງ'] : [])]);
  await page.route('**/api/lookup/farms**', async route => { await new Promise(resolve => setTimeout(resolve, 250)); await route.fulfill({ json: { data: [{ ...farm, farmCode: farm.farm_code, farmName: farm.farm_name }] } }); });
  await page.route('**/api/lookup/houses**', async route => { await new Promise(resolve => setTimeout(resolve, 350)); await route.fulfill({ json: { data: [{ ...house, houseCode: house.house_code, farmCode: farm.farm_code, houseName: house.house_name }] } }); });
  await mockBreedDictionary(page);
  await page.route('**/api/master-data/runtime/supplier/active**', route => route.fulfill({ json: [] }));
  await page.route('**/api/crud/brd_farms**', route => route.fulfill({ status: 403, json: { message: 'master maintenance forbidden' } }));
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ status: 403, json: { message: 'master maintenance forbidden' } }));
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
  const aliases = translated ? ['Mengsai farm', 'ເຮືອນສອງ'] : [];
  for (const query of ['ACCEPTANCE-FLOCK', farm.farm_code, farm.farm_name, house.house_code, house.house_name, '海兰褐', 'Hy-Line Brown', ...aliases]) {
    const response = page.waitForResponse(result => {
      const url = new URL(result.url());
      return url.pathname === '/api/v3/farm/archive/flocks' && url.searchParams.get('search') === query;
    });
    await search.fill(query);
    expect((await response).ok()).toBe(true);
    await expect(row).toBeVisible();
  }
  await search.fill('UNMATCHED');
  await expect(row).toHaveCount(0);
  await search.fill('');
  await row.locator('button').first().click();
  const dialog = page.getByRole('dialog');
  const farmField = dialog.getByLabel('归属养殖场', { exact: true });
  const houseField = dialog.getByLabel('当前鸡舍', { exact: true });
  await expect(farmField).toHaveValue(`${farm.farm_name}（${farm.farm_code}）`);
  await expect(houseField).toHaveValue(`${house.house_name}（${house.house_code}）`);
  await expect(farmField).not.toBeEditable();
  await expect(houseField).not.toBeEditable();
});

test('flock missing-name fallback displays each code once; henhouse keeps the reference hierarchy', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/lookup/farms**', route => route.fulfill({ json: { data: [{ farmCode: 'EMPTY-FARM', farmName: '' }] } }));
  await page.route('**/api/lookup/houses**', route => route.fulfill({ json: { data: [{ houseCode: 'EMPTY-HOUSE', farmCode: 'EMPTY-FARM', houseName: '' }] } }));
  await mockArchive(page, 'flocks', () => [{ flock_no: 'FALLBACK', farm_code: 'EMPTY-FARM', house_code: 'EMPTY-HOUSE', breed_code: BREED_CODE, status: 'LAYING' }]);
  await page.route('**/api/crud/brd_farms**', route => route.fulfill({ json: [{ farm_code: 'EMPTY-FARM', farm_name: '' }] }));
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ json: [{ house_code: 'EMPTY-HOUSE', house_name: '', farm_code: 'EMPTY-FARM' }] }));
  await mockBreedDictionary(page);
  await page.goto('/breeding/flock');
  const row = page.locator('tbody tr').filter({ hasText: 'FALLBACK' });
  await expect(row.locator('td').nth(1)).toHaveText('EMPTY-FARM');
  await expect(row.locator('td').nth(2)).toHaveText('EMPTY-HOUSE');
  await mockArchive(page, 'houses', () => [{ house_code: 'HOUSE_MS_02', house_name: '2号鸡舍', farm_code: 'EMPTY-FARM', status: 'ACTIVE', archive_birds: 0 }]);
  await page.route('**/api/crud/brd_houses**', route => route.fulfill({ json: [{ house_code: 'HOUSE_MS_02', house_name: '2号鸡舍', farm_code: 'EMPTY-FARM', status: 'ACTIVE' }] }));
  await page.goto('/breeding/henhouse');
  const houseCell = page.locator('tbody tr').filter({ hasText: 'HOUSE_MS_02' }).locator('td').first();
  await expect(houseCell.locator('div > div').first()).toHaveText('2号鸡舍');
  await expect(houseCell).toContainText('HOUSE_MS_02');
  for (const lang of ['lo', 'en']) {
    await page.locator('header select').selectOption(lang);
    await expect(houseCell.locator('div > div').first()).toHaveText('2号鸡舍');
    await expect(houseCell).toContainText('HOUSE_MS_02');
  }
});

for (const c of [
  { route: '/quality/farm', table: 'qa_inspections', row: { inspect_no: 'QA-1', house_code: 'H-1' }, labels: ['House One（H-1）'] },
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

test('backward quality trace resolves localized names from the scoped batch result', async ({ page }) => {
  await authenticate(page, 'en');
  await page.route('**/api/**', route => route.fulfill({ json: { data: [], total: 0 } }));
  await page.route('**/api/quality/trace/backward?**', route => {
    expect(new URL(route.request().url()).searchParams.get('batch_no')).toBe('B-1');
    return route.fulfill({ json: {
      traces: [{ batch_detail: { batch_no: 'B-1', warehouse_code: 'WH-1', warehouse_name: 'Warehouse One',
        warehouse_name_en: 'Warehouse One', location_code: 'LOC-1', location_name: 'Location One',
        qty: '12', unit: 'EA', status: 'AVAILABLE' } }],
      shipments: [], lineage: [], allocations: [], allocationPage: null,
    } });
  });
  await page.goto('/quality/backward');
  await page.getByRole('textbox', { name: 'Batch No.' }).fill('B-1');
  await page.getByRole('button', { name: 'Traceability', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'B-1' });
  await expect(row).toContainText('Warehouse One（WH-1）');
  await expect(row).toContainText('Location One（LOC-1）');
});

test('breeding alerts distinguish a house code from a historical name without duplicate labels', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', route => route.fulfill({ json: { data: [], total: 0 } }));
  const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  // The merged medication MVP owns withdrawal alerts. Match its scoped
  // response (including joined house_name), not the retired CRUD read.
  await page.route('**/api/farm/medication-records/withdrawals', route => route.fulfill({ json: { data: [
    { id: 1, house_code: 'H-1', house_name: '正式鸡舍', medication_code: '药品甲', withdraw_until: soon },
    { id: 2, house_name: '历史鸡舍名称', medication_code: '药品乙', withdraw_until: soon },
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
