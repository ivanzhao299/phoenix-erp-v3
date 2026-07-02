#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return fallback;
};
const hasArg = (name) => args.includes(name);

const outputDir = getArg('--output-dir', 'docs/ops/runs');
const baseUrl = getArg('--base-url', process.env.BASE_URL || 'https://erp.eggslao.com').replace(/\/+$/, '');
const timeoutMs = Number(getArg('--timeout-ms', process.env.SMOKE_TIMEOUT_MS || '12000'));
const strict = hasArg('--strict');
const generatedAt = new Date().toISOString();

const FAIL_PATTERNS = [
  /当前页面加载失败/,
  /页面异常/,
  /Application error/i,
  /Unhandled Runtime Error/i,
  /NEXT_NOT_FOUND/i,
  /HTTP 500/,
  /inconsistent types deduced for parameter/i,
];

const PRODUCT_PAGES = [
  {
    name: 'dashboard',
    route: '/dashboard',
    file: 'apps/web/src/app/(admin)/dashboard/page.tsx',
    valueSignals: ['系统仪表盘', '核心运营指标', 'DashboardKPIs'],
    qualitySignals: ['快速导航', 'MENU_DASHBOARD'],
    forbidden: [],
  },
  {
    name: 'system-health',
    route: '/system/health',
    file: 'apps/web/src/app/(admin)/system/health/page.tsx',
    valueSignals: ['系统监控', '系统整体状态', '数据库连接'],
    qualitySignals: ['最后检测', '刷新'],
    forbidden: [],
  },
  {
    name: 'system-alerts',
    route: '/system/alerts',
    file: 'apps/web/src/app/(admin)/system/alerts/page.tsx',
    valueSignals: ['异常告警', 'append-only', '/api/system/alerts'],
    qualitySignals: ['值班触达', '刷新'],
    forbidden: [],
  },
  {
    name: 'uat-readiness',
    route: '/uat',
    file: 'apps/web/src/app/(admin)/uat/page.tsx',
    valueSignals: ['上线准备度', 'authHeaders', '/api/uat/readiness'],
    qualitySignals: ['UAT', '刷新'],
    forbidden: ['inconsistent types deduced for parameter'],
  },
  {
    name: 'inventory-turnover',
    route: '/analytics/inventory',
    file: 'apps/web/src/app/(admin)/analytics/inventory/page.tsx',
    valueSignals: ['库存周转分析', '等级分布', '最近批次记录'],
    qualitySignals: ['库存量', '临期批次', '刷新'],
    forbidden: [],
  },
  {
    name: 'sales-inventory-management',
    route: '/sales2/inventory',
    file: 'apps/web/src/app/(admin)/sales2/inventory/page.tsx',
    valueSignals: ['库存管理', 'StatCard', 'fmtDate'],
    qualitySignals: ['gridTemplateColumns', '批次库存', '损耗分析'],
    forbidden: ['当前页面加载失败', 'Application error', 'Unhandled Runtime Error'],
  },
  {
    name: 'device-monitor',
    route: '/breeding/device',
    file: 'apps/web/src/app/(admin)/breeding/device/page.tsx',
    valueSignals: ['设备监控总览', "const API = '/api/v3/iot/devices'", 'all-summary', 'sync-health'],
    qualitySignals: ['诊断', '暂无采集数据', '手动采集'],
    forbidden: [],
  },
  {
    name: 'device-ops',
    route: '/breeding/device-ops',
    file: 'apps/web/src/app/(admin)/breeding/device-ops/page.tsx',
    valueSignals: ['设备运维中心', 'const API = "/api/farm-device"', '属性字典'],
    qualitySignals: ['栏舍映射', '采集日志', '运维审计'],
    forbidden: ['(dictEditRow as any)[field]', '当前页面加载失败', 'Application error', 'Unhandled Runtime Error'],
  },
  {
    name: 'procurement-payment-new',
    route: '/procurement2/payments/new',
    file: 'apps/web/src/app/(admin)/procurement2/payments/new/page.tsx',
    extraFiles: ['apps/web/src/app/(admin)/procurement2/payments/PaymentForm.tsx'],
    valueSignals: ['新建付款单', 'ProjectSelector', 'ManagedAttachmentUploader'],
    qualitySignals: ['保存草稿', '项目', '付款凭证'],
    forbidden: [],
  },
  {
    name: 'procurement-orders',
    route: '/procurement2/orders/new',
    file: 'apps/web/src/app/(admin)/procurement2/orders/new/page.tsx',
    extraFiles: ['apps/web/src/app/(admin)/procurement2/orders/OrderForm.tsx'],
    valueSignals: ['采购', 'MaterialPicker', 'DocumentAutofillPanel'],
    qualitySignals: ['采购明细', '合同', '保存'],
    forbidden: [],
  },
  {
    name: 'approval-todo',
    route: '/workflow/tasks/todo',
    file: 'apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx',
    valueSignals: ['审批', '同意', '不同意'],
    qualitySignals: ['转交', '意见', '刷新'],
    forbidden: [],
  },
  {
    name: 'shareholder-capital',
    route: '/shareholders/capital',
    file: 'apps/web/src/app/(admin)/shareholders/capital/page.tsx',
    valueSignals: ['资本流管理', '冲销', '新增资本流'],
    qualitySignals: ['已确认到账', '不可直接修改余额', '查看'],
    forbidden: [],
  },
  {
    name: 'mobile-reimbursement',
    route: '/mobile/expenses',
    file: 'apps/web/src/app/(mobile)/mobile/expenses/page.tsx',
    valueSignals: ['报销', '上传'],
    qualitySignals: ['凭证', '创建后可在', '提交'],
    forbidden: [],
    optional: true,
  },
];

