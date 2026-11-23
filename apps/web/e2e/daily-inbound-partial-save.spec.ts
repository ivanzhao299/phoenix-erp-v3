import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

type DailyPayload = Record<string, unknown> & { eggs_by_grade: Record<string, number> };
const contextPath = '/api/v2/inventory/production-inbound-documents/context';
const codes = ['GRADE_0', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'DIRTY', 'CRACKED', 'BROKEN', 'DAMAGED'];

// An OFF house saves one atomic daily report.
test.beforeEach(async ({ page }) => {
  await authenticateMockPage(page, {
    username: 'daily-atomic-fixture', role: 'ROLE_FARM_MGR', roles: ['ROLE_FARM_MGR'],
    permissions: ['MENU_FARM_DAILY:V,C,E'], store_code: 'FIXTURE-COMPANY',
  });
  await page.route('**/api/**', async route => {
    const { pathname: path, searchParams } = new URL(route.request().url());
    if (route.request().method() !== 'GET') throw new Error(`Unexpected mutation: ${path}`);
    let json: unknown = [];
    if (path === '/api/crud/brd_houses') json = [{ house_code: 'FIXTURE-H1', house_name: '测试鸡舍', farm_code: 'FIXTURE-COMPANY' }];
    if (path === '/api/crud/brd_flocks') json = [{ flock_no: 'FIXTURE-F1', house_code: 'FIXTURE-H1', current_qty: 1000 }];
    if (path === '/api/lookup/houses') json = { code: 200, data: [{
      houseCode: 'FIXTURE-H1', houseName: '测试鸡舍', companyCode: 'FIXTURE-COMPANY', ownershipResolved: true,
    }] };
    if (path === '/api/lookup/egg-source-profile') json = { code: 200, data: null };
    if (path === contextPath) {
      expect(Object.fromEntries(searchParams)).toEqual({ companyCode: 'FIXTURE-COMPANY', houseCode: 'FIXTURE-H1' });
      json = { state: 'OFF', firstProductionDate: null };
    }
    if (path === '/api/v3/farm/daily-hen-report') {
      json = { code: 200, rows: [{ house_code: 'FIXTURE-H1', occupancy_id: null, has_daily_log: false, current_qty: 1000 }] };
    }
    if (path === '/api/lookup/product-grades') json = codes.map((grade_code, sort_order) => ({ grade_code, grade_name: grade_code, sort_order, status: 'ACTIVE' }));
    await route.fulfill({ json });
  });
});

for (const status of [201, 400]) {
  test(`single-day atomic save (${status}) never posts a second shift or automatic inventory`, async ({ page }) => {
    const mutations: string[] = [];
    const payloads: DailyPayload[] = [];
    await page.route('**/api/**', async route => {
      if (route.request().method() === 'GET') return route.fallback();
      const path = new URL(route.request().url()).pathname;
      mutations.push(path);
      if (path !== '/api/v3/farm/daily-logs') throw new Error(`Unexpected mutation: ${path}`);
      payloads.push(route.request().postDataJSON());
      return route.fulfill({ status, json: status === 201 ? { code: 200 } : { message: 'fixture atomic report rejected' } });
    });
    await page.goto('/breeding/daily');
    await expect(page.locator('input[type=number][aria-label]')).toHaveCount(codes.length);
    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
    await page.locator('input[type=date]').first().fill(businessDate);
    await page.getByRole('spinbutton', { name: 'GRADE_0 · 数量(枚)', exact: true }).fill('11');
    await page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true }).fill('22');
    await page.getByRole('spinbutton', { name: 'GRADE_2 · 数量(枚)', exact: true }).fill('0');
    await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
    if (status === 201) {
      await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
      for (const input of await page.locator('input[type=number][aria-label]').all()) await expect(input).toHaveValue('');
      await expect(page).toHaveURL(url =>
        url.searchParams.get('historyHouse') === 'FIXTURE-H1' && url.searchParams.get('historyDate') === businessDate);
    } else {
      await expect(page.getByText('日报提交失败：fixture atomic report rejected', { exact: false })).toBeVisible();
      await expect(page.getByRole('spinbutton', { name: 'GRADE_0 · 数量(枚)', exact: true })).toHaveValue('11');
      await expect(page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true })).toHaveValue('22');
      await expect(page.getByText('日报已成功提交！', { exact: false })).toHaveCount(0);
    }
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ house_code: 'FIXTURE-H1', flock_no: 'FIXTURE-F1', farm_code: 'FIXTURE-COMPANY', log_date: businessDate, eggs_by_grade: { GRADE_0: 11, GRADE_1: 22 } });
    expect(payloads[0]).not.toHaveProperty('shift');
    expect(payloads[0]).not.toHaveProperty('eggs_produced');
    expect(mutations).toEqual(['/api/v3/farm/daily-logs']);
    await expect(page.getByRole('button', { name: '同步入销售库存', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('an unverified range cannot send a daily report', async ({ page }) => {
  const writes: string[] = [];
  await page.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() !== 'GET') {
      writes.push(pathname);
      return route.fulfill({ status: 500 });
    }
    if (pathname === contextPath) {
      return route.fulfill({ status: 403, json: { message: '无权查看该鸡舍的正式日报范围' } });
    }
    return route.fallback();
  });
  await page.goto('/breeding/daily');
  await page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true }).fill('22');
  await expect(page.getByText('范围尚未核实，请刷新。', { exact: false })).toBeVisible();
  const submit = page.getByRole('button', { name: '提交日报', exact: true });
  await expect(submit).toHaveCount(2);
  for (const button of await submit.all()) {
    await expect(button).toBeDisabled();
    await button.evaluate(element => (element as HTMLButtonElement).click());
  }
  expect(writes).toEqual([]);
});

