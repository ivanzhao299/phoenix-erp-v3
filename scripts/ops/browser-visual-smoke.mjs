#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};
const hasArg = (name) => args.includes(name);

const baseUrl = getArg('--base-url', process.env.BASE_URL || 'https://erp.eggslao.com').replace(/\/+$/, '');
const outputDir = getArg('--output-dir', 'docs/ops/runs');
const screenshotsDir = getArg('--screenshots-dir', 'output/playwright/product-pages');
const timeoutMs = Number(getArg('--timeout-ms', process.env.SMOKE_TIMEOUT_MS || '20000'));
const strict = hasArg('--strict');
const generatedAt = new Date().toISOString();

const pages = [
  { name: 'dashboard', route: '/dashboard', mustContain: ['系统仪表盘'], authOk: true },
  { name: 'system-health', route: '/system/health', mustContain: ['系统监控'], authOk: true },
  { name: 'system-alerts', route: '/system/alerts', mustContain: ['异常告警', '告警中心'], authOk: true },
  { name: 'uat-readiness', route: '/uat', mustContain: ['上线准备度', 'UAT'], authOk: true },
  { name: 'inventory-turnover', route: '/analytics/inventory', mustContain: ['库存周转分析'], authOk: true },
  { name: 'sales-inventory-management', route: '/sales2/inventory', mustContain: ['库存管理'], authOk: true },
  { name: 'device-monitor', route: '/breeding/device', mustContain: ['设备监控总览'], authOk: true },
  { name: 'procurement-payment-new', route: '/procurement2/payments/new', mustContain: ['新建付款单'], authOk: true },
  { name: 'procurement-orders-new', route: '/procurement2/orders/new', mustContain: ['采购'], authOk: true },
  { name: 'approval-todo', route: '/workflow/tasks/todo', mustContain: ['审批'], authOk: true },
  { name: 'shareholder-capital', route: '/shareholders/capital', mustContain: ['资本流管理'], authOk: true },
  { name: 'mobile-device', route: '/mobile/device', mustContain: ['设备'], authOk: true },
  { name: 'mobile-expenses', route: '/mobile/expenses', mustContain: ['报销'], authOk: true },
];

