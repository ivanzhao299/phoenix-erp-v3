#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
const apiUrl = getArg('--api-url', process.env.API_URL || baseUrl).replace(/\/+$/, '');
const timeoutMs = Number(getArg('--timeout-ms', process.env.SMOKE_TIMEOUT_MS || '12000'));
const strict = hasArg('--strict');

const GENERATED_AT = new Date().toISOString();
const FAIL_PATTERNS = [
  /当前页面加载失败/,
  /页面异常/,
  /Application error/i,
  /Unhandled Runtime Error/i,
  /NEXT_NOT_FOUND/i,
  /HTTP 500/,
  /inconsistent types deduced for parameter/i,
];

const KEY_PAGES = [
  {
    route: '/uat',
    file: 'apps/web/src/app/(admin)/uat/page.tsx',
    required: ['上线准备度', 'authHeaders', '/api/uat/readiness'],
    forbidden: [],
  },
  {
    route: '/system/health',
    file: 'apps/web/src/app/(admin)/system/health/page.tsx',
    required: ['系统监控'],
    forbidden: [],
  },
  {
    route: '/system/alerts',
    file: 'apps/web/src/app/(admin)/system/alerts/page.tsx',
    required: ['/api/system/alerts', '/api/system/monitor/health', 'append-only'],
    forbidden: [],
  },
  {
    route: '/dashboard',
    file: 'apps/web/src/app/(admin)/dashboard/page.tsx',
    required: ['系统仪表盘'],
    forbidden: [],
  },
  {
    route: '/mobile/device',
    file: 'apps/web/src/app/(mobile)/mobile/device/page.tsx',
    required: ['/api/v3/iot/devices/all-summary', '/api/v3/iot/devices/sync-health', '诊断'],
    forbidden: [],
  },
  {
    route: '/procurement2/payments/new',
    file: 'apps/web/src/app/(admin)/procurement2/payments/new/page.tsx',
    extraFiles: ['apps/web/src/app/(admin)/procurement2/payments/PaymentForm.tsx'],
    required: ['ProjectSelector', 'ManagedAttachmentUploader'],
    forbidden: [],
  },
  {
    route: '/workflow/monitor',
    file: 'apps/web/src/app/(admin)/workflow/monitor/page.tsx',
    required: ['审批'],
    forbidden: [],
  },
];

const API_PROBES = [
  { path: '/api/health', expect: [200], public: true },
  { path: '/api/v2/sales/health', expect: [200], public: true },
  { path: '/api/system/monitor/health', expect: [401, 403], protected: true },
  { path: '/api/system/alerts', expect: [401, 403], protected: true },
  { path: '/api/uat/readiness', expect: [401, 403], protected: true },
  { path: '/api/workflow/my-tasks', expect: [401, 403], protected: true },
  { path: '/api/v3/iot/devices/sync-health', expect: [401, 403], protected: true },
  { path: '/uploads/contracts/__phoenix_runtime_smoke_probe__', expect: [401, 403, 404], protected: true },
];

function pass(name, detail = {}) {
  return { name, status: 'PASS', ...detail };
}

function fail(name, detail = {}) {
  return { name, status: 'FAIL', ...detail };
}

