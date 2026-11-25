import { expect, test } from '@playwright/test';
import { authenticateMockPage } from './support/auth';

const operator = { username: 'production-fixture', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };

test.beforeEach(async ({ page }) => {
  await authenticateMockPage(page, operator);
  await page.route('**/api/**', route => route.fulfill({ json: { code: 200, data: [] } }));
});

test('scoped feed ledger distinguishes issues and blocks writes after a failed day read', async ({ page }) => {
  let fail = false;
  await page.route('**/api/farm/feed/scoped/rollout', route => route.fulfill({ json: { code: 200, data: { phase: 'ACTIVE' } } }));
  await page.route('**/api/farm/feed/scoped/farms', route => route.fulfill({
    json: { code: 200, data: [{ company_code: 'CO', farm_code: 'A', farm_name: '一号场', status: 'ACTIVE', canWrite: true }] },
  }));
  await page.route('**/api/farm/feed/scoped/day?**', route => {
    if (fail) return route.fulfill({ status: 503, json: { message: 'fixture' } });
    const date = new URL(route.request().url()).searchParams.get('date');
    return route.fulfill({ json: { code: 200, data: { date, company_code: 'CO', farm_code: 'A', version: 0,
      warehouseCoverage: 'ALL', rows: [{ materialCode: 'CORN', name: '样料', unit: 'kg', issued: '7', movements: [] }],
    } } });
  });
  await page.goto('/breeding/feed');
  await expect(page.getByRole('columnheader', { name: '仓储发放' })).toBeVisible();
  await page.getByRole('spinbutton', { name: '样料 · 实际耗用' }).fill('4');
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  fail = true;
  await page.locator('input[type=date]').fill('2026-11-18');
  await expect(page.getByRole('alert').filter({ hasText: '读取失败' })).toBeVisible();
  await expect(page.getByText('样料', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
});

test('equipment alert page renders transport and partial data errors as unknown', async ({ page }) => {
  let mode = 'transport';
  await page.route('**/api/v3/iot/devices/all-summary', route => {
    if (mode === 'transport') return route.fulfill({ status: 503, json: { message: 'fixture' } });
    if (mode === 'partial') return route.fulfill({ json: {
      ok: true, data: { summary: { totalAlarms: 0, diagnosticCode: 'DB_QUERY_FAILED' }, houses: [], recentAlarms: [] },
    } });
    return route.fulfill({ json: {
      ok: true, data: { summary: { totalAlarms: 0, diagnosticCode: 'OK' },
        houses: [{ houseCode: 'H1', dataFreshness: 'normal', onlineRate: 100 }], recentAlarms: [] },
    } });
  });
  await page.goto('/breeding/device-alerts');
  await expect(page.getByRole('alert').filter({ hasText: /读取失败|IoT|设备告警查询不完整/ })).toContainText('503');
  await expect(page.getByText('当前所有鸡舍环境指标正常，无告警', { exact: true })).toHaveCount(0);
  mode = 'partial';
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /读取失败|IoT|设备告警查询不完整/ })).toContainText('设备告警查询不完整');
  mode = 'healthy';
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /读取失败|IoT|设备告警查询不完整/ })).toHaveCount(0);
  await expect(page.getByText('本次查询未返回告警', { exact: true })).toBeVisible();
});