const failPatterns = [
  '当前页面加载失败',
  '页面异常',
  'Application error',
  'Unhandled Runtime Error',
  'NEXT_NOT_FOUND',
  'HTTP 500',
  'inconsistent types deduced for parameter',
  'Cannot read properties of undefined',
  'Minified React error',
];

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'PhoenixERP-BrowserVisualSmoke/1.0',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
    });
    const text = await response.text();
    return { ok: true, status: response.status, text: text.slice(0, 120000) };
  } catch (error) {
    return { ok: false, status: 0, text: '', error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function safeName(name) {
  return name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'browser-visual-smoke-latest.json');
  const mdPath = join(outputDir, 'browser-visual-smoke-latest.md');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  const lines = [
    '# Browser Visual Smoke',
    '',
    `Generated at: ${result.generated_at}`,
    `Base URL: ${result.base_url}`,
    `Decision: ${result.summary.decision}`,
    `Screenshots: ${result.screenshots_dir}`,
    '',
    '## Summary',
    '',
    `- PASS: ${result.summary.pass}`,
    `- WARN: ${result.summary.warn}`,
    `- FAIL: ${result.summary.fail}`,
    `- SKIP: ${result.summary.skip}`,
    '',
    '## Pages',
    '',
    '| status | page | route | screenshot | detail |',
    '|---|---|---|---|---|',
  ];
  for (const item of result.pages) {
    const detail = [
      item.http_status ? `http=${item.http_status}` : '',
      item.reason || '',
      item.matched_fail_pattern ? `pattern=${item.matched_fail_pattern}` : '',
      item.text_length != null ? `text=${item.text_length}` : '',
    ].filter(Boolean).join('; ') || '-';
    const shot = item.screenshot ? basename(item.screenshot) : '-';
    lines.push(`| ${item.status} | ${item.name} | ${item.route} | ${shot} | ${detail} |`);
  }
  lines.push(
    '',
    '## Safety',
    '',
    '- Codex CLI executed: No.',
    '- DB write executed: No.',
    '- Migration executed: No.',
    '- Deployment executed: No.',
    '- Push executed: No.',
  );
  writeFileSync(mdPath, `${lines.join('\n')}\n`);
  return { jsonPath, mdPath };
}

function summarize(items, skipped = false) {
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const fail = counts.FAIL || 0;
  const warn = counts.WARN || 0;
  const skip = counts.SKIP || 0;
  return {
    pass: counts.PASS || 0,
    warn,
    fail,
    skip,
    decision: skipped ? 'SKIP_PLAYWRIGHT_UNAVAILABLE' : fail ? 'FAIL' : warn ? 'GO_WITH_WARNINGS' : 'GO',
  };
}

function npxAvailable() {
  try {
    execFileSync('npx', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(screenshotsDir, { recursive: true });

if (!npxAvailable()) {
  const skipped = pages.map((page) => ({ ...page, status: 'SKIP', reason: 'npx unavailable; browser smoke not executed' }));
  const result = {
    generated_at: generatedAt,
    base_url: baseUrl,
    screenshots_dir: screenshotsDir,
    strict,
    summary: summarize(skipped, true),
    pages: skipped,
    writes_executed: false,
    migration_executed: false,
    deploy_executed: false,
    push_executed: false,
  };
  const paths = writeReports(result);
  console.log(`browser-visual-smoke: ${result.summary.decision}`);
  console.log(`json: ${paths.jsonPath}`);
  console.log(`md: ${paths.mdPath}`);
  if (strict) process.exitCode = 1;
  process.exit();
}

const rawPages = [];
let skippedByPlaywright = false;
for (const page of pages) {
  const url = `${baseUrl}${page.route}`;
  const screenshot = join(screenshotsDir, `${safeName(page.name)}.png`);
  const http = await fetchWithTimeout(url);
  const record = {
    name: page.name,
    route: page.route,
    url,
    screenshot,
    http_status: http.status,
    text_length: http.text.length,
  };
  try {
    execFileSync('npx', [
      '--yes',
      'playwright',
      'screenshot',
      '--full-page',
      '--timeout',
      String(timeoutMs),
      '--viewport-size',
      '1440,1100',
      '--lang',
      'zh-CN',
      url,
      screenshot,
    ], { stdio: 'pipe' });
  } catch (error) {
    skippedByPlaywright = true;
    record.status = 'SKIP';
    record.reason = 'playwright screenshot failed';
    record.detail = String(error?.stderr || error?.stdout || error?.message || error).slice(0, 1000);
    rawPages.push(record);
    continue;
  }
  const matchedFail = failPatterns.find((pattern) => http.text.includes(pattern));
  const hasLogin = /登录|登陆|账号|密码|Sign in|Login/i.test(http.text);
  const hasRequired = (page.mustContain || []).some((signal) => http.text.includes(signal));
  if (!http.ok) {
    record.status = strict ? 'FAIL' : 'WARN';
    record.reason = http.error || 'http fetch failed';
  } else if (http.status >= 500 || matchedFail) {
    record.status = 'FAIL';
    record.reason = http.status >= 500 ? '5xx response' : 'page failure text';
    record.matched_fail_pattern = matchedFail || '';
  } else if (http.status === 404) {
    record.status = 'FAIL';
    record.reason = 'route returned 404';
  } else if (hasLogin && page.authOk) {
    record.status = 'WARN';
    record.reason = 'auth required; screenshot captured but product page content not visible';
  } else if (!hasRequired) {
    record.status = 'WARN';
    record.reason = 'expected page signal missing in server response';
  } else if (http.text.length < 80) {
    record.status = 'WARN';
    record.reason = 'low response text length';
  } else {
    record.status = 'PASS';
  }
  rawPages.push(record);
}

const result = {
  generated_at: generatedAt,
  base_url: baseUrl,
  screenshots_dir: screenshotsDir,
  strict,
  summary: summarize(rawPages, skippedByPlaywright && rawPages.every((page) => page.status === 'SKIP')),
  pages: rawPages,
  writes_executed: false,
  migration_executed: false,
  deploy_executed: false,
  push_executed: false,
};
const paths = writeReports(result);

console.log(`browser-visual-smoke: ${result.summary.decision}`);
console.log(`pass: ${result.summary.pass}`);
console.log(`warn: ${result.summary.warn}`);
console.log(`fail: ${result.summary.fail}`);
console.log(`skip: ${result.summary.skip}`);
console.log(`json: ${paths.jsonPath}`);
console.log(`md: ${paths.mdPath}`);
console.log(`screenshots: ${resolve(screenshotsDir)}`);

if (result.summary.fail > 0 || (strict && result.summary.skip > 0)) process.exitCode = 1;
