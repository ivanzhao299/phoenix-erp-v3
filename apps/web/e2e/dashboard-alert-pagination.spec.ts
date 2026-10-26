import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { authenticateMockPage } from './support/auth';

for (const width of [1280, 390]) {
  test(`alert pagination, bounded long text and shrink at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await authenticateMockPage(page, { username: 'admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] });
    let count = 0;
    await page.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') throw Error('Unexpected mutation');
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/dashboard/kpi') return route.fulfill({ json: { code: 200, data: { alertList: Array.from({ length: count }, (_, i) => ({ id: i, type: 'warning', text: `预警 ${i} ${'长文本校验'.repeat(80)}` })) } } });
      return route.fulfill({ json: [] });
    });
    await page.goto('/dashboard');
    const card = page.getByRole('heading', { name: '业务实时预警', exact: true }).locator('..');
    await expect(card.getByText('今日无待处理预警')).toBeVisible();
    const list = card.locator('div').filter({ has: page.getByText('今日无待处理预警', { exact: true }) }).first();
    expect(await list.evaluate(el => el.clientHeight)).toBe(265);
    for (count of [1, 5, 6, 12]) {
      await page.getByRole('button', { name: '刷新数据', exact: true }).click();
      await expect(card.getByRole('button', { name: '已处理', exact: true })).toHaveCount(Math.min(5, count));
      const boundedList = card.getByRole('button', { name: '已处理', exact: true }).first().locator('../..');
      expect(await boundedList.evaluate(el => el.clientHeight)).toBe(265);
      expect(await boundedList.evaluate(el => el.scrollHeight)).toBeGreaterThan(265);
      if (count === 1 || count === 5) await expect(card.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
    }
    await card.getByRole('button', { name: '下一页', exact: true }).click();
    await card.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(card.getByRole('button', { name: '已处理', exact: true })).toHaveCount(2);
    await card.getByRole('button', { name: '已处理', exact: true }).first().click();
    await card.getByRole('button', { name: '已处理', exact: true }).first().click();
    await expect(card.getByRole('button', { name: '已处理', exact: true })).toHaveCount(5);
    await expect(card.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
    count = 1;
    await page.getByRole('button', { name: '刷新数据', exact: true }).click();
    await expect(card.getByRole('button', { name: '已处理', exact: true })).toHaveCount(1);
    await expect(card.getByRole('button', { name: '上一页', exact: true })).toBeDisabled();
    await page.screenshot({ path: `../../artifacts/six-issue-delivery/alerts-${width}.png`, fullPage: true });
  });
}
