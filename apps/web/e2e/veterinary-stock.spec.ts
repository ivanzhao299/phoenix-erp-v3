import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

test('a veterinarian plans and executes a flock vaccination using a real warehouse material identity', async ({ page }) => {
  await authenticateMockPage(page, { username: 'vet-fixture', role: 'ROLE_VET', roles: ['ROLE_VET'],
    permissions: ['MENU_FARM_VET:V,C,E'], store_code: 'VET-COMPANY' });
  const flock = { flock_no: 'FLOCK-TEST', house_code: 'HOUSE-TEST', farm_code: 'FARM-TEST',
    company_code: 'VET-COMPANY', site_code: 'SITE-TEST', current_qty: 70 };
  const medicine = { material_code: 'MAT-TEST', material_name: '测试疫苗', unit: '瓶' };
  const lot = { ...medicine, batch_no: 'WMS-TEST', warehouse_code: 'WH-TEST', qty_available: 15 };
  let plan: Record<string, unknown> | undefined;
  let execution: Record<string, unknown> | undefined;
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let data: unknown = [];
    if (req.method() === 'GET') {
      if (path === '/api/farm/vet/flocks') data = [flock];
      if (path === '/api/farm/immune/vaccines') data = [medicine];
      if (path === '/api/farm/immune/lots') data = [lot];
      if (path === '/api/farm/immune/plans') data = plan ? [plan] : [];
    } else if (req.method() === 'POST' && path === '/api/farm/immune/plans') {
      const input = req.postDataJSON();
      plan = { ...input, id: 1, status: 'PLANNED', planned_issue_lines: input.issue_lines };
      data = plan;
    } else if (req.method() === 'POST' && path === '/api/farm/immune/plans/1/execute') {
      execution = req.postDataJSON();
      data = { id: 1 };
    } else {
      throw new Error('Unexpected fixture write: ' + path);
    }
    await route.fulfill({ json: { code: 200, data } });
  });
  await page.goto('/breeding/immune');
  await page.getByRole('button', { name: '新增免疫计划' }).click();
  await page.getByLabel('鸡群批次', {exact: true}).selectOption(flock.flock_no);
  await expect(page.getByLabel('计划免疫羽数')).toHaveValue('70');
  await page.getByLabel('疫苗', {exact: true}).selectOption(medicine.material_code);
  await page.getByLabel('计划免疫日期').fill('2026-11-17');
  await page.getByLabel('ERP库存批次').selectOption(lot.batch_no);
  await page.getByLabel('计划耗用数量').fill('3');
  await page.getByRole('button', {name: '建立计划'}).click();
  await expect.poll(() => plan).toMatchObject({ material_code: 'MAT-TEST', planned_heads: 70,
    issue_lines: [{ inventory_batch_no: 'WMS-TEST', unit_code: '瓶', qty: 3 }] });
  await page.getByRole('button', {name: '执行', exact: true}).click();
  await page.getByLabel('实际免疫羽数').fill('49');
  await page.getByLabel('实际耗用数量').fill('2');
  await page.getByRole('button', {name: '确认实际耗用并执行'}).click();
  await expect.poll(() => execution).toMatchObject({ actual_heads: 49,
    issue_lines: [{inventory_batch_no: 'WMS-TEST', unit_code: '瓶', qty: 2}] });
});