test('rejected atomic report retries the complete unchanged day only after explicit submit', async ({ page }) => {
  const payloads: DailyPayload[] = [];
  await page.route('**/api/v3/farm/daily-logs', async route => {
    expect(route.request().method()).toBe('POST');
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: payloads.length === 1 ? 400 : 201, json: { message: 'fixture retry required' } });
  });
  await page.goto('/breeding/daily');
  await page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true }).fill('33');
  await page.getByRole('spinbutton', { name: 'DIRTY · 数量(枚)', exact: true }).fill('4');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('日报提交失败：fixture retry required', { exact: false })).toBeVisible();
  expect(payloads).toHaveLength(1);
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(payloads[1].eggs_by_grade).toEqual({ GRADE_1: 33, DIRTY: 4 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('mortality-only day saves without inventing egg quantities or opening inventory', async ({ page }) => {
  const payloads: DailyPayload[] = [];
  await page.route('**/api/v3/farm/daily-logs', async route => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { code: 200 } });
  });
  await page.goto('/breeding/daily');
  await page.getByText('死亡(羽)', { exact: true }).locator('..').locator('input').fill('2');
  await page.getByText('淘汰(羽)', { exact: true }).locator('..').locator('input').fill('3');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({ mortality_qty: 2, elimination_qty: 3, eggs_by_grade: {} });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('initial house and occupancy loading never exposes editable mortality fields', async ({ page }) => {
  let releaseHouses!: () => void;
  let releaseOccupancy!: () => void;
  const housesGate = new Promise<void>(resolve => { releaseHouses = resolve; });
  const occupancyGate = new Promise<void>(resolve => { releaseOccupancy = resolve; });
  let sawHouses!: () => void;
  let sawOccupancy!: () => void;
  const housesRequested = new Promise<void>(resolve => { sawHouses = resolve; });
  const occupancyRequested = new Promise<void>(resolve => { sawOccupancy = resolve; });
  await page.route('**/api/crud/brd_houses*', async route => {
    sawHouses();
    await housesGate;
    await route.fallback();
  });
  await page.route('**/api/v3/farm/daily-hen-report?*', async route => {
    sawOccupancy();
    await occupancyGate;
    await route.fulfill({ json: { rows: [] } });
  });
  const deaths = page.getByText('死亡(羽)', { exact: true }).locator('..').locator('input');
  try {
    await page.goto('/breeding/daily');
    await housesRequested;
    await expect(page.getByText('死亡(羽)', { exact: true })).toBeVisible();
    await expect(deaths).toHaveCount(0);
    releaseHouses();
    await occupancyRequested;
    await expect(deaths).toHaveCount(0);
    releaseOccupancy();
    await expect(deaths).toBeVisible();
    await deaths.fill('2');
    await page.getByText('淘汰(羽)', { exact: true }).locator('..').locator('input').fill('3');
    await expect(deaths).toHaveValue('2');
  } finally {
    releaseHouses();
    releaseOccupancy();
  }
});

test('changed date requires its own occupancy result and keeps managed mortality in the event ledger', async ({ page }) => {
  const payloads: DailyPayload[] = [];
  let releaseChangedDate!: () => void;
  const changedDateGate = new Promise<void>(resolve => { releaseChangedDate = resolve; });
  let sawChangedDate!: () => void;
  const changedDateRequested = new Promise<void>(resolve => { sawChangedDate = resolve; });
  await page.route('**/api/v3/farm/daily-hen-report?*', async route => {
    const changed = new URL(route.request().url()).searchParams.get('date') === '2026-10-16';
    if (changed) { sawChangedDate(); await changedDateGate; }
    await route.fulfill({ json: { rows: changed ? [{ house_code: 'FIXTURE-H1', occupancy_id: 7, current_qty: 1000 }] : [] } });
  });
  await page.route('**/api/v3/farm/daily-logs', async route => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { code: 200 } });
  });
  try {
    await page.goto('/breeding/daily');
    const deaths = page.getByText('死亡(羽)', { exact: true }).locator('..').locator('input');
    await deaths.fill('2');
    await page.getByRole('spinbutton', { name: 'GRADE_0 · 数量(枚)', exact: true }).fill('1');
    await page.locator('input[type=date]').first().fill('2026-10-16');
    await changedDateRequested;
    await expect(deaths).toHaveCount(0);
    await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
    await expect(page.getByText('占栏来源尚未核实，请刷新后再提交', { exact: true })).toBeVisible();
    expect(payloads).toHaveLength(0);
    releaseChangedDate();
    await expect(page.getByText('已接续事件账：死淘请使用生命周期单据；', { exact: false })).toBeVisible();
    await page.getByRole('spinbutton', { name: 'GRADE_0 · 数量(枚)', exact: true }).fill('');
    await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
    await expect(page.getByText('请至少录入一项数据（产蛋数、死淘或饲料用量）后再提交', { exact: true })).toBeVisible();
    expect(payloads).toHaveLength(0);
    await page.getByRole('spinbutton', { name: 'GRADE_0 · 数量(枚)', exact: true }).fill('1');
    await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
    await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).not.toHaveProperty('mortality_qty');
    expect(payloads[0]).not.toHaveProperty('elimination_qty');
    expect(payloads[0]).not.toHaveProperty('mortality_reason');
    expect(payloads[0]).not.toHaveProperty('culling_reason');
  } finally {
    releaseChangedDate();
  }
});