function makeCheck(status, name, detail = {}) {
  return { status, name, ...detail };
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'PhoenixERP-ProductPageSmoke/1.0',
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

function staticPageChecks() {
  const checks = [];
  for (const page of PRODUCT_PAGES) {
    const files = [page.file, ...(page.extraFiles || [])];
    const textParts = files.map((file) => readText(file)).filter(Boolean);
    if (!textParts.length) {
      checks.push(makeCheck(page.optional ? 'WARN' : 'FAIL', `static:${page.name}`, {
        route: page.route,
        reason: 'source file missing',
        file: page.file,
      }));
      continue;
    }
    const text = textParts.join('\n');
    const missingValueSignals = page.valueSignals.filter((signal) => !text.includes(signal));
    const missingQualitySignals = page.qualitySignals.filter((signal) => !text.includes(signal));
    const forbiddenHits = page.forbidden.filter((signal) => text.includes(signal));
    const risky = [];
    if (/href\s*=\s*["'`]\s*\/uploads\//.test(text)) risky.push('direct /uploads href');
    if (/window\.open\([^)]*\/uploads\//.test(text)) risky.push('window.open /uploads');
    if (/storage_path|storagePath/.test(text)) risky.push('storage path exposure');
    if (missingValueSignals.length || forbiddenHits.length || risky.length) {
      checks.push(makeCheck('FAIL', `static:${page.name}`, {
        route: page.route,
        files: files.join(','),
        missing_value_signals: missingValueSignals.join(','),
        missing_quality_signals: missingQualitySignals.join(','),
        forbidden_hits: forbiddenHits.join(','),
        risky: risky.join(','),
      }));
    } else if (missingQualitySignals.length) {
      checks.push(makeCheck('WARN', `static:${page.name}`, {
        route: page.route,
        files: files.join(','),
        missing_quality_signals: missingQualitySignals.join(','),
      }));
    } else {
      checks.push(makeCheck('PASS', `static:${page.name}`, { route: page.route, files: files.join(',') }));
    }
  }
  return checks;
}

async function httpPageChecks() {
  const checks = [];
  for (const page of PRODUCT_PAGES) {
    const url = `${baseUrl}${page.route}`;
    const result = await fetchWithTimeout(url);
    if (!result.ok) {
      checks.push(makeCheck(strict && !page.optional ? 'FAIL' : 'WARN', `http:${page.name}`, { route: page.route, error: result.error }));
      continue;
    }
    const failText = FAIL_PATTERNS.find((pattern) => pattern.test(result.text));
    if (result.status >= 500 || failText) {
      checks.push(makeCheck('FAIL', `http:${page.name}`, {
        route: page.route,
        http_status: result.status,
        reason: failText ? String(failText) : '5xx',
      }));
    } else if (result.status === 404 && !page.optional) {
      checks.push(makeCheck('FAIL', `http:${page.name}`, { route: page.route, http_status: result.status, reason: 'route missing' }));
    } else {
      checks.push(makeCheck(result.status === 404 ? 'WARN' : 'PASS', `http:${page.name}`, { route: page.route, http_status: result.status }));
    }
  }
  return checks;
}

function summarize(checks) {
  const counts = checks.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const fail = counts.FAIL || 0;
  const warn = counts.WARN || 0;
  return {
    pass: counts.PASS || 0,
    warn,
    fail,
    decision: fail ? 'FAIL' : warn ? 'GO_WITH_WARNINGS' : 'GO',
  };
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'product-page-smoke-latest.json');
  const mdPath = join(outputDir, 'product-page-smoke-latest.md');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
  const lines = [
    '# Product Page Smoke',
    '',
    `Generated at: ${result.generated_at}`,
    `Base URL: ${result.base_url}`,
    `Decision: ${result.summary.decision}`,
    '',
    '## Summary',
    '',
    `- PASS: ${result.summary.pass}`,
    `- WARN: ${result.summary.warn}`,
    `- FAIL: ${result.summary.fail}`,
    '',
    '## Checks',
    '',
    '| status | check | detail |',
    '|---|---|---|',
  ];
  for (const item of result.checks) {
    const detail = Object.entries(item)
      .filter(([key]) => !['status', 'name'].includes(key))
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('; ');
    lines.push(`| ${item.status} | ${item.name} | ${detail || '-'} |`);
  }
  lines.push('', '## Safety', '', '- DB write executed: No.', '- Migration executed: No.', '- Deployment executed: No.', '- Push executed: No.');
  writeFileSync(mdPath, `${lines.join('\n')}\n`);
  return { jsonPath, mdPath };
}

mkdirSync(dirname(join(outputDir, 'placeholder')), { recursive: true });
const checks = [
  ...staticPageChecks(),
  ...await httpPageChecks(),
];
const result = {
  generated_at: generatedAt,
  base_url: baseUrl,
  strict,
  pages: PRODUCT_PAGES.map(({ name, route, file }) => ({ name, route, file })),
  summary: summarize(checks),
  checks,
  writes_executed: false,
  migration_executed: false,
  deploy_executed: false,
  push_executed: false,
};
const paths = writeReports(result);

console.log(`product-page-smoke: ${result.summary.decision}`);
console.log(`pass: ${result.summary.pass}`);
console.log(`warn: ${result.summary.warn}`);
console.log(`fail: ${result.summary.fail}`);
console.log(`json: ${paths.jsonPath}`);
console.log(`md: ${paths.mdPath}`);

if (result.summary.fail > 0) process.exitCode = 1;