function warn(name, detail = {}) {
  return { name, status: 'WARN', ...detail };
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
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
        'User-Agent': 'PhoenixERP-RuntimeSmoke/1.0',
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

function checkStaticPages() {
  const checks = [];
  for (const page of KEY_PAGES) {
    const text = [page.file, ...(page.extraFiles || [])]
      .map((file) => readText(file))
      .filter(Boolean)
      .join('\n');
    if (!text) {
      checks.push(fail(`static:${page.route}`, { file: page.file, reason: 'source file missing' }));
      continue;
    }
    const missing = page.required.filter((item) => !text.includes(item));
    const forbidden = page.forbidden.filter((item) => text.includes(item));
    if (missing.length || forbidden.length) {
      checks.push(fail(`static:${page.route}`, { file: [page.file, ...(page.extraFiles || [])].join(','), missing, forbidden }));
    } else {
      checks.push(pass(`static:${page.route}`, { file: [page.file, ...(page.extraFiles || [])].join(',') }));
    }
  }
  return checks;
}

function checkStaticForbiddenReferences() {
  const checks = [];
  const attachmentFiles = [
    'apps/web/src/app/(admin)/store-payment/page.tsx',
    'apps/web/src/app/(admin)/procurement2/orders/page.tsx',
    'apps/web/src/app/(admin)/procurement2/requests/page.tsx',
    'apps/web/src/app/(admin)/procurement2/shareholder-funds/page.tsx',
    'apps/web/src/app/(admin)/finance2/reimbursements/page.tsx',
  ];
  for (const file of attachmentFiles) {
    const text = readText(file);
    if (!text) {
      checks.push(warn(`static-attachment:${file}`, { reason: 'source file not found; skipped' }));
      continue;
    }
    const risky = [];
    if (/href\s*=\s*["'`]\s*\/uploads\//.test(text)) risky.push('direct /uploads href');
    if (/window\.open\([^)]*\/uploads\//.test(text)) risky.push('window.open /uploads');
    if (/rawUrl/.test(text) && !/rawUrl\s*[!=]==?\s*null|rawUrl.*异常|rawUrl.*禁用/.test(text)) risky.push('rawUrl reference without obvious fail-closed handling');
    checks.push(risky.length ? fail(`static-attachment:${file}`, { risky }) : pass(`static-attachment:${file}`));
  }
  return checks;
}

async function checkHttpPages() {
  const checks = [];
  for (const page of KEY_PAGES) {
    const url = `${baseUrl}${page.route}`;
    const result = await fetchWithTimeout(url);
    if (!result.ok) {
      checks.push(strict ? fail(`http-page:${page.route}`, { url, error: result.error }) : warn(`http-page:${page.route}`, { url, error: result.error }));
      continue;
    }
    const hasFailText = FAIL_PATTERNS.find((pattern) => pattern.test(result.text));
    if (result.status >= 500 || hasFailText) {
      checks.push(fail(`http-page:${page.route}`, { url, http_status: result.status, reason: hasFailText ? String(hasFailText) : '5xx' }));
    } else if (result.status === 404) {
      checks.push(fail(`http-page:${page.route}`, { url, http_status: result.status, reason: '404 route missing' }));
    } else {
      checks.push(pass(`http-page:${page.route}`, { url, http_status: result.status }));
    }
  }
  return checks;
}

async function checkApiProbes() {
  const checks = [];
  for (const probe of API_PROBES) {
    const url = `${apiUrl}${probe.path}`;
    const result = await fetchWithTimeout(url);
    if (!result.ok) {
      checks.push(strict ? fail(`api:${probe.path}`, { url, error: result.error }) : warn(`api:${probe.path}`, { url, error: result.error }));
      continue;
    }
    if (result.status >= 500) {
      checks.push(fail(`api:${probe.path}`, { url, http_status: result.status, reason: '5xx' }));
      continue;
    }
    if (!probe.expect.includes(result.status)) {
      checks.push(fail(`api:${probe.path}`, {
        url,
        http_status: result.status,
        expected: probe.expect,
        reason: probe.protected ? 'protected endpoint did not fail closed as expected' : 'unexpected status',
      }));
      continue;
    }
    checks.push(pass(`api:${probe.path}`, { url, http_status: result.status }));
  }
  return checks;
}

function summarize(checks) {
  const counts = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {});
  const failCount = counts.FAIL || 0;
  const warnCount = counts.WARN || 0;
  return {
    pass: counts.PASS || 0,
    warn: warnCount,
    fail: failCount,
    decision: failCount > 0 ? 'FAIL' : warnCount > 0 ? 'GO_WITH_WARNINGS' : 'GO',
  };
}

function writeReports(result) {
  mkdirSync(outputDir, { recursive: true });
  const jsonPath = join(outputDir, 'runtime-smoke-check-latest.json');
  const mdPath = join(outputDir, 'runtime-smoke-check-latest.md');
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);

  const lines = [
    '# Runtime Smoke Check',
    '',
    `Generated at: ${result.generated_at}`,
    `Base URL: ${result.base_url}`,
    `API URL: ${result.api_url}`,
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
  for (const check of result.checks) {
    const detail = Object.entries(check)
      .filter(([key]) => !['name', 'status'].includes(key))
      .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : String(value)}`)
      .join('; ');
    lines.push(`| ${check.status} | ${check.name} | ${detail || '-'} |`);
  }
  writeFileSync(mdPath, `${lines.join('\n')}\n`);
  return { jsonPath, mdPath };
}

const checks = [
  ...checkStaticPages(),
  ...checkStaticForbiddenReferences(),
  ...await checkHttpPages(),
  ...await checkApiProbes(),
];
const result = {
  generated_at: GENERATED_AT,
  base_url: baseUrl,
  api_url: apiUrl,
  strict,
  summary: summarize(checks),
  checks,
  writes_executed: false,
  migration_executed: false,
  deploy_executed: false,
  push_executed: false,
};
const paths = writeReports(result);

console.log(`runtime-smoke-check: ${result.summary.decision}`);
console.log(`pass: ${result.summary.pass}`);
console.log(`warn: ${result.summary.warn}`);
console.log(`fail: ${result.summary.fail}`);
console.log(`json: ${paths.jsonPath}`);
console.log(`md: ${paths.mdPath}`);

if (result.summary.fail > 0) process.exitCode = 1;