test('immediate mortality submit reads the visible controls and rejects negative quantities', async ({ page }) => {
  const payloads: DailyPayload[] = [];
  await page.route('**/api/v3/farm/daily-logs', async route => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { code: 200 } });
  });
  await page.goto('/breeding/daily');
  const deaths = page.getByText('死亡(羽)', { exact: true }).locator('..').locator('input');
  await expect(deaths).toBeVisible();
  // A native control can change before React commits its corresponding state.
  // Keep the control changes and click in one browser task: no artificial settle delay.
  await expect(page.getByRole('button', { name: '提交日报', exact: true }).first()).toBeEnabled();
  const submitVisible = async (mortality: string, elimination: string) => {
    await page.evaluate(({ mortality, elimination }) => {
      const field = (label: string) => Array.from(document.querySelectorAll('span'))
        .find(node => node.textContent === label)?.parentElement?.querySelector('input');
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(field('死亡(羽)'), mortality);
      setValue.call(field('淘汰(羽)'), elimination);
      const button = Array.from(document.querySelectorAll('button')).find(node => node.textContent?.trim() === '提交日报');
      button!.click();
    }, { mortality, elimination });
  };
  await submitVisible('-2', '3');
  await expect(page.getByText('死淘数量必须为非负数', { exact: true })).toBeVisible();
  expect(payloads).toHaveLength(0);
  await submitVisible('2', '3');
  await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({ mortality_qty: 2, elimination_qty: 3, eggs_by_grade: {} });
});

test('blank and zero-only days are rejected while culling-only day saves', async ({ page }) => {
  const payloads: DailyPayload[] = [];
  await page.route('**/api/v3/farm/daily-logs', async route => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { code: 200 } });
  });
  await page.goto('/breeding/daily');
  const culling = page.getByText('淘汰(羽)', { exact: true }).locator('..').locator('input');
  await expect(culling).toBeVisible();
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('请至少录入一项数据（产蛋数、死淘或饲料用量）后再提交', { exact: true })).toBeVisible();
  expect(payloads).toHaveLength(0);
  await culling.fill('0');
  await page.getByRole('spinbutton', { name: 'GRADE_0 · 数量(枚)', exact: true }).fill('0');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  expect(payloads).toHaveLength(0);
  await culling.fill('3');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('日报已成功提交！', { exact: false })).toBeVisible();
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({ mortality_qty: 0, elimination_qty: 3, eggs_by_grade: {} });
});

test('fractional inline grade is rejected before any report or inventory mutation', async ({ page }) => {
  const mutations: string[] = [];
  await page.route('**/api/**', async route => {
    if (route.request().method() === 'GET') return route.fallback();
    mutations.push(route.request().url());
    throw new Error('Fractional quantities must not reach an API mutation');
  });
  await page.goto('/breeding/daily');
  await page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true }).fill('1.5');
  await page.getByRole('button', { name: '提交日报', exact: true }).first().click();
  await expect(page.getByText('分级数量必须为非负整数', { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
  await expect(page.getByRole('spinbutton', { name: 'GRADE_1 · 数量(枚)', exact: true })).toHaveValue('1.5');
});
