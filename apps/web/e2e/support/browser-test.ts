import { test as base, chromium } from '@playwright/test';

/** Optional existing Chrome CDP transport; regular CI keeps Playwright's browser. */
export const test = process.env.PLAYWRIGHT_CDP_URL ? base.extend({
  browser: [async ({}, use) => {
    const browser = await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL!);
    await use(browser);
    await browser.close();
  }, { scope: 'worker' }],
}) : base;
